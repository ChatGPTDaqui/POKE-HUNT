// Arena (PH-540): duelo time-contra-time no MESMO motor do modo livre.
//
// Um mundo de arena e uma hunt sem economia: os dois lados sao entidades
// reais (jogador e rival), `updateMovement`/`updateCombat` decidem tudo, e
// nada e creditado — sem EXP, ouro, captura, drop, auto-pocao, lure, sala,
// protetor ou respawn. Quando um POKE cai, o proximo do time entra depois de
// `ESPERA_DE_TROCA_SEGUNDOS`, dos dois lados. Acaba quando um lado nao tem
// mais ninguem de pe.
//
// DETERMINISMO E O CONTRATO. O servidor roda `rodarArena` headless com uma
// semente e devolve o veredito; o cliente monta o mesmo mundo com a mesma
// semente e os mesmos snapshots, e roda ao vivo pelo loop normal com passo
// fixo. Nada aqui consome RNG fora de `world.rng` (movimento deriva o seu de
// ids; ver movementSystem/encaradaSystem), e `silent` so cala toast/VFX —
// `arena.test.ts` prova que silencioso e ao vivo terminam identicos.
import { ESPERA_DE_TROCA_SEGUNDOS } from '@/data/huntTypes'
import { getMap } from '@/data/maps'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import type { PokeInstance } from '@/data/pokes'
import type { MapDef } from '@/data/maps'
import { createEnemyEntity, createPlayerEntity, isDead } from './entity'
import { DEATH_ANIM_GRACE_PERIOD } from './simulation'
import { updateAnimations, tickAttackAnimTimers } from './systems/animationSystem'
import { tickClimaDeGolpe } from './systems/climaAmbiente'
import { updateCombat } from './systems/combatSystem'
import { updateMovement } from './systems/movementSystem'
import { apagarTodosOsEstagios } from './systems/statusSystem'
import type { EnemyEntity, WorldState } from './types'
import { emptyWorldState } from './worldState'

export type ResultadoDaArena = 'lutando' | 'vitoria' | 'derrota' | 'empate'

export interface EstadoDaArena {
  /** Copias dos POKEs, HP cheio e sem status; `[0]` entra primeiro. */
  meuTime: PokeInstance[]
  rivalTime: PokeInstance[]
  indiceMeu: number
  indiceRival: number
  nomeDoRival: string
  resultado: ResultadoDaArena
  /** Contagem ate o proximo do time entrar, por lado. `null` = ninguem caido. */
  trocaMeu: number | null
  trocaRival: number | null
  ticks: number
  encounterId: string
  rivalSpawn: { x: number; y: number }
}

export const ARENA_MAP_ID = 'arena'

/**
 * Semente do duelo a partir do id da sessao de PvP: servidor e os DOIS
 * clientes chegam ao mesmo numero sem coluna nova nem troca de mensagem
 * extra (o segundo a chamar `/pvp/resolver` so recebe `jaResolvido`).
 * FNV-1a 32 bits sobre o uuid, mesmo passo de `deriveRng`.
 */
export function sementeDaSessao(sessaoId: string): number {
  let h = 0x811c9dc5 | 0
  for (let i = 0; i < sessaoId.length; i++) h = Math.imul(h ^ sessaoId.charCodeAt(i), 0x01000193) | 0
  return h
}
const AFASTAMENTO_INICIAL = 90
const CONTAGEM_INICIAL = 3
// Teto de seguranca (30 min simulados a 60 Hz) pra dois times que nao se
// arranham nunca travarem o servidor; empata.
export const ARENA_TICKS_MAXIMO = 30 * 60 * 60

export function cloneParaArena(poke: PokeInstance): PokeInstance {
  return { ...poke, hp: Math.max(1, poke.stats.hp), status: null }
}

export function mapaDaArena(nomeDoRival: string): MapDef {
  const base = getMap(LANCE_MAP_ID)
  if (!base) throw new Error('Arena indisponivel: mapa base ausente.')
  return {
    ...base,
    id: ARENA_MAP_ID,
    name: `Arena: ${nomeDoRival}`,
    noRespawn: true,
    noCatch: true,
    noRewards: true,
    autoSwitchTeamOnFaint: false,
    sequence: undefined,
    unlocksContinentOnClear: undefined,
    startCountdown: CONTAGEM_INICIAL,
    keepCorpses: true,
    encarada: true,
    enemyPool: [base.enemyPool[0]],
  }
}

export interface OpcoesDaArena {
  semente: number
  meuTime: PokeInstance[]
  rivalTime: PokeInstance[]
  nomeDoRival: string
}

export function criarMundoArena({ semente, meuTime, rivalTime, nomeDoRival }: OpcoesDaArena): WorldState {
  if (meuTime.length === 0 || rivalTime.length === 0) throw new Error('Arena precisa de POKE dos dois lados.')
  const mapDef = mapaDaArena(nomeDoRival)
  const world = emptyWorldState(semente)
  const meuSpawn = { x: mapDef.playerSpawn.x - AFASTAMENTO_INICIAL, y: mapDef.playerSpawn.y }
  const rivalSpawn = { x: mapDef.playerSpawn.x + AFASTAMENTO_INICIAL, y: mapDef.playerSpawn.y }
  const arena: EstadoDaArena = {
    meuTime: meuTime.map(cloneParaArena),
    rivalTime: rivalTime.map(cloneParaArena),
    indiceMeu: 0,
    indiceRival: 0,
    nomeDoRival,
    resultado: 'lutando',
    trocaMeu: null,
    trocaRival: null,
    ticks: 0,
    encounterId: mapDef.enemyPool[0],
    rivalSpawn,
  }
  const player = createPlayerEntity(world.counters, { poke: arena.meuTime[0], x: meuSpawn.x, y: meuSpawn.y })
  player.facing = { x: 1, y: 0 }
  const enemy = entidadeDoRival(world, arena, arena.rivalTime[0])
  return {
    ...world,
    mapDef,
    player,
    enemies: [enemy],
    respawnTimer: null,
    countdownRemaining: mapDef.startCountdown ?? null,
    arena,
  }
}

function entidadeDoRival(world: Pick<WorldState, 'counters'>, arena: EstadoDaArena, poke: PokeInstance): EnemyEntity {
  const enemy = createEnemyEntity(world.counters, { poke, x: arena.rivalSpawn.x, y: arena.rivalSpawn.y, encounterId: arena.encounterId })
  enemy.aggroRadius = 999
  enemy.leashRadius = 999
  enemy.spawnPoint = { ...arena.rivalSpawn }
  enemy.facing = { x: -1, y: 0 }
  enemy.golpesProprios = true
  return enemy
}

function temAlguemDePe(time: PokeInstance[], aPartirDe: number): number {
  for (let i = aPartirDe; i < time.length; i++) if (time[i].hp > 0) return i
  return -1
}

/**
 * Um passo da arena. Mesmo contrato de `stepWorld`: `silent` cala toast e
 * VFX, nunca muda o resultado.
 */
export function stepArena(world: WorldState, dt: number, opts: { silent?: boolean } = {}): void {
  const arena = world.arena
  const player = world.player
  if (!arena || !player || !world.mapDef) return
  const silent = opts.silent ?? false

  if (arena.resultado !== 'lutando') {
    if (!silent) updateAnimations(world, dt)
    return
  }
  arena.ticks++

  tickClimaDeGolpe(world, dt)
  if (world.trickRoomRestante) world.trickRoomRestante = Math.max(0, world.trickRoomRestante - dt)

  if (world.countdownRemaining != null) {
    world.countdownRemaining -= dt
    if (world.countdownRemaining <= 0) world.countdownRemaining = null
    if (!silent) updateAnimations(world, dt)
    return
  }

  updateMovement(world, dt)
  updateCombat(world, dt, { silent })
  tickAttackAnimTimers(world, dt)
  if (!silent) updateAnimations(world, dt)

  // Corpo fica em campo (`keepCorpses`); o timer so toca a pose de desmaio.
  for (const enemy of world.enemies) {
    if (!isDead(enemy)) continue
    if (enemy.deathRemovalTimer == null) enemy.deathRemovalTimer = silent ? 0 : DEATH_ANIM_GRACE_PERIOD
    else if (enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt
  }

  // Troca do meu lado: o proximo de pe entra depois da espera, no lugar do
  // caido (mesma entidade — HUD e camera seguem `world.player`).
  if (isDead(player)) {
    const proximo = temAlguemDePe(arena.meuTime, arena.indiceMeu + 1)
    if (proximo !== -1) {
      arena.trocaMeu = (arena.trocaMeu ?? ESPERA_DE_TROCA_SEGUNDOS) - dt
      if (arena.trocaMeu <= 0) {
        arena.trocaMeu = null
        arena.indiceMeu = proximo
        player.poke = arena.meuTime[proximo]
        player.cooldowns = {}
        player.globalCooldown = 0
        player.flashTimer = 0
        player.fainted = false
        player.deathHandled = false
        player.entradaProcessada = false
        player.state = 'idle'
        player.targetId = null
        apagarTodosOsEstagios(player)
      }
    }
  } else {
    arena.trocaMeu = null
  }

  // Troca do rival: o caido fica como corpo (`keepCorpses`) e o proximo nasce
  // na bola do rival.
  const rivalVivo = world.enemies.some((e) => !isDead(e))
  if (!rivalVivo) {
    const proximo = temAlguemDePe(arena.rivalTime, arena.indiceRival + 1)
    if (proximo !== -1) {
      arena.trocaRival = (arena.trocaRival ?? ESPERA_DE_TROCA_SEGUNDOS) - dt
      if (arena.trocaRival <= 0) {
        arena.trocaRival = null
        arena.indiceRival = proximo
        world.enemies.push(entidadeDoRival(world, arena, arena.rivalTime[proximo]))
      }
    }
  } else {
    arena.trocaRival = null
  }

  // Relido DEPOIS das trocas: quem acabou de entrar conta como vivo.
  const meuLadoAcabou = isDead(player) && temAlguemDePe(arena.meuTime, arena.indiceMeu + 1) === -1
  const rivalAcabou = !world.enemies.some((e) => !isDead(e)) && temAlguemDePe(arena.rivalTime, arena.indiceRival + 1) === -1
  if (meuLadoAcabou && rivalAcabou) arena.resultado = 'empate'
  else if (rivalAcabou) arena.resultado = 'vitoria'
  else if (meuLadoAcabou) arena.resultado = 'derrota'
  else if (arena.ticks >= ARENA_TICKS_MAXIMO) arena.resultado = 'empate'

  if (arena.resultado !== 'lutando') {
    player.state = arena.resultado === 'derrota' ? 'dead' : 'idle'
    player.targetId = null
  }
}

/**
 * Resolucao headless — o que o servidor roda. Mesmo `criarMundoArena` +
 * `stepArena` do cliente, com passo fixo e sem VFX.
 */
export function rodarArena(opcoes: OpcoesDaArena, passo: number): { resultado: ResultadoDaArena; ticks: number; world: WorldState } {
  const world = criarMundoArena(opcoes)
  while (world.arena!.resultado === 'lutando') stepArena(world, passo, { silent: true })
  return { resultado: world.arena!.resultado, ticks: world.arena!.ticks, world }
}
