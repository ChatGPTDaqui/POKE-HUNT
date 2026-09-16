// Comemoracao ao vencer o duelo: em vez de vagar sem rumo (movementSystem's
// `wander`), o POKE para e repete `Hop` (mesma pose do level-up) ate o
// jogador sair. Cobre os tres tipos de duelo (`mapDef.encarada`): arena,
// Campeao Lance e covil de lendario — e prova que hunts normais e o vao ENTRE
// membros da sequencia do Lance nao disparam a comemoracao a toa.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, type PokeInstance } from '@/data/pokes'
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { useGameStateStore } from '@/stores/gameStateStore'
import { criarMundoArena, stepArena } from '../arena'
import { buildMapWorld, stepWorld } from '../simulation'
import { pularAbertura } from '../testes/aberturaDeTeste'
import type { WorldState } from '../types'
import { duelVencido, POSE_DE_VITORIA } from './vitoriaDoDuelo'

const PASSO = 0.1
const IV_FULL = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }

function pokeForte(uid: string, speciesId: string): PokeInstance {
  const p = createPokeInstance(createRng(1), speciesId, 100, { ivs: { ...IV_FULL }, rarity: 'legendary' })
  p.uid = uid
  p.stats = { ...p.stats, hp: 99999, atkFis: 99999, atkEsp: 99999, speed: 500 }
  p.hp = 99999
  return p
}

function pokeFragil(uid: string, speciesId = 'rattata'): PokeInstance {
  return {
    uid, speciesId, level: 5, isShiny: false, rarity: 'comum', exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 20, atkFis: 10, atkEsp: 10, def: 5, defEsp: 5, speed: 10 },
    hp: 20, unlockedAbilities: [], activeAbilities: ['basic_attack'],
  }
}

describe('vitoria do duelo: duelVencido (pura)', () => {
  it('false fora do duelo (mapDef.encarada ausente), mesmo sem inimigo', () => {
    const world = { mapDef: { encarada: false } as never, player: { id: 'p' } as never, enemies: [], sequenceCleared: false, arena: null } as unknown as WorldState
    expect(duelVencido(world)).toBe(false)
  })

  it('false com o jogador desmaiado', () => {
    const world = {
      mapDef: { encarada: true } as never,
      player: { id: 'p', fainted: true, poke: { hp: 0 } } as never,
      enemies: [], sequenceCleared: false, arena: null,
    } as unknown as WorldState
    expect(duelVencido(world)).toBe(false)
  })

  it('arena: so quando resultado === vitoria', () => {
    const base = {
      mapDef: { encarada: true } as never,
      player: { id: 'p', fainted: false, poke: { hp: 10 } } as never,
      enemies: [], sequenceCleared: false,
    }
    for (const [resultado, esperado] of [['lutando', false], ['vitoria', true], ['derrota', false], ['empate', false]] as const) {
      expect(duelVencido({ ...base, arena: { resultado } as never })).toBe(esperado)
    }
  })

  it('Lance: sequenceCleared vence, mesmo com corpos em `enemies` (keepCorpses)', () => {
    const world = {
      mapDef: { encarada: true, sequence: ['a', 'b'] } as never,
      player: { id: 'p', fainted: false, poke: { hp: 10 } } as never,
      enemies: [{ id: 'e', poke: { hp: 0 } }] as never,
      sequenceCleared: true, arena: null,
    } as unknown as WorldState
    expect(duelVencido(world)).toBe(true)
  })

  it('Lance: o vao ENTRE membros (proximo ainda nao nasceu) NAO e vitoria', () => {
    const world = {
      mapDef: { encarada: true, sequence: ['a', 'b'], noRespawn: true } as never,
      player: { id: 'p', fainted: false, poke: { hp: 10 } } as never,
      enemies: [], sequenceCleared: false, arena: null,
    } as unknown as WorldState
    expect(duelVencido(world)).toBe(false)
  })

  it('covil (BOSS): sem sequencia, noRespawn e ninguem vivo = vencido', () => {
    const world = {
      mapDef: { encarada: true, noRespawn: true } as never,
      player: { id: 'p', fainted: false, poke: { hp: 10 } } as never,
      enemies: [{ id: 'e', poke: { hp: 0 } }] as never,
      sequenceCleared: false, arena: null,
    } as unknown as WorldState
    expect(duelVencido(world)).toBe(true)
  })

  it('covil (BOSS): com o chefe vivo, nao e vitoria', () => {
    const world = {
      mapDef: { encarada: true, noRespawn: true } as never,
      player: { id: 'p', fainted: false, poke: { hp: 10 } } as never,
      enemies: [{ id: 'e', poke: { hp: 50 } }] as never,
      sequenceCleared: false, arena: null,
    } as unknown as WorldState
    expect(duelVencido(world)).toBe(false)
  })
})

describe('vitoria do duelo: integrado', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('arena: para de vagar e repete Hop apos vencer', () => {
    const world = criarMundoArena({
      semente: 3,
      meuTime: [pokeForte('m1', 'dragonite')],
      rivalTime: [pokeFragil('r1')],
      nomeDoRival: 'Fraco',
    })
    while (world.arena!.resultado === 'lutando') stepArena(world, PASSO, { silent: true })
    expect(world.arena!.resultado).toBe('vitoria')

    const antes = { x: world.player!.x, y: world.player!.y }
    for (let i = 0; i < 50; i++) stepArena(world, PASSO, { silent: true })
    expect(world.player!.x).toBe(antes.x)
    expect(world.player!.y).toBe(antes.y)
    expect(world.player!.state).not.toBe('wander')

    // So o desenho (`!silent`) resolve o animOverride em animacao de verdade,
    // mas o campo que `desiredAnimName` le ja esta armado independente disso.
    stepArena(world, PASSO, { silent: false })
    expect(world.player!.animOverride).toBe(POSE_DE_VITORIA)
  })

  it('Lance: depois de zerar a sequencia, para no lugar e comemora', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeForte('destruidor', 'mewtwo'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld(LANCE_MAP_ID, gameState.team[0], {
      seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    pularAbertura(world, gameState)

    for (let i = 0; i < 6000 && !world.sequenceCleared; i++) stepWorld(world, PASSO, gameState, { silent: true })
    expect(world.sequenceCleared).toBe(true)
    expect(duelVencido(world)).toBe(true)

    const antes = { x: world.player!.x, y: world.player!.y }
    for (let i = 0; i < 100; i++) stepWorld(world, PASSO, gameState, { silent: true })
    expect(world.player!.state).not.toBe('wander')
    expect(world.player!.x).toBe(antes.x)
    expect(world.player!.y).toBe(antes.y)
    expect(world.player!.animOverride).toBe(POSE_DE_VITORIA)
  })

  it('covil: depois de derrubar o chefe, para no lugar e comemora', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeForte('destruidor', 'mewtwo'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld('boss_articuno', gameState.team[0], {
      seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    pularAbertura(world, gameState)

    for (let i = 0; i < 6000 && !duelVencido(world); i++) stepWorld(world, PASSO, gameState, { silent: true })
    expect(duelVencido(world)).toBe(true)

    const antes = { x: world.player!.x, y: world.player!.y }
    for (let i = 0; i < 100; i++) stepWorld(world, PASSO, gameState, { silent: true })
    expect(world.player!.state).not.toBe('wander')
    expect(world.player!.x).toBe(antes.x)
    expect(world.player!.y).toBe(antes.y)
    expect(world.player!.animOverride).toBe(POSE_DE_VITORIA)
  })

  it('hunt normal (sem encarada): nunca comemora, mesmo sem nenhum inimigo por perto', () => {
    const gs = useGameStateStore.getState()
    gs.addPokeToTeam(pokeForte('destruidor', 'mewtwo'))
    gs.setActiveIndex(0)
    const gameState = useGameStateStore.getState()
    const world = buildMapWorld('route_46', gameState.team[0], {
      seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    for (let i = 0; i < 50; i++) stepWorld(world, PASSO, gameState, { silent: true })
    expect(duelVencido(world)).toBe(false)
    expect(world.player!.animOverride).toBeUndefined()
  })
})
