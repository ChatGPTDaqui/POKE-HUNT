// Port de js/systems/OfflineSimSystem.js — driver headless de "avanco no
// tempo" compartilhado pelos 2 sistemas "voce nao estava vendo": o catch-up
// de throttle do browser (aba minimizada/oculta, ainda aberta) e o relatorio
// real de Farm Offline (mostrado no boot depois que a aba/app foi fechada
// de verdade, ver CLAUDE.md).
//
// Deliberadamente NAO reimplementa movimento/combate/auto-heal — ele
// dirige `stepFn` (controller.ts#stepWorld), a MESMA funcao que o loop ao
// vivo chama a cada tick fixo, so que em modo silent e num loop apertado em
// vez de uma chamada por frame. `world` passado aqui e um objeto solto
// (nao o draft do worldStore ao vivo) — quem chama (controller.ts/Fase 5)
// decide se opera sobre um snapshot descartavel ou commita o resultado de
// volta na store no final; esta funcao so muta o `world` que recebeu,
// exatamente como o stepFn original fazia sobre um objeto JS qualquer.
import type { PokeInstance } from '@/data/pokes'
import type { RarityKey } from '@/data/rarity'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from '../types'
import { podeAutoReanimar } from './autoSystem'

export interface KillResult {
  /** Loot do abate MAIS o que a auto-venda rendeu neste evento, se rendeu. */
  gold: number
  /**
   * Ouro que veio da AUTO-VENDA da captura deste abate (0 quando nao houve).
   *
   * Separado de `gold` so pra o relatorio poder dizer de onde o ouro veio — o
   * total ja esta em `gold`, e e ele que alimenta taxa e resumo.
   */
  ouroDeAutoVenda: number
  xp: number
  leveledUp: boolean
  trainerLeveledUp: boolean
  isShiny: boolean
  captured: boolean
  capturedPoke: PokeInstance | null
  droppedItems: string[]
  /**
   * PH-169/PH-171: os 3 campos abaixo so vem preenchidos na entrada SINTETICA
   * que `stepWorld` empurra no bloco `playerJustFainted` (nao e um abate de
   * verdade, os campos acima ficam zerados/false/null nela) — carregam o que
   * `applyDeathExpPenalty` de fato debitou, pro resumo do flush poder dizer
   * pro client quanto de queda de XP e LEGITIMA nesta janela.
   */
  playerFainted?: boolean
  expLostToPenalty?: number
  leveledDown?: boolean
}

// Tetos de trabalho por chamada, pra um gap muito longo nao travar (nem
// fazer o navegador matar) um dispositivo fraco. Dois limites independentes:
//
// 1. `maxSteps` limita a CONTAGEM DE ITERACOES — o passo cresce alem do
//    `stepSeconds` pedido quando o gap e enorme, trocando fidelidade de
//    combate por um loop limitado em vez de ilimitado (3 dias a 0.1s sao
//    2.6M passos de combate completo; so desktop sobrevive a isso).
// 2. `maxWallClockMs` limita o TEMPO REAL gasto, checado a cada
//    CLOCK_CHECK_EVERY iteracoes. Estourar o orcamento NAO joga o resto do
//    gap fora na hora: o passo e quadruplicado (ate MAX_COARSEN_ROUNDS
//    vezes) pra o restante ainda ser simulado, so que com menos fidelidade —
//    perder precisao e melhor que perder as horas do jogador. So quando nem
//    isso basta e que para com `truncated:true`, o que ainda e melhor que
//    travar a thread principal ate o navegador matar a pagina (o que
//    significava que o save nunca acontecia, e a mesma simulacao condenada
//    rodava de novo a cada carregamento).
// 250k mantem o cap de 6h do Farm Offline no passo pedido de 0.1s
// (6h/0.1 = 216k) — ou seja, zero mudanca de fidelidade no caso que o jogo
// realmente usa; so gaps maiores que isso (o catch-up de segundo plano, que
// nao tem cap de tempo) ficam com passo mais grosso.
const DEFAULT_MAX_STEPS = 250000
const DEFAULT_MAX_WALL_CLOCK_MS = 2500
const CLOCK_CHECK_EVERY = 512
// Cada rodada de "coarsening" quadruplica o passo, entao o trabalho que
// falta cai 4x — 3 rodadas cobrem ate 64x o passo original, o que fecha
// qualquer gap realista. Cada rodada ganha meio orcamento novo, entao o
// custo total nunca passa de ~2.5x maxWallClockMs.
const COARSEN_FACTOR = 4
const MAX_COARSEN_ROUNDS = 3

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

export interface OfflineSimSummary {
  requestedSeconds: number
  simulatedSeconds: number
  kills: number
  gold: number
  xp: number
  captures: { speciesId: string; level: number; isShiny: boolean; rarity: RarityKey }[]
  shinySeen: number
  shinyCaptured: number
  /** Quantas capturas a auto-venda vendeu na hora, e por quanto no total. */
  autoVendidos: number
  ouroDeAutoVenda: number
  itemsGained: Record<string, number>
  itemsConsumed: Record<string, number>
  pokeLeveledUp: boolean
  trainerLeveledUp: boolean
  /**
   * Quantos niveis o POKE em campo e o Treinador ganharam no periodo.
   *
   * Medido como diferenca entre o nivel do inicio e o do fim, e nao contando
   * `leveledUp` por abate: um unico abate pode subir mais de um nivel (EXP alta
   * contra POKE de nivel baixo), e o booleano por abate nao distingue "subiu 1"
   * de "subiu 4".
   */
  pokeLevelsGained: number
  trainerLevelsGained: number
  /** Nivel do POKE em campo no inicio e no fim — o relatorio mostra "12 → 15". */
  pokeLevelBefore: number
  pokeLevelAfter: number
  trainerLevelBefore: number
  trainerLevelAfter: number
  stoppedEarly: boolean // desmaiou sem jeito de auto-reanimar (sem toggle, ou sem `revive` sobrando)
  truncated: boolean // acabou o orcamento de tempo real antes de cobrir o gap inteiro
  stepSeconds: number // o passo realmente usado (pode ser mais grosso que o pedido — ver DEFAULT_MAX_STEPS)
  /**
   * PH-168: quantas vezes o POKE do jogador desmaiou nesta janela, e quanto de
   * XP a penalidade de morte (`applyDeathExpPenalty`) debitou no total — o
   * orcamento de queda LEGITIMA que `aplicarEstadoDoServidor` (autoridade.ts)
   * usa pra distinguir penalidade real de descompasso de janela do flush.
   */
  mortesDoJogador: number
  expPerdidaPorMorte: number
}

export function createEmptySummary(): OfflineSimSummary {
  return {
    requestedSeconds: 0,
    simulatedSeconds: 0,
    kills: 0,
    gold: 0,
    xp: 0,
    captures: [],
    shinySeen: 0,
    shinyCaptured: 0,
    autoVendidos: 0,
    ouroDeAutoVenda: 0,
    itemsGained: {},
    itemsConsumed: {},
    pokeLeveledUp: false,
    trainerLeveledUp: false,
    pokeLevelsGained: 0,
    trainerLevelsGained: 0,
    pokeLevelBefore: 0,
    pokeLevelAfter: 0,
    trainerLevelBefore: 0,
    trainerLevelAfter: 0,
    stoppedEarly: false,
    truncated: false,
    stepSeconds: 0,
    mortesDoJogador: 0,
    expPerdidaPorMorte: 0,
  }
}

export type StepFn = (world: WorldState, dt: number, opts: { silent: boolean }) => KillResult[]

export interface SimulateWorldSecondsParams {
  world: WorldState
  gameState: GameStateStore
  seconds: number
  stepSeconds: number
  stepFn: StepFn
  maxSteps?: number
  maxWallClockMs?: number
}

export function simulateWorldSeconds({
  world,
  gameState,
  seconds,
  stepSeconds,
  stepFn,
  maxSteps = DEFAULT_MAX_STEPS,
  maxWallClockMs = DEFAULT_MAX_WALL_CLOCK_MS,
}: SimulateWorldSecondsParams): OfflineSimSummary {
  const summary = createEmptySummary()
  summary.requestedSeconds = seconds
  // Guarda contra gap nao-finito/negativo (um dispositivo cujo relogio ande
  // pra tras no meio da sessao faria este loop rodar pra sempre).
  if (!Number.isFinite(seconds) || seconds <= 0 || !world.player) return summary

  const itemsBefore = { ...gameState.items }
  const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn)
  summary.pokeLevelBefore = world.player.poke.level
  summary.trainerLevelBefore = gameState.trainer.level
  const stepCap = Math.max(1, maxSteps)
  let step = Math.max(Math.max(0.01, stepSeconds), seconds / stepCap)
  let deadline = nowMs() + maxWallClockMs
  let coarsenRounds = 0
  let sinceClockCheck = 0
  let remaining = seconds

  while (remaining > 0) {
    const dt = Math.min(step, remaining)
    remaining -= dt

    const kills = stepFn(world, dt, { silent: true }) || []
    for (const result of kills) {
      // PH-168: entrada sintetica de desmaio (ver KillResult) nao e abate —
      // conta a parte, ANTES do `summary.kills += 1` de baixo, senao um
      // desmaio sem abate no mesmo tick inflaria a contagem de abates.
      if (result.playerFainted) {
        summary.mortesDoJogador += 1
        summary.expPerdidaPorMorte += result.expLostToPenalty ?? 0
        continue
      }
      summary.kills += 1
      summary.gold += result.gold
      summary.xp += result.xp
      if (result.leveledUp) summary.pokeLeveledUp = true
      if (result.trainerLeveledUp) summary.trainerLeveledUp = true
      if (result.isShiny) summary.shinySeen += 1
      if (result.ouroDeAutoVenda > 0) {
        summary.autoVendidos += 1
        summary.ouroDeAutoVenda += result.ouroDeAutoVenda
      }
      // POKE auto-vendido NAO entra em `captures`: essa lista alimenta o "o que
      // voce capturou" do relatorio, e listar um POKE que nao esta na mochila
      // manda o jogador procurar o que ele nao vai achar. O que ele recebeu
      // aparece como ouro (em `gold`) e na contagem de `autoVendidos`.
      if (result.captured && result.capturedPoke) {
        summary.captures.push({
          speciesId: result.capturedPoke.speciesId,
          level: result.capturedPoke.level,
          isShiny: Boolean(result.capturedPoke.isShiny),
          rarity: result.capturedPoke.rarity,
        })
        if (result.capturedPoke.isShiny) summary.shinyCaptured += 1
      }
    }

    if (world.player.fainted) {
      // A PERGUNTA E DE `autoSystem`, E NAO DAQUI (PH-508).
      //
      // Esta linha era `!isBossHunt && autoToggles.autoRevive &&
      // gameState.hasItem('revive', 1)` — e o ultimo termo, o id LITERAL do
      // Revive comum, era o bug: quem usa o item e `melhorRevive`, que aceita a
      // familia inteira (`max_revive` incluso). Um jogador com 149 Max Revives
      // e zero Revive comum era tratado como "sem jeito de reanimar", a
      // ausencia encerrava por desmaio e ele era expulso da hunt TODA vez que
      // voltava ao jogo.
      //
      // `podeAutoReanimar` responde as tres partes num lugar so — a hunt BOSS
      // (que precisa ser espelhada aqui: sem isso o laco rodava as 6 horas com
      // um cadaver em campo, sem `stoppedEarly` e sem abate, e o relatorio nao
      // tinha como explicar o zero), o toggle, e o inventario.
      if (!podeAutoReanimar(gameState, isBossHunt)) {
        summary.stoppedEarly = true
        break
      }
    }

    sinceClockCheck += 1
    if (sinceClockCheck >= CLOCK_CHECK_EVERY) {
      sinceClockCheck = 0
      if (nowMs() >= deadline) {
        if (coarsenRounds < MAX_COARSEN_ROUNDS && remaining > step) {
          coarsenRounds += 1
          step *= COARSEN_FACTOR
          deadline = nowMs() + maxWallClockMs / 2
        } else {
          summary.truncated = true
          break
        }
      }
    }
  }

  summary.stepSeconds = step

  summary.simulatedSeconds = seconds - Math.max(0, remaining)

  // `world.player.poke` pode ter sido SUBSTITUIDO no meio (evolucao troca a
  // instancia), entao le do mundo agora em vez de guardar a referencia la de
  // cima. Nao ha troca de POKE em campo durante a simulacao, entao o "antes" e
  // o "depois" sao sempre o mesmo POKE.
  summary.pokeLevelAfter = world.player.poke.level
  summary.trainerLevelAfter = gameState.trainer.level
  summary.pokeLevelsGained = Math.max(0, summary.pokeLevelAfter - summary.pokeLevelBefore)
  summary.trainerLevelsGained = Math.max(0, summary.trainerLevelAfter - summary.trainerLevelBefore)

  const itemIds = new Set([...Object.keys(itemsBefore), ...Object.keys(gameState.items)])
  for (const itemId of itemIds) {
    const delta = (gameState.items[itemId] || 0) - (itemsBefore[itemId] || 0)
    if (delta > 0) summary.itemsGained[itemId] = delta
    else if (delta < 0) summary.itemsConsumed[itemId] = -delta
  }

  return summary
}
