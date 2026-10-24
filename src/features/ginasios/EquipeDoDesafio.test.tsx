// @vitest-environment jsdom
// Equipe do desafio: comeca com a equipe de caca, o destronar so aceita o tipo,
// a escolha (golpes/rotacao) vai pro desafio e fica lembrada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { EquipeDoDesafio } from './EquipeDoDesafio'

const insetos = ['scyther', 'pinsir', 'heracross', 'scizor', 'butterfree', 'beedrill']
  .map((id, i) => createPokeInstance(createRng(i + 1), id, 90, { uid: `${id}-1` }))
const outros = ['rattata', 'pidgey', 'spearow', 'zubat', 'geodude', 'machop']
  .map((id, i) => createPokeInstance(createRng(i + 20), id, 90, { uid: `${id}-1` }))

beforeEach(() => {
  window.localStorage.clear()
  useGameStateStore.setState({ team: outros, bagPokes: insetos })
  useMochilaStore.setState({ carregada: true, erro: null })
})
afterEach(() => cleanup())

describe('EquipeDoDesafio', () => {
  it('pela insignia comeca com a equipe de caca e desafia com ela', async () => {
    const user = userEvent.setup()
    const aoDesafiar = vi.fn()
    render(<EquipeDoDesafio tipo="BUG" bloqueio={null} ocupado={false} aoDesafiar={aoDesafiar} />)
    await user.click(screen.getByRole('button', { name: /Desafiar pela insígnia/ }))
    const [duelo, slots] = aoDesafiar.mock.calls[0]
    expect(duelo).toBe('insignia')
    expect(slots.map((s: { pokemonId: string }) => s.pokemonId)).toEqual(outros.map((p) => p.uid))
  })

  it('para destronar so entra o tipo; Rotacao vai junto e fica lembrada', async () => {
    const user = userEvent.setup()
    const aoDesafiar = vi.fn()
    const { unmount } = render(<EquipeDoDesafio tipo="BUG" bloqueio={null} ocupado={false} aoDesafiar={aoDesafiar} />)
    await user.click(screen.getByRole('button', { name: /Para destronar/ }))
    // Equipe de caca nao tem BUG: comeca vazia e bloqueada.
    expect(screen.getByText('Faltam 6 POKEs BUG na equipe.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /Montar equipe/ }))
    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: `Adicionar POKE à vaga ${i + 1}` }))
      const caixa = screen.getByRole('region', { name: `Escolher POKE para a vaga ${i + 1}` })
      expect(within(caixa).queryByText('Rattata')).toBeNull()
      await user.click(within(caixa).getAllByRole('button').filter((b) => b.classList.contains('candidate'))[0])
    }
    await user.click(screen.getAllByRole('button', { name: 'Golpes' })[0])
    await user.click(screen.getByRole('radio', { name: /Rotação/ }))
    await user.click(screen.getByRole('button', { name: /Desafiar para destronar/ }))
    const [duelo, slots] = aoDesafiar.mock.calls[0]
    expect(duelo).toBe('destronar')
    expect(slots).toHaveLength(6)
    expect(slots[0].rotacao).toBe(true)

    unmount()
    render(<EquipeDoDesafio tipo="BUG" bloqueio={null} ocupado={false} aoDesafiar={aoDesafiar} />)
    await user.click(screen.getByRole('button', { name: /Para destronar/ }))
    expect(screen.queryByText(/Faltam/)).toBeNull()
  })

  it('bloqueio de fora (ouro, limite) trava o botao e aparece', () => {
    render(<EquipeDoDesafio tipo="BUG" bloqueio="Precisa de 50.000 de ouro." ocupado={false} aoDesafiar={vi.fn()} />)
    expect((screen.getByRole('button', { name: /Desafiar pela insígnia/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Precisa de 50.000 de ouro.')).toBeTruthy()
  })
})
