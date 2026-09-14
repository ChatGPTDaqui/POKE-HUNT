// PH-535 Fase 2: motor headless COMPARTILHADO por Modo Duelo
// (Lance/lendarios, appDuelo.ts) e PvP (ranqueado/amistoso, appPvp.ts) — o
// mesmo `updateCombat` real (combatSystem.ts) de qualquer hunt, travado em
// turnos alternados por Velocidade via `world.rodadaDuelo`
// (engine/types.ts). So a FONTE dos dois times muda entre os dois
// chamadores (boss fixo/sorteado vs time salvo de outro jogador) — a
// mecanica de combate e identica, extraida aqui pra nao duplicar.
import { randomSeed } from '@/core/rng'
import { createEnemyEntity, createPlayerEntity, isDead } from '@/engine/entity'
import { emptyWorldState } from '@/engine/worldState'
import { updateCombat } from '@/engine/systems/combatSystem'
import { apagarTodosOsEstagios } from '@/engine/systems/statusSystem'
import { LANCE_MAP_ID, BOSS_MAPS_DATA } from '@/data/nightmareMaps'
import type { EnemyEntity, EventoDuelo, LadoDuelo, PlayerEntity, WorldState } from '@/engine/types'
import type { PokeInstance } from '@/data/pokes'

// `createEnemyEntity` so usa `encounterId` pra `aggroRadius` — irrelevante
// num confronto headless, a entidade nunca anda. Reaproveita um encontro
// JA REGISTRADO (o do Lance, sempre presente) em vez de qualquer chamador
// precisar pensar nisso.
const ENCONTRO_QUALQUER = BOSS_MAPS_DATA[LANCE_MAP_ID].enemyPool[0]

const PASSO_CONFRONTO = 0.1
// Teto de seguranca: pior caso realista (6v6, muito status/Protect) fica
// bem abaixo disto — mesma filosofia do teto de `offlineSimSystem.ts`.
const MAX_TICKS_CONFRONTO = 6000

interface TimeDoConfronto {
  pokes: PokeInstance[]
  indiceAtivo: number
}

/** Acha o primeiro vivo a partir de `indiceAtivo` (inclusive), sem avancar. */
function primeiroVivo(time: TimeDoConfronto): PokeInstance | null {
  while (time.indiceAtivo < time.pokes.length && time.pokes[time.indiceAtivo].hp <= 0) time.indiceAtivo++
  return time.pokes[time.indiceAtivo] ?? null
}

/** Avanca PASSADO o atual (que acabou de desmaiar) e acha o proximo vivo. */
function proximoVivo(time: TimeDoConfronto): PokeInstance | null {
  time.indiceAtivo++
  return primeiroVivo(time)
}

/**
 * Poe `novoPoke` em campo no lugar do que desmaiou. `entradaProcessada =
 * false` e o ponto central da PH-535 — e o que faz o hook de entrada
 * (Intimidate etc.) disparar de novo pro POKE que acabou de entrar, com
 * efeito mecanico real.
 */
function trocarAtivo(entity: PlayerEntity | EnemyEntity, novoPoke: PokeInstance, world: WorldState): void {
  entity.poke = novoPoke
  entity.cooldowns = {}
  entity.globalCooldown = 0
  entity.flashTimer = 0
  entity.deathHandled = false
  entity.entradaProcessada = false
  if (entity.kind === 'player') entity.fainted = false
  apagarTodosOsEstagios(entity)
  // Nova rodada: forca reavaliacao de Velocidade pro par que acabou de
  // entrar (ver combatSystem.ts#updateCombat, bloco "NOVO ROUND").
  world.rodadaDuelo!.fila = []
}

export type VencedorConfronto = 'A' | 'B' | 'empate'

export interface ResultadoConfronto {
  vencedor: VencedorConfronto
  eventos: EventoDuelo[]
}

/**
 * Roda um confronto INTEIRO de time-contra-time, headless. Lado A vira
 * `world.player`, lado B vira `world.enemies[0]` — vocabulario do MOTOR,
 * sem relacao com quem e "o jogador de verdade": em PvP os dois lados sao
 * jogadores reais (A=anfitriao, B=convidado); em Modo Duelo A e sempre o
 * jogador e B e sempre o boss/Lance.
 *
 * Sem `stepWorld`/`buildMapWorld`: um confronto nao tem movimento, spawn
 * ou sala — so os dois ativos, parados, batendo.
 */
export function rodarConfronto(timeAInicial: PokeInstance[], timeBInicial: PokeInstance[]): ResultadoConfronto {
  const timeA: TimeDoConfronto = { pokes: timeAInicial, indiceAtivo: 0 }
  const timeB: TimeDoConfronto = { pokes: timeBInicial, indiceAtivo: 0 }
  const pokeA = primeiroVivo(timeA)
  const pokeB = primeiroVivo(timeB)
  if (!pokeA || !pokeB) {
    // Guard defensivo — os chamadores ja garantem os dois times nao-vazios
    // antes de chegar aqui.
    return { vencedor: !pokeA ? 'B' : 'A', eventos: [] }
  }

  const world = emptyWorldState(randomSeed())
  world.rodadaDuelo = { fila: [], eventos: [] }

  const player = createPlayerEntity(world.counters, { poke: pokeA, x: 0, y: 0 })
  player.state = 'engaged'
  const enemy = createEnemyEntity(world.counters, { poke: pokeB, x: 40, y: 0, encounterId: ENCONTRO_QUALQUER })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.player = player
  world.enemies = [enemy]

  for (let tick = 0; tick < MAX_TICKS_CONFRONTO; tick++) {
    updateCombat(world, PASSO_CONFRONTO, { silent: true })

    let aSemTime = false
    let bSemTime = false
    if (isDead(player)) {
      const proximo = proximoVivo(timeA)
      if (proximo) trocarAtivo(player, proximo, world)
      else aSemTime = true
    }
    if (isDead(enemy)) {
      const proximo = proximoVivo(timeB)
      if (proximo) trocarAtivo(enemy, proximo, world)
      else bSemTime = true
    }
    if (aSemTime || bSemTime) {
      const vencedor: VencedorConfronto = aSemTime && bSemTime ? 'empate' : bSemTime ? 'A' : 'B'
      return { vencedor, eventos: world.rodadaDuelo.eventos }
    }
  }
  // Teto de steps estourado sem ninguem vencer (nao deveria acontecer com
  // times de ate 6 — ver MAX_TICKS_CONFRONTO) — empate em vez de travar a
  // resposta ou devolver 500.
  return { vencedor: 'empate', eventos: world.rodadaDuelo.eventos }
}

// LadoPvpRemoto ('anfitriao'/'convidado') e o vocabulario que o replay ja
// entende (pvpWorld.ts/pvpReplaySystem.ts, PH-532) — lado A (world.player)
// vira anfitriao, lado B (world.enemies[0]) vira convidado, tanto faz o
// chamador ser Modo Duelo (A=jogador, B=boss) ou PvP (A=anfitriao,
// B=convidado de verdade).
export function eventosParaCliente(eventos: EventoDuelo[]) {
  const lado = (l: LadoDuelo): 'anfitriao' | 'convidado' => (l === 'player' ? 'anfitriao' : 'convidado')
  return eventos.map((e) => ({ ...e, atacanteLado: lado(e.atacanteLado), defensorLado: lado(e.defensorLado) }))
}
