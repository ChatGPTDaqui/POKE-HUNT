// @vitest-environment jsdom
// A face do POKE em campo mostra a comemoracao (`joyous`) tanto no level-up
// (ja coberto por FESTEJO_MS) quanto no duelo vencido sem mais ninguem pra
// lutar (nova fonte, PH: vitoriaDoDuelo.ts). So o POKE EM CAMPO comemora — um
// reserva no trilho, que passa pelo mesmo hook, nao.
import { describe, expect, it, afterEach } from 'vitest'
import { renderHook, cleanup } from '@testing-library/react'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { criarMundoArena, stepArena } from '@/engine/arena'
import { useWorldStore } from '@/stores/worldStore'
import { useFaceDoPoke } from './useFaceDoPoke'

const PASSO = 0.1

function pokeForte(uid: string, speciesId: string) {
  const p = createPokeInstance(createRng(1), speciesId, 100, {
    ivs: { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }, rarity: 'legendary',
  })
  p.uid = uid
  p.stats = { ...p.stats, hp: 99999, atkFis: 99999, atkEsp: 99999, speed: 500 }
  p.hp = 99999
  return p
}

function pokeFragil(uid: string) {
  const p = createPokeInstance(createRng(2), 'rattata', 5)
  p.uid = uid
  return p
}

describe('useFaceDoPoke: comemoracao de duelo vencido', () => {
  afterEach(() => {
    cleanup()
    useWorldStore.getState().resetWorld()
  })

  it('o POKE em campo mostra a cara de comemoracao depois de vencer a arena', () => {
    const meu = pokeForte('m1', 'dragonite')
    const world = criarMundoArena({
      semente: 3, meuTime: [meu], rivalTime: [pokeFragil('r1')], nomeDoRival: 'Fraco',
    })
    while (world.arena!.resultado === 'lutando') stepArena(world, PASSO, { silent: true })
    useWorldStore.getState().setWorld(world)

    const { result } = renderHook(() => useFaceDoPoke(meu))
    expect(result.current).toBe('joyous')
  })

  it('um RESERVA (fora de campo) nao comemora so porque o duelo foi vencido', () => {
    const meu = pokeForte('m1', 'dragonite')
    const reserva = pokeFragil('r-banco')
    const world = criarMundoArena({
      semente: 3, meuTime: [meu], rivalTime: [pokeFragil('r1')], nomeDoRival: 'Fraco',
    })
    while (world.arena!.resultado === 'lutando') stepArena(world, PASSO, { silent: true })
    useWorldStore.getState().setWorld(world)

    const { result } = renderHook(() => useFaceDoPoke(reserva))
    expect(result.current).not.toBe('joyous')
  })
})
