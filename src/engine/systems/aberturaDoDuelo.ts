// PH-552: a ABERTURA do combate duelo — a apresentacao que antecede a luta.
//
// Nos jogos, um duelo entre treinadores nao comeca com os dois POKEs ja em
// campo se batendo: cada treinador joga a bola ("Vai X!!"), o POKE sai dela,
// faz uma pose de ameaca, e so entao as habilidades de entrada (Intimidate,
// Download, clima) resolvem e a luta comeca. O dono pediu exatamente isso pra
// TODO combate duelo (`mapDef.encarada`: arena PvP amistosa/ranqueada/bot,
// Campeao Lance, covis de lendario), a CADA entrada de POKE em campo — a
// abertura inicial e toda substituicao, dos dois lados. O modo livre nao
// passa por aqui.
//
// A FILA. Cada entrada vira etapas de `ETAPA_DA_ABERTURA_SEGUNDOS` (2 s):
//
//   abertura inicial:  casa-bola, casa-ameaca, vis-bola, vis-ameaca,
//                      casa-habilidade*, vis-habilidade*
//   substituicao:      bola, ameaca, habilidade* — so de quem entra
//
// (*) so quando a Trait tem hook de entrada (`traitTemHookDeEntrada`); um
// POKE sem Intimidate/Download/Trace/clima nao gasta 2 s fazendo nada.
//
// ORDEM: o DONO DA CASA apresenta primeiro em tudo (`world.casaEhOJogador`).
// Casa e o rival na arena ranqueada/bot, no Lance e no covil; no amistoso e o
// anfitriao (quem convidou). As habilidades resolvem DEPOIS dos dois em campo,
// na ordem casa -> visitante, pra o Intimidate do primeiro ter alvo — dois
// entrando no mesmo tick (os dois lados cairam juntos) usam a mesma fila da
// abertura inicial, e e por isso que `apresentarEntrada` recebe uma LISTA:
// quem chama junta as entradas do tick e chama uma vez.
//
// ENQUANTO `world.aberturaDoDuelo != null` NADA MAIS ANDA: `stepWorld` e
// `stepArena` pulam movimento e combate (ninguem age, ninguem anda, HP e status
// nao tickam, sem alvo, sem round), do mesmo jeito que a contagem regressiva
// de intro fazia — que, alias, SAIU dos duelos: era 5 s de tela parada antes
// de a apresentacao existir. So os timers de pose e os efeitos visuais
// continuam correndo, pra a bola e as poses tocarem.
//
// O QUE CADA ETAPA FAZ NA ENTIDADE:
//   bola        nasce com `nascendo` (invisivel; o cliente desenha a bola se
//               abrindo e o balao "Vai X!!" no ponto). Aparece no FIM da etapa.
//   ameaca      `animOverride: 'Pose'` (fallback Hop -> Shoot em battleSprites).
//   habilidade  `animOverride: 'Swing'`; `resolveEntryHook` roda no FIM da
//               etapa, UMA vez, e marca `entradaProcessada`. No duelo o hook de
//               entrada e disparado SO daqui — `updateCombat` nao o dispara no
//               engajar (ver o guard `mapDef.encarada` la), senao o Intimidate
//               sairia duas vezes.
//
// DETERMINISMO: nada aqui consome `world.rng`; o servidor roda a mesma fila
// com o mesmo `casaEhOJogador` (vem da sessao, nao de sorteio). O efeito
// visual da bola so nasce no cliente (`silent` cala), e efeitos nao entram
// na simulacao. EFEMERO como `rodadaDeDuelo`: nao persiste no flush.
import type { AnimName } from '@/data/battleSpriteAnims'
import { captureAnimFrameDuration } from '@/data/captureAnim'
import { createWorldEffect } from '../effect'
import { isDead } from '../entity'
import type { WorldEntity, WorldState } from '../types'
import { resolveEntryHook, traitTemHookDeEntrada } from './combatSystem'

/** Duracao de cada etapa da apresentacao, em segundos de simulacao. */
export const ETAPA_DA_ABERTURA_SEGUNDOS = 2

export type LadoDoDuelo = 'casa' | 'visitante'
export type TipoDeEtapaDaAbertura = 'bola' | 'ameaca' | 'habilidade'

export interface EtapaDaAbertura {
  lado: LadoDoDuelo
  tipo: TipoDeEtapaDaAbertura
  entidadeId: string
}

export interface AberturaDoDuelo {
  fila: EtapaDaAbertura[]
  /** Posicao em `fila` da etapa em curso. */
  indice: number
  /** Segundos que faltam pra etapa em curso terminar. */
  restante: number
  /** A etapa em curso ja teve o "comeco" aplicado (pose armada, bola jogada). */
  etapaIniciada: boolean
}

/**
 * Quantos quadros da tira de captura mostram a bola voando e se abrindo —
 * as tiras de FALHA (`assets/pokeball-throw/*-fail.png`) comecam com o
 * arremesso (4 quadros) e o estouro vermelho (5 quadros) antes do balanco.
 * E exatamente "a bola solta o POKE", entao a abertura reusa esses 9 quadros
 * e para antes de a bola balancar.
 */
export const QUADROS_DA_BOLA_ABRINDO = 9

const POSE_DE_AMEACA: AnimName = 'Pose'
const POSE_DE_HABILIDADE: AnimName = 'Swing'

/** De que lado do duelo a entidade esta. */
export function ladoDaEntidade(world: Pick<WorldState, 'casaEhOJogador'>, entidade: WorldEntity): LadoDoDuelo {
  const ehCasa = entidade.kind === 'player' ? world.casaEhOJogador : !world.casaEhOJogador
  return ehCasa ? 'casa' : 'visitante'
}

/**
 * Enfileira a apresentacao de quem acabou de entrar em campo. Fora do duelo
 * nao faz nada. Chame UMA vez por tick com todas as entradas do tick, pra a
 * ordem casa -> visitante e o "habilidades depois dos dois" valerem.
 */
export function apresentarEntrada(world: WorldState, entidades: WorldEntity[]): void {
  if (!world.mapDef?.encarada) return
  const entrando = entidades.filter((e) => !isDead(e))
  if (entrando.length === 0) return

  const ordenadas = [...entrando].sort((a, b) => {
    const la = ladoDaEntidade(world, a) === 'casa' ? 0 : 1
    const lb = ladoDaEntidade(world, b) === 'casa' ? 0 : 1
    return la - lb
  })
  const fila: EtapaDaAbertura[] = []
  for (const e of ordenadas) {
    const lado = ladoDaEntidade(world, e)
    fila.push({ lado, tipo: 'bola', entidadeId: e.id }, { lado, tipo: 'ameaca', entidadeId: e.id })
  }
  for (const e of ordenadas) {
    if (traitTemHookDeEntrada(e.poke)) fila.push({ lado: ladoDaEntidade(world, e), tipo: 'habilidade', entidadeId: e.id })
  }

  for (const e of entrando) {
    e.nascendo = true
    e.targetId = null
  }
  // Quem ja esta em campo tambem para de mirar: "sem alvo" durante a abertura.
  if (world.player) world.player.targetId = null
  // O round e a encarada em curso morrem: quando a abertura acabar, o
  // proximo round abre do zero com a ordem recalculada (o que ele faria de
  // qualquer jeito com um id novo na dupla).
  world.rodadaDeDuelo = null
  world.encarada = null

  const atual = world.aberturaDoDuelo
  if (atual) {
    // Ja apresentando: as etapas novas vao pro fim da fila. A arena junta as
    // entradas do tick numa chamada so; na hunt do Lance a troca do jogador
    // e o proximo da sequencia sao pontos diferentes de `stepWorld`, entao os
    // dois caindo no MESMO tick apresentam um depois do outro, na ordem em que
    // entraram — e nao casa -> visitante. Raro (os dois caem juntos so com um
    // golpe em voo de cada lado) e sem efeito no resultado.
    atual.fila.push(...fila)
    return
  }
  world.aberturaDoDuelo = { fila, indice: 0, restante: ETAPA_DA_ABERTURA_SEGUNDOS, etapaIniciada: false }
}

/**
 * Um tick da abertura. Devolve `true` enquanto ela existir — quem chama
 * congela movimento e combate nesse caso. Roda silent ou nao: so o efeito
 * visual da bola e calado.
 */
export function tickAberturaDoDuelo(world: WorldState, dt: number, silent: boolean): boolean {
  const abertura = world.aberturaDoDuelo
  if (!abertura) return false

  if (!iniciarEtapaEmCurso(world, abertura, silent)) {
    world.aberturaDoDuelo = null
    return false
  }
  abertura.restante -= dt
  if (abertura.restante > 1e-6) return true

  const etapa = abertura.fila[abertura.indice]
  concluirEtapa(world, etapa, entidadeDaEtapa(world, etapa)!, silent)
  abertura.indice++
  abertura.etapaIniciada = false
  // Carrega a sobra pra n etapas somarem exatamente n * 2 s em passo fixo.
  abertura.restante += ETAPA_DA_ABERTURA_SEGUNDOS
  // A proxima comeca NESTE tick (a pose entra no quadro em que a anterior
  // saiu); a abertura inteira fecha quando nao ha proxima.
  if (!iniciarEtapaEmCurso(world, abertura, silent)) world.aberturaDoDuelo = null
  return true
}

/**
 * Garante que a etapa em `indice` comecou. Etapa sem entidade (saiu de campo
 * — nao acontece com tudo congelado, mas uma fila que nunca anda travaria o
 * duelo pra sempre) e pulada. `false` = a fila acabou.
 */
function iniciarEtapaEmCurso(world: WorldState, abertura: AberturaDoDuelo, silent: boolean): boolean {
  while (abertura.indice < abertura.fila.length) {
    const etapa = abertura.fila[abertura.indice]
    const entidade = entidadeDaEtapa(world, etapa)
    if (entidade) {
      if (!abertura.etapaIniciada) {
        iniciarEtapa(world, etapa, entidade, silent)
        abertura.etapaIniciada = true
      }
      return true
    }
    abertura.indice++
    abertura.etapaIniciada = false
  }
  return false
}

function entidadeDaEtapa(world: WorldState, etapa: EtapaDaAbertura): WorldEntity | null {
  if (world.player?.id === etapa.entidadeId) return world.player
  return world.enemies.find((e) => e.id === etapa.entidadeId) ?? null
}

function iniciarEtapa(world: WorldState, etapa: EtapaDaAbertura, entidade: WorldEntity, silent: boolean): void {
  if (etapa.tipo === 'bola') {
    entidade.nascendo = true
    if (silent) return
    // A bola se abre no FIM da etapa — e nesse instante que o POKE aparece.
    const duracao = QUADROS_DA_BOLA_ABRINDO * captureAnimFrameDuration()
    world.effects.push(createWorldEffect(world.counters, {
      type: 'captureAnim', x: entidade.x, y: entidade.y, targetX: entidade.x, targetY: entidade.y,
      ballItemId: 'poke_ball', success: false,
      delay: Math.max(0, ETAPA_DA_ABERTURA_SEGUNDOS - duracao),
      duration: duracao,
    }))
    return
  }
  entidade.animOverride = etapa.tipo === 'ameaca' ? POSE_DE_AMEACA : POSE_DE_HABILIDADE
}

function concluirEtapa(world: WorldState, etapa: EtapaDaAbertura, entidade: WorldEntity, silent: boolean): void {
  if (etapa.tipo === 'bola') {
    delete entidade.nascendo
    return
  }
  delete entidade.animOverride
  if (etapa.tipo === 'ameaca') {
    // Sem etapa de habilidade, a entrada fecha aqui; com ela, fecha no fim
    // da habilidade. Nos dois casos `updateCombat` nao dispara o hook.
    if (!traitTemHookDeEntrada(entidade.poke)) entidade.entradaProcessada = true
    return
  }
  entidade.entradaProcessada = true
  const oponente = oponenteDe(world, entidade)
  if (oponente) resolveEntryHook(world, entidade, oponente, silent)
}

function oponenteDe(world: WorldState, entidade: WorldEntity): WorldEntity | null {
  if (entidade.kind === 'enemy') return world.player && !isDead(world.player) ? world.player : null
  return world.enemies.find((e) => !isDead(e)) ?? null
}
