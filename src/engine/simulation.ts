// Nucleo de SIMULACAO — construcao de mundo, stepWorld, resolucao de kill.
//
// Separado de controller.ts (as acoes de UI) por um motivo concreto: este
// arquivo precisa rodar HEADLESS EM NODE, porque na Fase D o servidor passa a
// ser quem simula de verdade — o cliente vira predicao, como client-side
// prediction de FPS. Por isso aqui nao pode haver nenhum import de VALOR de
// `gameStateStore` (ele puxa o adaptador de persistencia -> lib/supabase ->
// `import.meta.env`, que so existe no bundle do navegador). `GameStateStore`
// entra so como TIPO, que o build apaga.
//
// `useToastStore` fica: e zustand puro, roda em Node sem problema. E, na
// pratica, o servidor simula sempre com `silent: true`, que ja pula toda
// notificacao daqui.
//
// Por que NAO verificar por re-simulacao (o plano original da Fase D dizia
// isso): o motor usa Math.sin/cos/atan2 no movimento e o IEEE 754 nao
// especifica essas funcoes bit-a-bit, entao navegador e Node divergem no
// ultimo bit — posicao diverge, instante de engajamento diverge, kill diverge.
// Um comparador acusaria jogador honesto. E re-simular pra conferir custa a
// MESMA CPU que simular; se vai gastar, gaste sendo a autoridade.
import { SPECIES, createPokeInstance, type PokeInstance } from '@/data/pokes'
import { mapDefParaSala, spawnPointParaSala, spawnInimigoParaSala, mapWalkRadius, isCellBlocked, nearestOpenPoint, type MapDef } from '@/data/maps'
import { getEncounter } from '@/data/enemies'
import { getItem } from '@/data/items'
import { isDamagingAbility } from '@/data/abilities'
import { traitDoPoke } from '@/data/traits'
import { getEffectiveness } from '@/data/generated/typeChart.generated'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { randInt, randRange, weightedPick } from '@/core/random'
import type { Rng } from '@/core/rng'
import { captureAnimFrameDuration, captureAnimFrameCount } from '@/data/captureAnim'
import { rarityOf, realceDaRaridade } from '@/data/rarity'
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { formatStatGains } from '@/data/statLabels'

import { createPlayerEntity, createEnemyEntity, isDead, takeDamage } from './entity'
import { createWorldEffect } from './effect'
import { updateMovement } from './systems/movementSystem'
import { updateCombat } from './systems/combatSystem'
import { aplicarStatus } from './systems/statusSystem'
import { climaAmbienteDaSala, climaDeAmbiente } from './systems/climaAmbiente'
import { updateAnimations, tickAttackAnimTimers } from './systems/animationSystem'
import { updateAutoHeal, maybeAutoCatch } from './systems/autoSystem'
import { grantExp, expRewardForEnemy, grantTrainerExp, applyDeathExpPenalty } from './systems/progressionSystem'
import { awardKillLoot } from './systems/economySystem'
import { recordKill } from './systems/farmRates'
import {
  contextoDeSpawn, lootAtivo, novaSala, nomeDaSala, registrarAbate, temSalas,
  aplicarTransicaoDeSala, garantirTransicaoDeQuotaFechada,
} from './systems/salaSystem'
import { recordPokedexKill } from './systems/pokedexSystem'
import type { KillResult } from './systems/offlineSimSystem'

import type { GameStateStore } from '@/stores/gameStateStore'
import { emptyWorldState } from './worldState'
import { toastStore } from '@/stores/toastStoreVanilla'
import type { ClimaTipo, EnemyEntity, EnemyHazards, Point, SalaAtiva, WorldState } from './types'

export const STARTER_LEVEL = 1
// Starters sempre saem previsiveis — raridade Comum, IV 75% (23/31) em toda
// stat — em vez do roll aleatorio por-instancia normal, pra a primeira
// POKE de uma run nova nao ser um outlier de sorte.
export const STARTER_RARITY = 'comum' as const
export const STARTER_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
export const DEATH_ANIM_GRACE_PERIOD = 4.0 // segundos que um inimigo derrotado fica visivel tocando a pose Faint

const formulaEngine = createFormulaEngine(FORMULAS)
export const OFFLINE_FARM_MAX_HOURS = formulaEngine.evalOrDefault('OFFLINE_FARM_MAX_HOURS', 6)
export const OFFLINE_SIM_STEP_SECONDS = formulaEngine.evalOrDefault('OFFLINE_SIM_STEP_SECONDS', 0.1)
// Mesmo passo fixo que useGameLoop.ts usa pro tick ao vivo (1/60s). PH-37: o
// resim do servidor usava OFFLINE_SIM_STEP_SECONDS (0.1s, 6x mais grosso) pra
// QUALQUER flush, inclusive o normal (<=LIMIAR_OFFLINE_SEGUNDOS). RNG e
// sorteado por evento (ataque, status), mas O INSTANTE em que um evento
// dispara depende de um cooldown cruzar zero — com passo mais grosso esse
// cruzamento acontece em outro instante simulado, desalinhando a sequencia
// de sorteios cedo. Client (1/60s) e servidor (0.1s) resimulando o MESMO
// intervalo com o MESMO rng_state divergiam so por causa do tamanho do
// passo, mesmo sem nenhuma interacao real do jogador no meio — e o POKE
// levava level-up no client que o servidor nunca confirmava.
//
// Fix paliativo: bate o passo do servidor com o do client fora do regime
// offline. Nao elimina 100% de divergencia (jogo ao vivo tem tempo real
// variavel por tick do lado do client, resim do servidor sempre fixo), mas
// fecha o desalinhamento de 6x que dominava o caso reproduzido. O jeito
// definitivo de fechar isso de vez e o flush ser refeito (ver PH-62,
// intervalo adaptativo) — nao antecipado aqui.
export const LIVE_SIM_STEP_SECONDS = 1 / 60
export const MIN_CATCHUP_GAP_SECONDS = 5
export const MIN_OFFLINE_GAP_SECONDS = 60
// Acima disso o gap caracteriza ausencia real (offline de verdade, nao so um
// respiro entre acoes) e o combate roda em modo pessimista (sem critico, dano
// no piso da variacao) — em vez da MESMA distribuicao do jogo ao vivo.
// Compartilhado entre cliente e servidor: os dois caminhos de farm offline
// (server/src/progresso.ts no flush, e o boot sem servidor aqui embaixo em
// GameShell.tsx) precisam concordar sobre quando ligar `world.pessimista`,
// senao o farm offline sem servidor renderia melhor que o ao vivo por ate
// OFFLINE_FARM_MAX_HOURS — o invariante que esse modo pessimista existe pra
// proteger (PH-15).
export const LIMIAR_OFFLINE_SEGUNDOS = 120
// De quanto em quanto tempo o debito entre relogio de parede e tempo
// simulado e reconciliado. De proposito independente de qualquer evento de
// visibilidade — ver o comentario em App.tsx#useBackgroundCatchUp.
export const CATCHUP_CHECK_INTERVAL_MS = 10000
// Orcamento de tempo real mais curto que o do Farm Offline de boot: o
// catch-up roda com o jogo ja na tela, entao a pausa e sentida como travada.
// Como o simulador engrossa o passo em vez de descartar o resto do tempo
// (ver offlineSimSystem.ts), um orcamento menor custa fidelidade, nao tempo
// de jogo perdido.
export const CATCHUP_WALL_CLOCK_BUDGET_MS = 1200

export function shinyPrefix(isShiny?: boolean): string {
  return isShiny ? '✨ ' : ''
}

// ---------- Construcao de mundo ----------

// A sequencia de sorteios ATRAVESSA as trocas de cena: quem constroi um mundo
// novo passa o `rng`/`counters` do mundo atual, entao a sessao inteira e uma
// unica sequencia derivada de uma semente so. Sem isso, cada ida ao Hospital
// reiniciaria o stream com uma semente nova e o servidor (Fase D) teria que
// rastrear uma semente por cena em vez de uma por sessao.
export type SequenciaDeSorteio = Pick<WorldState, 'rng' | 'counters' | 'seed'>

function novoMundo(carry?: SequenciaDeSorteio): WorldState {
  const base = emptyWorldState()
  if (carry) {
    base.rng = { ...carry.rng }
    base.counters = { ...carry.counters }
    // Sem isto o clima de ambiente re-sortearia a cada janela de simulacao:
    // `emptyWorldState()` sorteia uma semente nova quando ninguem passa uma, e
    // o clima e derivado dela (PH-140).
    base.seed = carry.seed
  }
  return base
}

export function buildHospitalWorld(activePoke: PokeInstance | null, hospitalSpot: Point, carry?: SequenciaDeSorteio): WorldState {
  const base = novoMundo(carry)
  const player = activePoke ? createPlayerEntity(base.counters, { poke: activePoke, x: hospitalSpot.x, y: hospitalSpot.y }) : null
  if (player && isDead(player)) player.fainted = true
  return { ...base, player, enemies: [] }
}

const SPAWN_MIN_DISTANCE = 250
const SPAWN_MARGIN = 60
const SPAWN_POINT_MAX_ATTEMPTS = 40

// Pedido explicito do usuario: POKE selvagem so nasce a media distancia e na
// LINHA DE VISAO do jogador — um cone a frente de pra onde ele esta virado
// (`player.facing`, ja mantido por MovementSystem a cada passo). Faz o
// jogador ter que andar/virar pra "descobrir" spawn novo em vez de tudo
// aparecer ao redor do ponto onde ele esta parado — o pedido era
// literalmente "criar a ideia de explorar o mapa".
const SPAWN_CONE_MIN_DISTANCE = 250 // "media distancia": nunca colado no jogador
const SPAWN_CONE_MAX_DISTANCE = 550 // nem no fim do mapa — se a tentativa nao achar celula livre nessa faixa, cai no sorteio antigo (raio do mapa inteiro) abaixo
const SPAWN_CONE_HALF_ANGLE = (55 * Math.PI) / 180 // ~110 graus de cone total
/**
 * Distancia minima ENTRE inimigos, em unidades de mundo (PH-143).
 *
 * O cone acima resolve "onde o jogador consegue ver", e so isso. Cada inimigo
 * era sorteado sem olhar onde os outros ja estavam, entao com `maxEnemies: 6`
 * (o valor das faixas em data/biomas.ts) os seis caiam na MESMA fatia de ~110
 * graus e podiam nascer colados. O resultado e um pico de dificuldade que nao
 * vem da faixa de nivel da hunt, e nada na tela denuncia que aquilo foi
 * sorteio.
 *
 * Menor que a largura util do cone de proposito: um valor grande demais nao
 * caberia na faixa 250-550 e todo spawn cairia no melhor-esforco, que e o mesmo
 * que nao ter regra.
 */
const SPAWN_ENTRE_INIMIGOS = 170
/**
 * Orcamento de tentativas quando ha vizinhos a evitar (PH-143).
 *
 * Maior que `SPAWN_POINT_MAX_ATTEMPTS`, e por geometria e nao por capricho: o
 * cone comporta os seis inimigos com folga (a area util e ~230 mil unidades²
 * contra ~136 mil que seis discos de raio 85 ocupam), mas o dardo aleatorio vai
 * ficando sem espaco conforme a regiao enche, e com 40 tentativas os ultimos
 * caiam quase sempre no melhor-esforco. Medido: a mediana da menor distancia
 * subiu de 108 para o dobro so com este orcamento.
 *
 * So custa sorteio no INSTANTE do spawn, nunca por quadro.
 */
const SPAWN_ESPACADO_MAX_ATTEMPTS = 160

// Sorteio antigo (raio do mapa inteiro, sem depender de onde o jogador esta
// olhando) — vira FALLBACK: cobre o caso sem jogador ainda (nao deveria
// acontecer nos 3 call sites reais, mas o parametro e opcional por
// seguranca) e o caso do cone nao achar celula livre em
// `SPAWN_POINT_MAX_ATTEMPTS` tentativas (corredor de body-block estreito
// demais pra caber a faixa/angulo pedidos) — sem isso um mapa apertado
// deixaria de spawnar QUALQUER inimigo, pior que nascer fora do cone.
function randomSpawnPointFullMap(rng: Rng, mapDef: MapDef): Point {
  const cx = mapDef.bounds.width / 2
  const cy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef) - SPAWN_MARGIN
  let x = cx, y = cy
  let attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = Math.sqrt(randRange(rng, 0, 1)) * radius
    x = cx + Math.cos(angle) * dist
    y = cy + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapDef.playerSpawn.x, y - mapDef.playerSpawn.y) < SPAWN_MIN_DISTANCE || isCellBlocked(mapDef, x, y))
  )
  // O laco acima sai por ESGOTAR as tentativas, entao a ultima pode ser uma
  // celula bloqueada — ele nunca prometeu ponto valido, so tentou 40 vezes.
  // Era improvavel enquanto todo mapa tinha 1400x900; com o mundo do tamanho
  // da area pintada (PH-80) um sub-bioma apertado pode nao ter faixa nenhuma
  // que satisfaca `SPAWN_MIN_DISTANCE` E seja andavel, e ai o inimigo nascia
  // dentro da parede — de onde o pathfinder nao tira ele. Melhor perder a
  // distancia minima do que a validade do ponto.
  if (isCellBlocked(mapDef, x, y)) {
    const aberto = nearestOpenPoint(mapDef, x, y)
    if (aberto) return aberto
  }
  return { x, y }
}

/** Distancia do ponto ao inimigo ja posicionado mais proximo. */
function folgaAte(x: number, y: number, ocupados: Point[]): number {
  let menor = Number.POSITIVE_INFINITY
  for (const o of ocupados) menor = Math.min(menor, Math.hypot(x - o.x, y - o.y))
  return menor
}

/**
 * `ocupados`: onde os inimigos JA posicionados nesta leva estao (PH-143).
 *
 * O ponto sorteado precisa respeitar `SPAWN_ENTRE_INIMIGOS` em relacao a eles.
 * Quando nenhuma das tentativas consegue (corredor estreito, sala pequena,
 * muitos inimigos), vale o MELHOR ESFORCO — o candidato valido mais afastado
 * dos outros — e nao o fallback de mapa inteiro: perder o espacamento e melhor
 * que perder o cone de visao, que e pedido explicito do usuario.
 */
function randomSpawnPoint(
  rng: Rng,
  mapDef: MapDef,
  player: { x: number; y: number; facing: Point } | null,
  ocupados: Point[] = [],
): Point {
  if (!player) return randomSpawnPointFullMap(rng, mapDef)

  const cx = mapDef.bounds.width / 2
  const cy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef)
  const facingAngle = Math.atan2(player.facing.y, player.facing.x)

  let melhor: { ponto: Point; folga: number } | null = null
  const orcamento = ocupados.length > 0 ? SPAWN_ESPACADO_MAX_ATTEMPTS : SPAWN_POINT_MAX_ATTEMPTS
  for (let attempts = 0; attempts < orcamento; attempts++) {
    const angle = facingAngle + randRange(rng, -SPAWN_CONE_HALF_ANGLE, SPAWN_CONE_HALF_ANGLE)
    const dist = randRange(rng, SPAWN_CONE_MIN_DISTANCE, SPAWN_CONE_MAX_DISTANCE)
    const x = player.x + Math.cos(angle) * dist
    const y = player.y + Math.sin(angle) * dist
    if (Math.hypot(x - cx, y - cy) > radius) continue
    if (isCellBlocked(mapDef, x, y)) continue
    const folga = folgaAte(x, y, ocupados)
    if (!melhor || folga > melhor.folga) melhor = { ponto: { x, y }, folga }
    // Sai cedo SO quando ja esta bem servido. Aceitar o primeiro que passa
    // raspando espalha pior: o ponto "ok por pouco" rouba o espaco de quem vem
    // depois, e a leva inteira termina mais apertada do que precisava.
    if (melhor.folga >= SPAWN_ENTRE_INIMIGOS * 1.5) break
  }
  // Melhor esforco: o candidato valido mais afastado dos outros. Perder o
  // espacamento e melhor que perder o cone de visao, que e pedido explicito.
  if (melhor) return melhor.ponto
  return randomSpawnPointFullMap(rng, mapDef)
}

function spawnEnemyAt(
  world: SequenciaDeSorteio,
  mapDef: MapDef,
  pool: string[],
  janela?: [number, number],
  player?: { x: number; y: number; facing: Point } | null,
  entrada?: Point | null,
  // PH-143: onde os outros inimigos ja estao, pra este nao nascer em cima
  // deles. Ausente = leva de um inimigo so, nao ha com quem se espremer.
  ocupados: Point[] = [],
): EnemyEntity {
  const { rng, counters } = world
  const point = entrada ?? randomSpawnPoint(rng, mapDef, player ?? null, ocupados)
  // Ponderado pelo TIER de spawn da especie, derivado da chance real de
  // encontro selvagem do Gen1/Gen2 (ver scripts/derive-spawn-tiers.js) — quem e
  // comum nos jogos reais aparece mais que quem e raro, dentro da mesma hunt.
  // Antes era a taxa de captura, que mede outra coisa.
  //
  // O SORTEIO E O MESMO NO MODO PESSIMISTA (farm offline). Uma versao anterior
  // fixava aqui o inimigo de maior nivel do pool, na ideia de que "o mais forte
  // sempre" seria o limite inferior. Media, era falso e quebrava o jogo de dois
  // jeitos (1h na Planicie, mesma semente):
  //
  //   sorteado  1213 kills, 305.005 ouro, 219 capturas de 28 especies
  //   fixado    1073 kills, 209.165 ouro, 332 capturas de  1 especie
  //
  //   1. A mochila voltava com 332 copias do MESMO POKE — o jogador farmava a
  //      noite inteira e recebia uma unica especie repetida. Foi assim que o
  //      bug apareceu.
  //   2. Capturar rendia MAIS offline que acordado, exatamente o contrario da
  //      regra. O inimigo fixo era Pidgey (o de maior nivel ali), que tem
  //      `catchRate` alto — fixar a especie fixa junto a chance de captura
  //      dela, entao "o mais forte" podia ser tambem "o mais facil de pegar".
  //
  // O limite inferior vem de onde ele e de fato monotonico: a RESOLUCAO do
  // combate (dano na variacao minima, zero critico — ver computeDamage), que so
  // faz matar mais devagar, nunca render mais. Composicao de especie e nivel
  // continua sendo a da hunt, entao o que volta na mochila e o que aquela hunt
  // realmente da. Contra a "sequencia de sorte" que a versao anterior temia, o
  // que protege e a escala: um flush offline sao milhares de kills, e a media
  // de milhares de sorteios nao desvia o bastante pra passar o jogo ao vivo.
  // `pool` e o da SALA atual quando a hunt tem salas, e o da hunt inteira
  // quando nao tem (inicial, BOSS, Lance) — ver systems/salaSystem.ts.
  const encounterId = weightedPick(rng, pool, (id) => getEncounter(id)?.weight ?? 45)
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  // `levelWeights` (ver data/huntTypes.ts) troca o sorteio uniforme por um
  // ponderado — hoje so a hunt inicial usa, pra sair 80% Lv1 / 20% Lv2.
  //
  // `janela` e a faixa de nivel da SALA atual: a hunt afunda conforme as salas
  // sao limpas (ver salaSystem#janelaDaSala). Sem ela, a primeira sala de uma
  // faixa de 30 niveis ja podia jogar um POKE Lv30 contra quem acabou de sair
  // do Hospital.
  const [jmin, jmax] = janela ?? [encounter.minLevel, encounter.maxLevel]
  const lo = Math.max(encounter.minLevel, Math.min(jmin, encounter.maxLevel))
  const hi = Math.min(encounter.maxLevel, Math.max(jmax, encounter.minLevel))
  const level = encounter.levelWeights?.length
    ? weightedPick(rng, encounter.levelWeights, (entry) => entry.weight).level
    : randInt(rng, Math.min(lo, hi), Math.max(lo, hi))
  const poke = createPokeInstance(rng, encounter.speciesId, level)
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

const SEQUENCE_SPAWN_OFFSET_MIN = 60
const SEQUENCE_SPAWN_OFFSET_MAX = 150
function sequenceSpawnPoint(rng: Rng, mapDef: MapDef, base: Point): Point {
  const mapCx = mapDef.bounds.width / 2
  const mapCy = mapDef.bounds.height / 2
  const radius = mapWalkRadius(mapDef)
  let x = base.x, y = base.y, attempts = 0
  do {
    const angle = randRange(rng, 0, Math.PI * 2)
    const dist = randRange(rng, SEQUENCE_SPAWN_OFFSET_MIN, SEQUENCE_SPAWN_OFFSET_MAX)
    x = base.x + Math.cos(angle) * dist
    y = base.y + Math.sin(angle) * dist
    attempts++
  } while (
    attempts < SPAWN_POINT_MAX_ATTEMPTS
    && (Math.hypot(x - mapCx, y - mapCy) > radius || isCellBlocked(mapDef, x, y))
  )
  return { x, y }
}

/**
 * A BOLA VERDE pintada na arte: por onde entra todo POKE novo do lado inimigo.
 * `null` quando a arte nao tem uma (as 29 hunts normais), e ai o chamador cai
 * no sorteio de sempre.
 *
 * Mapa que poe VARIOS inimigos em campo ao mesmo tempo nao usa: um ponto fixo
 * empilharia os seis no mesmo pixel. Sobra o formato de duelo — a sequencia do
 * Lance e os mapas de um inimigo so (BOSS, Treinamento), que e onde a bola faz
 * sentido.
 */
function entradaDoInimigo(mapDef: MapDef, sala: { chave: string } | null): Point | null {
  if (!mapDef.sequence && mapDef.maxEnemies > 1) return null
  return spawnInimigoParaSala(mapDef.id, sala)
}

/**
 * Poe o proximo POKE vivo da equipe em campo depois da espera. Nao faz nada
 * fora dos mapas com `autoSwitchTeamOnFaint`, nem quando a equipe inteira caiu
 * — ai o fluxo normal de derrota assume.
 */
function trocarPorDesmaio(world: WorldState, gameState: GameStateStore, dt: number, silent: boolean): void {
  const player = world.player
  if (!world.mapDef?.autoSwitchTeamOnFaint || !player || !isDead(player)) {
    world.trocaEmCampo = null
    return
  }
  const proximo = gameState.team.findIndex((p) => p.hp > 0)
  if (proximo === -1) {
    world.trocaEmCampo = null
    return
  }

  world.trocaEmCampo = (world.trocaEmCampo ?? ESPERA_DE_TROCA_SEGUNDOS) - dt
  if (world.trocaEmCampo > 0) return
  world.trocaEmCampo = null

  gameState.setActiveIndex(proximo)
  const nextPoke = gameState.team[proximo]
  player.poke = nextPoke
  player.cooldowns = {}
  player.flashTimer = 0
  player.fainted = false
  player.state = 'wander'
  player.targetId = null
  // Entra pela BOLA AMARELA, nao no buraco onde o anterior caiu — e a mesma
  // regra que a bola verde da pro outro lado. Arte sem bola pintada nao move
  // ninguem: o substituto continua aparecendo no lugar do anterior, que e o
  // comportamento de antes.
  const entrada = spawnPointParaSala(world.mapDef.id, world.sala)
  if (entrada) {
    player.x = entrada.x
    player.y = entrada.y
    player.pathWaypoints = null
    player.pathIndex = 0
    player.pathTargetX = null
    player.pathTargetY = null
  }
  if (!silent) {
    toastStore.getState().pushToast(
      `${shinyPrefix(nextPoke.isShiny)}${SPECIES[nextPoke.speciesId].name} entrou em campo!`,
      'success', 'combat',
    )
  }
}

function spawnSequenceEnemy(world: SequenciaDeSorteio, mapDef: MapDef, index: number, entrada: Point | null): EnemyEntity {
  const { rng, counters } = world
  const encounterId = mapDef.sequence![index]
  const encounter = getEncounter(encounterId)
  if (!encounter) throw new Error(`Encontro desconhecido: ${encounterId}`)
  const base = mapDef.spawnPoints[0] || mapDef.playerSpawn
  // Com bola verde TODO POKE da sequencia entra por ela, o primeiro inclusive
  // — o pedido foi "todo novo pokemon", nao "do segundo em diante".
  const point = entrada ?? (index === 0 ? base : sequenceSpawnPoint(rng, mapDef, base))
  const poke = createPokeInstance(rng, encounter.speciesId, encounter.minLevel, { rarity: encounter.rarity, ivs: encounter.ivs })
  return createEnemyEntity(counters, { poke, x: point.x, y: point.y, encounterId })
}

// PARTE B (hazard): descarrega no INIMIGO recem-criado a armadilha de campo
// que o JOGADOR plantou contra o lado inimigo (Spikes/Toxic Spikes/Stealth
// Rock/Sticky Web — ver combatSystem.ts#resolveHit). Chamado logo apos CADA
// criacao de EnemyEntity (spawnEnemyAt/spawnSequenceEnemy, nos 4 pontos de
// chamada abaixo) — mesma regra dos jogos reais: FLYING e quem tem a Trait
// levitate nunca sofrem hazard de chao, entao pulam o bloco inteiro.
function aplicarHazardsAoInimigo(rng: Rng, hazards: EnemyHazards | undefined, enemy: EnemyEntity): void {
  if (!hazards) return
  const species = SPECIES[enemy.poke.speciesId]
  const imuneATerra = species.type === 'FLYING' || species.type2 === 'FLYING' || traitDoPoke(enemy.poke) === 'levitate'
  if (imuneATerra) return

  const maxHp = enemy.poke.stats.hp

  if (hazards.spikes > 0) {
    // 1 camada = 1/8, 2 = 1/6, 3 = 1/4 do HP maximo — mesma escala dos jogos.
    const fracao = hazards.spikes === 1 ? 1 / 8 : hazards.spikes === 2 ? 1 / 6 : 1 / 4
    takeDamage(enemy, Math.max(1, Math.round(maxHp * fracao)))
  }

  if (hazards.toxicSpikes > 0) {
    // So existe 1 nivel de veneno neste motor — a distincao leve/grave dos
    // jogos reais (1 camada = poison normal, 2 = toxic) se perde de proposito.
    aplicarStatus(rng, enemy, 'poison', 100)
  }

  if (hazards.stealthRock) {
    const efetividade = getEffectiveness('ROCK', species.type, species.type2)
    takeDamage(enemy, Math.max(1, Math.round((maxHp / 8) * efetividade)))
  }

  if (hazards.stickyWeb) {
    enemy.estagios.speed = (enemy.estagios.speed ?? 0) - 1
  }
}

/**
 * Progresso que precisa ATRAVESSAR a reconstrucao do mundo.
 *
 * O servidor simula por JANELAS: a cada flush (~30s) ele monta o mundo do zero
 * com esta funcao. Tudo que vive so em `WorldState` volta ao valor inicial —
 * foi assim que a sequencia do Campeao Lance ficou INGANHAVEL sob autoridade
 * do servidor: `sequenceIndex` voltava a 0 e o `startCountdown` de 5s era
 * pago de novo em toda janela, entao a luta so podia ser vencida se os 6 POKEs
 * dele caissem dentro de ~25 segundos.
 */
export interface ProgressoDaSessao {
  sequenceIndex?: number
  sequenceCleared?: boolean
  /** Sala em que a sessao parou. Ausente = comeca uma sala nova sorteada. */
  sala?: SalaAtiva | null
  /**
   * O clima que o SERVIDOR sorteou para esta sala (PH-140).
   *
   * `undefined` e `null` querem dizer coisas diferentes, e a distincao e o
   * ponto deste campo:
   *
   * - `undefined` — nao ha autoridade (jogo local, ou o proprio servidor
   *   montando o mundo dele). O clima e DERIVADO de `(seed, sala)`.
   * - `null` — a autoridade falou, e o que ela disse foi "ceu limpo".
   *
   * Existe porque o cliente NAO conhece a semente da sessao e nunca vai
   * conhecer: e ela que decide shiny, IV, raridade e crit, e um cliente que a
   * tivesse preveria o proximo shiny (ver core/rng.ts). Sem este campo, cliente
   * e servidor derivariam climas diferentes — o jogador veria o ceu limpo
   * enquanto o servidor cobrava dano de areia.
   */
  clima?: ClimaTipo | null
}

export function buildMapWorld(
  mapId: string,
  activePoke: PokeInstance,
  carry?: SequenciaDeSorteio,
  progresso?: ProgressoDaSessao,
): WorldState {
  const base = novoMundo(carry)

  // A sala tem que ser decidida ANTES do primeiro spawn: e ela que diz qual
  // pool esta ativo (e, com body-block por sala, qual grade de colisao/ponto
  // de nascimento valem — ver mapDefParaSala/spawnPointParaSala).
  // Retomar a sala salva (e nao sortear uma nova por janela) e o mesmo
  // motivo do `sequenceIndex` — o mundo e reconstruido a cada flush, e
  // sortear aqui faria a sala trocar de 30 em 30 segundos sozinha.
  const sala = temSalas(mapId)
    ? (progresso?.sala ?? novaSala(base.rng, mapId, 0, 0))
    : null
  const mapDef = mapDefParaSala(mapId, sala)
  if (!mapDef) throw new Error(`Mapa desconhecido: ${mapId}`)

  const spawn = spawnPointParaSala(mapId, sala) ?? mapDef.playerSpawn
  // `spawnPointParaSala` ja devolve um ponto andavel quando a sala tem body-
  // block (o proprio script de build ja resolve isso). O fallback
  // (`mapDef.playerSpawn`, GEOMETRIA fixa) NAO passa por essa checagem —
  // hunt sem sala mas com grade propria (ex.: route_46 reusando o body-
  // block da 'forest', ver maps.ts#mapDefParaSala) podia nascer o jogador
  // DENTRO de uma parede pintada. Mesmo snap que `registrarAbate` ja faz na
  // troca de sala, aplicado aqui na construcao inicial do mundo.
  const spawnFinal = (mapDef.collisionGrid && isCellBlocked(mapDef, spawn.x, spawn.y))
    ? nearestOpenPoint(mapDef, spawn.x, spawn.y) ?? spawn
    : spawn
  const player = createPlayerEntity(base.counters, { poke: activePoke, x: spawnFinal.x, y: spawnFinal.y })
  if (isDead(player)) player.fainted = true

  const sequenceIndex = progresso?.sequenceIndex ?? 0
  const sequenceCleared = progresso?.sequenceCleared ?? false
  // A contagem regressiva de intro do Lance so vale na PRIMEIRA janela. Numa
  // retomada ela seria 5 segundos de combate congelado por flush.
  const retomando = sequenceIndex > 0 || sequenceCleared
  const countdownRemaining = retomando ? null : (mapDef.startCountdown || null)

  // PH-140: com autoridade o clima vem PRONTO no progresso; sem ela, e derivado
  // de `(seed, sala)`. `'clima' in progresso` e nao `progresso.clima != null`
  // porque ausente e "nao ha autoridade" e `null` e "a autoridade disse ceu
  // limpo" — ver `ProgressoDaSessao.clima`.
  const climaDaConstrucao = progresso && 'clima' in progresso
    ? climaDeAmbiente(progresso.clima ?? null)
    : climaAmbienteDaSala(base.seed, sala)

  const { pool, janela } = contextoDeSpawn(mapId, mapDef.levelRange, sala, mapDef.enemyPool)

  const enemies: EnemyEntity[] = []
  if (!countdownRemaining && !sequenceCleared) {
    if (mapDef.sequence) {
      const enemy = spawnSequenceEnemy(base, mapDef, sequenceIndex, entradaDoInimigo(mapDef, sala))
      aplicarHazardsAoInimigo(base.rng, base.enemyHazards, enemy)
      enemies.push(enemy)
    } else {
      for (let i = 0; i < mapDef.maxEnemies; i++) {
        const enemy = spawnEnemyAt(base, mapDef, pool, janela, player, entradaDoInimigo(mapDef, sala), enemies)
        aplicarHazardsAoInimigo(base.rng, base.enemyHazards, enemy)
        enemies.push(enemy)
      }
    }
  }

  return {
    ...base,
    mapDef, player, enemies, effects: [], pendingHits: [], pendingWishes: [],
    autoTimers: { treinador: 0 },
    reviveCountdown: null,
    trocaEmCampo: null,
    respawnTimer: mapDef.respawnDelay,
    sequenceIndex,
    sequenceCleared,
    countdownRemaining,
    sala,
    // PH-140: o clima de ambiente e reposto em TODA construcao de mundo, e nao
    // guardado. E o que faz ele sobreviver ao flush do servidor (que reconstroi
    // o mundo a cada 30-90s) sem coluna nova em `game_sessions`: mesma
    // `(seed, sala)`, mesmo clima.
    //
    // Com autoridade, o clima vem PRONTO no progresso em vez de ser derivado —
    // o cliente nao tem a semente da sessao. Ver `ProgressoDaSessao.clima`.
    //
    // Clima de GOLPE nao volta aqui de proposito — 10 turnos nao atravessam
    // reconstrucao de mundo, igual estagio de atributo e escudo.
    clima: climaDaConstrucao,
    climaAmbiente: climaDaConstrucao,
  }
}

// ---------- Resolucao de combate (EXP, loot, captura) ----------

// `silent` e usado pelos 2 sistemas headless de catch-up — as chamadas
// reais de XP/ouro/loot/captura sempre rodam de qualquer jeito, so os
// Effects visuais e os toasts sao pulados quando silent. Sempre devolve um
// resumo do que aconteceu pro chamador agregar (OfflineSimSystem).
export function handleEnemyDefeated(world: WorldState, enemy: EnemyEntity, gameState: GameStateStore, opts: { silent?: boolean } = {}): KillResult {
  const silent = opts.silent ?? false
  const player = world.player!
  // Autoritativo durante combate — ver nota de arquitetura no topo do
  // arquivo. NAO le gameState.activePoke aqui (poderia estar desatualizado
  // em relacao ao HP/EXP que a luta ja aplicou nesta hunt).
  const poke = player.poke
  const enemySpecies = SPECIES[enemy.poke.speciesId]

  // Boneco de treino (data/trainingDummy.ts): abate nao rende NADA — sai
  // antes de tocar EXP/ouro/loot/captura/Pokedex, e sem toast (o feedback do
  // treino ja e o numero de dano flutuante durante a luta, nao um resumo de
  // recompensa que so diria "+0"). `isShiny` continua honesto por curiosidade
  // — nao capturavel (`noCatch`), entao ver um shiny aqui nao vale nada alem
  // de flavor.
  if (world.mapDef!.noRewards) {
    if (!silent) {
      recordKill(gameState, { gold: 0, xp: 0, isShiny: Boolean(enemy.poke.isShiny) })
    }
    return {
      gold: 0, xp: 0, ouroDeAutoVenda: 0, leveledUp: false, trainerLeveledUp: false,
      isShiny: Boolean(enemy.poke.isShiny), captured: false, capturedPoke: null, droppedItems: [],
    }
  }

  const expGain = expRewardForEnemy(enemy.poke, poke.level)
  const grantResult = grantExp(poke, expGain)
  player.poke = grantResult.poke
  gameState.updatePokeInstance(grantResult.poke.uid, () => grantResult.poke)

  const trainerResult = grantTrainerExp(gameState.trainer, expGain)
  gameState.setTrainer(trainerResult.trainer)

  const loot = awardKillLoot(world.rng, gameState, enemy, world.mapDef!, lootAtivo(world.sala, world.mapDef!.itemDrops))
  // Champion Lance (data/nightmareMaps.ts) proibe captura explicitamente —
  // seu `noCatch` e o unico lugar que isso e setado.
  const captureResult = world.mapDef!.noCatch ? null : maybeAutoCatch(world.rng, gameState, enemy.poke)
  recordPokedexKill(gameState, enemy.poke.speciesId, Boolean(enemy.poke.isShiny))

  // Ouro que a auto-venda gerou neste abate. Ja esta na carteira (creditado
  // dentro de `attemptCapture`); daqui pra baixo ele entra nas MEDIDAS — taxa
  // de ouro/h e resumo —, senao o jogador com o bot ligado veria a barra de
  // ouro andar sem a taxa acompanhar.
  const ouroDeAutoVenda = captureResult?.success && captureResult.location === 'vendido'
    ? captureResult.vendidoPor
    : 0

  if (!silent) {
    recordKill(gameState, { gold: loot.gold + ouroDeAutoVenda, xp: expGain, isShiny: enemy.poke.isShiny })

    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: expGain, unit: 'XP', color: '#4ade80', duration: 1.1, owner: enemy,
    }))
    world.effects.push(createWorldEffect(world.counters, {
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: loot.gold, unit: '🪙', color: '#fff59d', duration: 1.1, owner: enemy,
    }))

    toastStore.getState().pushToast(
      `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${rarityOf(enemy.poke).label}] derrotado! +${expGain} EXP, +${loot.gold} ouro`,
      'gold', 'combat', realceDaRaridade(enemy.poke),
    )

    if (grantResult.leveledUp) {
      // O ganho numerico de atributo vai junto do aviso (pedido explicito):
      // sem ele o level-up so dizia "subiu de nivel" e o jogador precisava
      // abrir o perfil pra descobrir se aquilo valeu alguma coisa.
      const ganhos = formatStatGains(grantResult.statGains)
      toastStore.getState().pushToast(
        `${shinyPrefix(grantResult.poke.isShiny)}${SPECIES[grantResult.poke.speciesId].name} subiu para o nivel ${grantResult.level}!${ganhos ? ` ${ganhos}` : ''}`,
        'levelup', 'combat',
      )
      for (const ability of grantResult.newAbilities.filter(isDamagingAbility)) {
        toastStore.getState().pushToast(`Nova habilidade desbloqueada: ${ability.name}!`, 'levelup', 'combat')
      }
    }
    if (trainerResult.leveledUp) {
      toastStore.getState().pushToast(`${gameState.trainer.name} subiu para o nivel ${trainerResult.level}!`, 'levelup', 'combat')
    }

    for (const itemId of loot.droppedItems) {
      const item = getItem(itemId)
      if (item) toastStore.getState().pushToast(`Item encontrado: ${item.name}`, 'success', 'world')
    }

    // Animacao de arremesso de Pokebola — so pra uma tentativa de verdade.
    //
    // PH-174: `atrasoDoToastMs` guarda quanto tempo real a bola ainda vai
    // levar pra terminar de jogar na tela (`delay` do efeito + `duration`) —
    // o toast de resultado (abaixo) so dispara depois disso. Antes ele saia
    // na hora, narrando "capturado!"/"a captura falhou!" ANTES da animacao
    // visualmente resolver — ordem incoerente com o que o jogador via.
    let atrasoDoToastMs = 0
    if (captureResult && 'ballItemId' in captureResult && captureResult.ballItemId) {
      const quadros = captureAnimFrameCount(captureResult.success)
      const duracao = quadros * captureAnimFrameDuration() + 0.3
      world.effects.push(createWorldEffect(world.counters, {
        type: 'captureAnim', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: enemy.y,
        ballItemId: captureResult.ballItemId, success: captureResult.success,
        delay: DEATH_ANIM_GRACE_PERIOD,
        duration: duracao,
      }))
      atrasoDoToastMs = (DEATH_ANIM_GRACE_PERIOD + duracao) * 1000
    }

    if (captureResult) {
      const dispararToastDeCaptura = () => {
        if (captureResult.success && captureResult.location === 'vendido') {
          // Toast proprio: dizer "capturado! Foi para a mochila" e depois nao ter
          // nada na mochila e a forma mais rapida de o jogador achar que perdeu
          // POKE. A raridade fica porque e ela que explica o valor.
          toastStore.getState().pushToast(
            `${enemySpecies.name} [${rarityOf(captureResult.poke).label}] capturado e vendido pelo bot: +${captureResult.vendidoPor} ouro.`,
            'capture-success', 'world',
            realceDaRaridade(captureResult.poke),
          )
        } else if (captureResult.success) {
          // So sobra `location: 'bag'` aqui — o outro caso saiu no `if` acima.
          const location = 'mochila'
          // Raridade concatenada no relatorio (pedido explicito): ela multiplica
          // atributo e valor de venda em ate 600x, entao e o dado que decide se
          // aquela captura importou — e o chat era o unico lugar que nao dizia.
          const raridade = rarityOf(captureResult.poke).label
          toastStore.getState().pushToast(
            `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} [${raridade}] capturado! Foi para a ${location}.`,
            'capture-success', 'world',
            // A raridade que vale e a da INSTANCIA capturada, nao a do inimigo em
            // campo: `attemptCapture` sorteia o POKE que entra na mochila.
            realceDaRaridade(captureResult.poke),
          )
        } else if (captureResult.reason === 'roll_failed') {
          toastStore.getState().pushToast('A captura falhou!', 'capture-fail', 'combat')
        }
      }
      // So atrasa quando houve animacao de verdade pra esperar (tentativa
      // real, `atrasoDoToastMs > 0`) — sem tentativa (sem bola) nao ha nada
      // na tela pra sincronizar, o toast sai na hora como sempre saiu.
      if (atrasoDoToastMs > 0) setTimeout(dispararToastDeCaptura, atrasoDoToastMs)
      else dispararToastDeCaptura()
    }
  }

  return {
    gold: loot.gold + ouroDeAutoVenda,
    ouroDeAutoVenda,
    xp: expGain,
    leveledUp: grantResult.leveledUp,
    trainerLeveledUp: trainerResult.leveledUp,
    isShiny: Boolean(enemy.poke.isShiny),
    // "Capturado" aqui significa ENTROU NA MOCHILA: o que a auto-venda pegou
    // nunca chegou lá, e contá-lo como captura faria o relatório listar POKE
    // que o jogador não tem.
    captured: Boolean(captureResult?.success && captureResult.location === 'bag'),
    capturedPoke: captureResult?.success && captureResult.location === 'bag' ? captureResult.poke : null,
    droppedItems: loot.droppedItems,
  }
}

// ---------- Tick de passo fixo ----------

// Compartilhado pelo loop ao vivo (silent:false) e os 2 sistemas headless
// de catch-up (silent:true, chamados em loop apertado por
// simulateWorldSeconds) — este e o UNICO lugar onde movimento/combate/
// auto-heal/respawn avancam. Devolve a lista de resumos por-kill.
export function stepWorld(world: WorldState, dt: number, gameState: GameStateStore, opts: { silent?: boolean; offline?: boolean } = {}): KillResult[] {
  const silent = opts.silent ?? false
  // Janela longa (farm offline de verdade) ignora o toggle — mesmo eixo que
  // ja liga `world.pessimista` no servidor (ver LIMIAR_OFFLINE_SEGUNDOS em
  // authority/progresso.ts). Calculado uma vez e repassado pros dois pontos
  // que decidem avanco de sala (`garantirTransicaoDeQuotaFechada` e
  // `registrarAbate`), senao um dos dois fica desatualizado com o toggle.
  const manualAdvance = (gameState.autoToggles.avancoManualDeSala ?? false) && !(opts.offline ?? false)
  if (!world.player) return []

  if (!world.mapDef) {
    // Hospital: sem movimento/combate, mas o battle sprite continua animando.
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // Contagem regressiva de intro da Champion Lance: movimento/combate/
  // respawn ficam congelados e nada nasceu ainda ate isso chegar a 0.
  if (world.countdownRemaining != null) {
    world.countdownRemaining -= dt
    if (world.countdownRemaining <= 0) {
      world.countdownRemaining = null
      if (world.mapDef.sequence) {
        const enemy = spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex, entradaDoInimigo(world.mapDef, world.sala))
        aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
        world.enemies.push(enemy)
      } else {
        const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
        for (let i = 0; i < world.mapDef.maxEnemies; i++) {
          const enemy = spawnEnemyAt(world, world.mapDef, ctx.pool, ctx.janela, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
          aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
          world.enemies.push(enemy)
        }
      }
    }
    if (!silent) updateAnimations(world, dt)
    return []
  }

  // Quota fechada numa janela ANTERIOR (a contagem regressiva e efemera e nao
  // atravessa a reconstrucao de mundo do servidor): arma a transicao agora, sem
  // esperar um abate novo. Ver o livelock em
  // salaSystem.ts#garantirTransicaoDeQuotaFechada.
  garantirTransicaoDeQuotaFechada(world, world.mapDef.id, dt, manualAdvance)

  // Contagem regressiva "Entrando em nova area" entre salas (ver
  // salaSystem.ts#registrarAbate/aplicarTransicaoDeSala): a quota de abates
  // da sala atual ja fechou e a proxima ja foi sorteada
  // (world.salaPendente) — movimento/combate ficam congelados ate zerar,
  // mesmo padrao do countdown de intro do Lance acima.
  if (world.salaCountdownRemaining != null) {
    world.salaCountdownRemaining -= dt
    if (world.salaCountdownRemaining <= 0) {
      world.salaCountdownRemaining = null
      const fechouCiclo = world.salaPendente?.indice === 0
      aplicarTransicaoDeSala(world, world.mapDef.id)
      if (world.mapDef) {
        const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
        for (let i = 0; i < world.mapDef.maxEnemies; i++) {
          const enemy = spawnEnemyAt(world, world.mapDef, ctx.pool, ctx.janela, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
          aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
          world.enemies.push(enemy)
        }
        world.respawnTimer = world.mapDef.respawnDelay
        if (!silent) {
          const nome = nomeDaSala(world.sala)
          toastStore.getState().pushToast(
            fechouCiclo
              ? `Ciclo ${world.sala?.ciclos ?? 0} concluido! Voltando para a primeira sala: ${nome}.`
              : `Entrando em nova area: ${nome}.`,
            'success', 'world',
          )
        }
      }
    }
    if (!silent) updateAnimations(world, dt)
    return []
  }

  updateMovement(world, dt)
  const { defeatedEnemyIds, playerJustFainted } = updateCombat(world, dt, { silent })
  // attackAnimTimer precisa decrementar todo tick independente de `silent`
  // — MovementSystem trava movimento enquanto ele roda.
  tickAttackAnimTimers(world, dt)
  // Precisa rodar DEPOIS do combate: triggerAttackAnim (chamado de dentro
  // de updateCombat) precisa ser capturado no mesmo tick.
  if (!silent) updateAnimations(world, dt)

  const kills: KillResult[] = []
  if (defeatedEnemyIds.length > 0) {
    for (const enemyId of defeatedEnemyIds) {
      const enemy = world.enemies.find((e) => e.id === enemyId)
      if (!enemy) continue
      kills.push(handleEnemyDefeated(world, enemy, gameState, { silent }))
      enemy.deathRemovalTimer = silent ? 0 : DEATH_ANIM_GRACE_PERIOD
      // Conta pra quota da sala AQUI, e nao em quem chama: este e o unico
      // ponto de abate do jogo, entao o combate ao vivo, o catch-up de aba
      // oculta e o farm offline contam pela mesma regra sem nenhum deles
      // precisar lembrar. So arma a contagem regressiva (world.salaCountdownRemaining) —
      // a troca de fato acontece la em cima, no gate do proximo tick.
      registrarAbate(world, world.mapDef.id, { manualAdvance })
    }
  }
  for (const enemy of world.enemies) {
    if (isDead(enemy) && enemy.deathRemovalTimer != null && enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt
  }
  // Regra da Champion Lance: POKEs derrotados ficam em campo como "corpos"
  // visiveis em vez de desaparecer apos o periodo de graca usual.
  world.enemies = world.enemies.filter((e) => !isDead(e) || (e.deathRemovalTimer ?? 0) > 0 || world.mapDef!.keepCorpses)

  if (playerJustFainted && world.player) {
    // Roda mesmo quando silent — mesma regra de todo outro pipeline de
    // recompensa/penalidade aqui, so o toast e ao-vivo-so.
    const expAntesDaPenalidade = world.player.poke.exp
    const penaltyResult = applyDeathExpPenalty(world.player.poke)
    world.player.poke = penaltyResult.poke
    gameState.updatePokeInstance(penaltyResult.poke.uid, () => penaltyResult.poke)
    // PH-169: entrada SINTETICA (nao e abate) — so pro resumo do flush
    // (offlineSimSystem.ts) saber quanto de queda de XP nesta janela e
    // LEGITIMA. Campos de abate ficam zerados/false/null de proposito.
    kills.push({
      gold: 0,
      ouroDeAutoVenda: 0,
      xp: 0,
      leveledUp: false,
      trainerLeveledUp: false,
      isShiny: false,
      captured: false,
      capturedPoke: null,
      droppedItems: [],
      playerFainted: true,
      expLostToPenalty: Math.max(0, expAntesDaPenalidade - penaltyResult.poke.exp),
      leveledDown: penaltyResult.leveledDown,
    })
    if (!silent) {
      toastStore.getState().pushToast(
        `${SPECIES[world.player.poke.speciesId].name} desmaiou!${penaltyResult.leveledDown ? ` Caiu para o nivel ${penaltyResult.level}.` : ''}`,
        'error', 'combat',
      )
    }
  }

  // Regra da Champion Lance (autoSwitchTeamOnFaint): em vez do modal "voce
  // perdeu" de BOSS normal no primeiro desmaio, o proximo membro de equipe
  // nao-desmaiado entra em campo — depois de TROCA_APOS_DESMAIO segundos, a
  // mesma espera que o outro lado tem (huntTypes.ts#ESPERA_DE_TROCA_SEGUNDOS).
  //
  // A condicao e REDERIVADA todo tick ("desmaiado em campo + alguem vivo no
  // banco") em vez de disparada uma vez no `playerJustFainted`. E o que faz a
  // espera sobreviver a reconstrucao do mundo por janela de flush: o mundo
  // novo nasce com o POKE desmaiado e sem timer nenhum, e sem esta releitura
  // a troca simplesmente nunca aconteceria — o mesmo modo de falha silencioso
  // do `sequenceIndex` que engine/lance.test.ts existe pra impedir.
  trocarPorDesmaio(world, gameState, dt, silent)

  const autoEvents = updateAutoHeal(world, gameState, dt)
  if (!silent) {
    for (const ev of autoEvents) {
      if (ev.type === 'auto_pot') {
        const item = getItem(ev.itemId)
        if (item) toastStore.getState().pushToast(`Auto-pot usou ${item.name}.`, 'success', 'combat')
      }
      if (ev.type === 'auto_revive') toastStore.getState().pushToast('Auto-revive reanimou seu POKE!', 'success', 'combat')
    }
  }

  // Hunts BOSS (Modo Pesadelo) nascem seu unico lendario uma vez por
  // visita e nunca reabastecem o pool depois que ele morre.
  const aliveCount = world.enemies.filter((e) => !isDead(e)).length

  if (
    world.mapDef.sequence && world.mapDef.unlocksContinentOnClear?.length && !world.sequenceCleared
    && aliveCount === 0 && world.sequenceIndex === world.mapDef.sequence.length - 1
  ) {
    world.sequenceCleared = true
    // Lista: o Lance abre a faixa de nivel seguinte E o Modo Pesadelo.
    const grupos = world.mapDef.unlocksContinentOnClear
    const algumEstavaTrancado = grupos.some((g) => !gameState.isContinentUnlocked(g))
    for (const grupo of grupos) gameState.unlockContinent(grupo)
    if (!silent && algumEstavaTrancado) {
      toastStore.getState().pushToast('Voce derrotou o Campeao Lance! A Faixa III e o Modo Pesadelo foram liberados.', 'success', 'world')
    }
  }

  if (aliveCount < world.mapDef.maxEnemies && !world.mapDef.noRespawn) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      const ctx = contextoDeSpawn(world.mapDef.id, world.mapDef.levelRange, world.sala, world.mapDef.enemyPool)
      const enemy = spawnEnemyAt(world, world.mapDef, ctx.pool, ctx.janela, world.player, entradaDoInimigo(world.mapDef, world.sala), world.enemies)
      aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
      world.enemies.push(enemy)
      world.respawnTimer = world.mapDef.respawnDelay
    }
  } else if (world.mapDef.sequence && aliveCount === 0 && world.sequenceIndex < world.mapDef.sequence.length - 1) {
    world.respawnTimer = (world.respawnTimer ?? 0) - dt
    if (world.respawnTimer <= 0) {
      world.sequenceIndex += 1
      const enemy = spawnSequenceEnemy(world, world.mapDef, world.sequenceIndex, entradaDoInimigo(world.mapDef, world.sala))
      aplicarHazardsAoInimigo(world.rng, world.enemyHazards, enemy)
      world.enemies.push(enemy)
      world.respawnTimer = world.mapDef.respawnDelay
    }
  }

  return kills
}

// Copia world.player.poke (autoritativo ao vivo durante combate) de volta
// pra gameStateStore.team — ver nota de arquitetura no topo do arquivo.
// Chamado pela Fase 5 num timer periodico de baixa frequencia (nao todo
// tick) e em pontos de transicao de cena.
export function syncActivePokeToGameState(world: WorldState, gameState: GameStateStore): void {
  if (!world.player) return
  gameState.updatePokeInstance(world.player.poke.uid, () => world.player!.poke)
}

// ---------- Acoes do controller (chamadas pela UI, Fase 6) ----------
