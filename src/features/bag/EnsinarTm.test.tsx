// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { EnsinarTm } from './EnsinarTm'

vi.mock('./useMochila', () => ({ useMochila: () => ({ carregada: true, erro: null }) }))
vi.mock('@/data/remote/autoridade', () => ({ pedirAcao: async (_acao: unknown, fallback: () => unknown) => fallback() }))

beforeEach(() => {
  cleanup()
  const poke = createPokeInstance(createRng(512), 'charizard', 60)
  poke.uid = 'poke-teste'
  useGameStateStore.setState({ team: [poke], bagPokes: [], currentMapId: null, items: { tm_26: 2 }, lockedItems: {} })
})
describe('ensinar TM pela mochila', () => {
  it('explica o golpe e separa a equipe antes da mochila', () => {
    const reserva = createPokeInstance(createRng(513), 'geodude', 5)
    reserva.uid = 'poke-reserva'
    useGameStateStore.setState({ bagPokes: [reserva] })

    const { container } = render(<EnsinarTm itemId="tm_26" />)

    const detalhes = screen.getByRole('region', { name: 'Detalhes de Earthquake' })
    expect(detalhes.textContent).toContain('Dano base100')
    expect(detalhes.textContent).toContain('Precisão100%')
    const grupos = [...container.querySelectorAll('optgroup')]
    expect(grupos.map(grupo => grupo.label)).toEqual(['Equipe — recomendado', 'Mochila'])
    expect(grupos[0].textContent).toContain('Charizard')
    expect(grupos[1].textContent).toContain('Geodude')
  })

  it('consome uma unidade e registra o golpe permanentemente', async () => {
    render(<EnsinarTm itemId="tm_26" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'poke-teste' } })
    fireEvent.click(screen.getByRole('button', { name: /Ensinar/ }))
    await waitFor(() => expect(useGameStateStore.getState().items.tm_26).toBe(1))
    const poke = useGameStateStore.getState().team[0]
    expect(poke.golpesDeMaquina).toContain('earthquake')
    expect(poke.unlockedAbilities).toContain('earthquake')
    expect((screen.getByRole('button', { name: /Ensinar/ }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('bloqueia ensino durante hunt e com item trancado', () => {
    useGameStateStore.setState({ currentMapId: 'route_46', lockedItems: { tm_26: true } })
    render(<EnsinarTm itemId="tm_26" />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'poke-teste' } })
    expect((screen.getByRole('button', { name: /Ensinar/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(useGameStateStore.getState().items.tm_26).toBe(2)
  })
})
