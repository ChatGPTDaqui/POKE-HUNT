import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { stepPvpVisual } from '@/engine/systems/pvpSystem'
import { criarMundoPvpVisual } from './pvpWorld'

describe('criarMundoPvpVisual', () => {
  it('monta uma arena visual sem reutilizar a instancia viva do save', () => {
    const meuPoke = createPokeInstance(createRng(1), 'charizard', 50)
    const rival = createPokeInstance(createRng(2), 'blastoise', 50)
    meuPoke.hp = 1
    rival.hp = 1

    const world = criarMundoPvpVisual(meuPoke, rival, 'Azul')

    expect(world.pvp).toEqual({ treinador: 'Azul', estado: 'lutando' })
    expect(world.mapDef?.id).toBe('pvp_arena')
    expect(world.mapDef?.encarada).toBe(true)
    expect(world.mapDef?.noRewards).toBe(true)
    expect(world.player?.poke.hp).toBe(meuPoke.stats.hp)
    expect(world.enemies[0]?.poke.hp).toBe(rival.stats.hp)
    expect(meuPoke.hp).toBe(1)
    expect(rival.hp).toBe(1)
  })

  it('congela o duelo durante a contagem de abertura', () => {
    const meuPoke = createPokeInstance(createRng(1), 'charizard', 50)
    const rival = createPokeInstance(createRng(2), 'blastoise', 50)
    const world = criarMundoPvpVisual(meuPoke, rival, 'Azul')
    const hpInicial = world.enemies[0]!.poke.hp

    stepPvpVisual(world, 1)

    expect(world.countdownRemaining).toBeGreaterThan(0)
    expect(world.enemies[0]!.poke.hp).toBe(hpInicial)
  })
})
