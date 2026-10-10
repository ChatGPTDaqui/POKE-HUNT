// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JornadaDoTreinador, ProximoObjetivo } from './JornadaDoTreinador'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'
import { BIOMAS } from '@/data/biomas'
import { especialidadeNiveisDefault } from '@/data/especialidades'

afterEach(cleanup)
beforeEach(() => {
  useGameStateStore.setState({ biomaProgress: {}, unlockedContinents: ['biomas'], pokedexKills: {}, missoesReivindicadas: {}, especialidades: especialidadeNiveisDefault() })
  useUiStore.setState({ currentScreen: null })
})
describe('jornada na interface', () => {
  it('não sugere lendários do conteúdo paralelo como meta de pesquisa', () => {
    useGameStateStore.setState({ pokedexKills: { mewtwo: { normal: 499, shiny: 0 }, rattata: { normal: 12, shiny: 0 } } })
    render(<JornadaDoTreinador onBioma={vi.fn()} onLance={vi.fn()} />)
    const bestiario = screen.getByRole('heading', { name: 'Bestiário · pesquisa de espécies' }).parentElement!
    expect(bestiario.textContent).toContain('Rattata: 12/500')
    expect(bestiario.textContent).not.toContain('Mewtwo')
  })
  it('abre objetivo e mantém as ações das trilhas navegáveis', () => {
    render(<ProximoObjetivo />)
    fireEvent.click(screen.getByRole('button', { name: 'Abrir jornada e próximo objetivo' }))
    expect(useUiStore.getState().currentScreen).toBe('hunts')
  })
  it('não oferece Pesadelo ou Lance antes dos gates e navega para bioma sem iniciar hunt', () => {
    const onBioma = vi.fn()
    render(<JornadaDoTreinador onBioma={onBioma} onLance={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Ver Lance' }) as HTMLButtonElement).disabled).toBe(true)
    // Antes de Lance os marcos do Pesadelo nem aparecem (Primeiros Passos, 10/10).
    expect(screen.queryByRole('region', { name: 'Explorador do Pesadelo' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: `${BIOMAS[0].nome} · estágio 1` })[0])
    expect(onBioma).toHaveBeenCalledWith(BIOMAS[0].chave, false)
    fireEvent.click(screen.getByRole('button', { name: 'Ver missões' }))
    expect(useUiStore.getState().currentScreen).toBe('tasks')
    fireEvent.click(screen.getByRole('button', { name: 'Ver Bestiário' }))
    expect(useUiStore.getState().currentScreen).toBe('bestiario')
    fireEvent.click(screen.getByRole('button', { name: 'Ver especialidades' }))
    expect(useUiStore.getState().currentScreen).toBe('especialidades')
  })
  it('começa recolhida: o objetivo imediato é o cartão de Primeiros Passos', () => {
    const { container } = render(<JornadaDoTreinador onBioma={vi.fn()} onLance={vi.fn()} />)
    expect((container.querySelector('details') as HTMLDetailsElement).open).toBe(false)
  })
  it('após Lance oferece Pesadelo sem exigir Mundo completo', () => {
    useGameStateStore.setState({ biomaProgress: Object.fromEntries(BIOMAS.map(b => [b.chave, 5])), unlockedContinents: ['biomas', 'nightmare'] })
    const onBioma = vi.fn()
    render(<JornadaDoTreinador onBioma={onBioma} onLance={vi.fn()} />)
    const card = screen.getByRole('region', { name: 'Explorador do Pesadelo' })
    fireEvent.click(card.querySelector('button')!)
    expect(onBioma).toHaveBeenCalledWith(BIOMAS[0].chave, true)
    expect(screen.getByRole('region', { name: 'Mundo completo' }).textContent).toContain('0/12')
  })
})
