import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { getMap } from '@/data/maps'
import { createEnemyEntity, createPlayerEntity } from '@/engine/entity'
import { emptyWorldState } from '@/engine/worldState'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import type { PokeInstance } from '@/data/pokes'
import type { WorldState } from '@/engine/types'
import type { PvpEventoRemoto, LadoPvpRemoto } from '@/data/remote/servidor'

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

const NIVEL_VISUAL_REPLAY = 50

// PH-532: mundo pro replay animado — resultado ja veio pronto do servidor
// (`/pvp/resolver`), aqui so monta o palco (2 POKE parados, sem IA/fisica) e
// entrega a fila de eventos pro `pvpReplaySystem` consumir. Os dois POKE
// iniciais vem do PRIMEIRO evento (especie/shiny), e trocam sozinhos durante
// o replay se o time daquele lado perder o ativo e o proximo evento trouxer
// outra especie — sem precisar saber a equipe inteira de antemao.
export function criarMundoPvpReplay(
  eventos: PvpEventoRemoto[],
  meuLado: LadoPvpRemoto,
  resultadoFinal: 'vitoria' | 'derrota' | 'empate',
  treinador: string,
): WorldState {
  const mapDef = getMap(LANCE_MAP_ID)
  if (!mapDef) throw new Error('Arena de PvP indisponível.')
  const primeiro = eventos[0]
  if (!primeiro) throw new Error('Duelo sem eventos para reproduzir.')

  const doMeuLado = (lado: LadoPvpRemoto) => (primeiro.atacanteLado === lado
    ? { speciesId: primeiro.atacanteSpeciesId, isShiny: primeiro.atacanteShiny }
    : { speciesId: primeiro.defensorSpeciesId, isShiny: primeiro.defensorShiny })
  const outroLado: LadoPvpRemoto = meuLado === 'anfitriao' ? 'convidado' : 'anfitriao'
  const meuInicial = doMeuLado(meuLado)
  const rivalInicial = doMeuLado(outroLado)

  const pokeVisual = (speciesId: string, isShiny: boolean) => {
    const poke = createPokeInstance(createRng(0), speciesId, NIVEL_VISUAL_REPLAY)
    poke.isShiny = isShiny
    return poke
  }

  const arena = {
    ...mapDef,
    id: 'pvp_arena_replay',
    name: `Replay PvP: ${treinador}`,
    noRespawn: true,
    noCatch: true,
    noRewards: true,
    autoSwitchTeamOnFaint: false,
    sequence: undefined,
    unlocksContinentOnClear: undefined,
    startCountdown: undefined,
    keepCorpses: true,
    encarada: false,
    enemyPool: [mapDef.enemyPool[0]],
  }
  const world = emptyWorldState()
  const playerSpawn = { x: arena.playerSpawn.x - 90, y: arena.playerSpawn.y }
  const rivalSpawn = { x: arena.playerSpawn.x + 90, y: arena.playerSpawn.y }
  const player = createPlayerEntity(world.counters, {
    poke: pokeVisual(meuInicial.speciesId, meuInicial.isShiny), x: playerSpawn.x, y: playerSpawn.y,
  })
  const enemy = createEnemyEntity(world.counters, {
    poke: pokeVisual(rivalInicial.speciesId, rivalInicial.isShiny),
    x: rivalSpawn.x,
    y: rivalSpawn.y,
    encounterId: mapDef.enemyPool[0],
  })
  enemy.deathHandled = true
  enemy.aggroRadius = 999
  enemy.leashRadius = 999
  enemy.spawnPoint = rivalSpawn
  player.facing = { x: 1, y: 0 }
  enemy.facing = { x: -1, y: 0 }

  return {
    ...world,
    mapDef: arena,
    player,
    enemies: [enemy],
    respawnTimer: null,
    countdownRemaining: null,
    pvp: {
      treinador,
      estado: 'replay',
      meuLado,
      resultadoFinal,
      replay: { eventos, indice: 0, esperando: 0.6 },
    },
  }
}
