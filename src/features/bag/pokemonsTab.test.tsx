// @vitest-environment jsdom
//
// PH-558 — rolagem incremental na aba Pokemons da mochila (mesma troca da
// PH-557, so que aqui o lote inicial precisa de dado fabricado: a mochila
// real nao tem um catalogo fixo de POKE como TM/item tem.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { LOTE_INCREMENTAL } from '@/components/game/Paginacao'
import { useGameStateStore } from '@/stores/gameStateStore'
import { PokemonsTab } from './BagMenu'

vi.mock('./useMochila', () => ({ useMochila: () => ({ carregada: true, erro: null }) }))
vi.mock('@/data/remote/autoridade', () => ({ pedirAcao: async (_acao: unknown, fallback: () => unknown) => fallback() }))

function pokesDeSobra(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const poke = createPokeInstance(createRng(1000 + i), 'rattata', 5 + i)
    poke.uid = `poke-${i}`
    return poke
  })
}

beforeEach(() => {
  cleanup()
  useGameStateStore.setState({ bagPokes: [], team: [] })
})

describe('Rolagem incremental na aba Pokemons (PH-558)', () => {
  it('comeca com um lote e revela mais ao chegar perto do fim', () => {
    const total = LOTE_INCREMENTAL + 10
    useGameStateStore.setState({ bagPokes: pokesDeSobra(total) })

    render(<PokemonsTab />)
    expect(screen.getAllByRole('radio')).toHaveLength(LOTE_INCREMENTAL)

    const grade = screen.getByRole('radiogroup', { name: 'POKEs da mochila' })
    Object.defineProperty(grade, 'scrollHeight', { configurable: true, value: 1000 })
    Object.defineProperty(grade, 'clientHeight', { configurable: true, value: 200 })
    Object.defineProperty(grade, 'scrollTop', { configurable: true, value: 950 })
    fireEvent.scroll(grade)

    expect(screen.getAllByRole('radio')).toHaveLength(total)
  })
})
