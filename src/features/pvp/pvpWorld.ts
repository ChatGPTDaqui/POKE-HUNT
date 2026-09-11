import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { getMap } from '@/data/maps'
import { createEnemyEntity, createPlayerEntity } from '@/engine/entity'
import { emptyWorldState } from '@/engine/worldState'
import type { PokeInstance } from '@/data/pokes'
import type { WorldState } from '@/engine/types'

function cloneParaArena(poke: PokeInstance): PokeInstance {
  return {
    ...poke,
    hp: Math.max(1, poke.stats.hp),
    status: null,
  }
}

export function criarMundoPvpVisual(meuPoke: PokeInstance, rival: PokeInstance, treinador: string): WorldState {
  const mapDef = getMap(LANCE_MAP_ID)
  if (!mapDef) throw new Error('Arena de PvP indisponível.')

  const world = emptyWorldState()
  const arena = {
    ...mapDef,
    id: 'pvp_arena',
    name: `Arena PvP: ${treinador}`,
    noRespawn: true,
    noCatch: true,
    noRewards: true,
    autoSwitchTeamOnFaint: false,
    sequence: undefined,
    unlocksContinentOnClear: undefined,
    startCountdown: 5,
    keepCorpses: true,
    encarada: true,
    enemyPool: [mapDef.enemyPool[0]],
  }
  const playerSpawn = { x: arena.playerSpawn.x - 90, y: arena.playerSpawn.y }
  const rivalSpawn = { x: arena.playerSpawn.x + 90, y: arena.playerSpawn.y }
  const player = createPlayerEntity(world.counters, { poke: cloneParaArena(meuPoke), x: playerSpawn.x, y: playerSpawn.y })
  const enemy = createEnemyEntity(world.counters, {
    poke: cloneParaArena(rival),
    x: rivalSpawn.x,
    y: rivalSpawn.y,
    encounterId: mapDef.enemyPool[0],
  })

  enemy.deathHandled = true
  enemy.aggroRadius = 999
  enemy.leashRadius = 999
  enemy.spawnPoint = rivalSpawn

  return {
    ...world,
    mapDef: arena,
    player,
    enemies: [enemy],
    respawnTimer: null,
    countdownRemaining: arena.startCountdown,
    pvp: { treinador, estado: 'lutando' },
  }
}
