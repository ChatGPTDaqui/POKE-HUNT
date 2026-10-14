// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ActionDock, SheetMais } from './ActionDock'
import { ColunaDeAtalhos, TELAS_NA_COLUNA } from './ColunaDeAtalhos'
import { useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { useDiarioStore } from '@/stores/diarioStore'
import { MAPS } from '@/data/maps'

vi.mock('@/hooks/usePendencias', () => ({
  usePendenciasDoMercado: () => 0, usePendenciasDoSocial: () => ({ total: 0 }), fraseDasPendencias: () => null,
}))
vi.mock('@/components/auto/estoqueBaixo', () => ({ useEstoqueBaixoNoAuto: () => false, LIMIAR_ESTOQUE_BAIXO: 10 }))
vi.mock('@/components/hud/AbilityHud', () => ({ AbilityHud: () => <span>Controles de golpes</span> }))
vi.mock('@/components/hud/StatusEffectsBar', () => ({ StatusEffectsBar: () => null }))
vi.mock('@/features/primeirosPassos/useDestaqueDoPasso', () => ({ useDestaqueDoPasso: () => ({ classe: '', aoTocar() {} }) }))
vi.mock('@/features/primeirosPassos/useDesbloqueio', () => ({ useTrancas: () => () => null, avisarTrancado: vi.fn() }))
beforeEach(() => {
  useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, coarsePointer: true, currentScreen: null, moreOpen: false, viagemAoHospital: null })
  useWorldStore.setState({ mapDef: null })
  useDiarioStore.setState({ painelAberto: false })
})
afterEach(cleanup)
describe('navegação Jornada', () => {
  it.each([390, 844, 1366])('mantém oito destinos na mesma ordem e com nomes em %ipx', width => {
    useUiStore.setState({ viewportWidth: width, viewportHeight: width === 844 ? 390 : 844 })
    render(<ActionDock />)
    const nomes = within(screen.getByRole('navigation')).getAllByRole('button').map(b => b.getAttribute('aria-label'))
    expect(nomes).toEqual(['Equipe', 'Mochila', 'Pokédex', 'Hunt', 'Loja', 'Hospital', 'Mercado', 'Mais'])
    expect(screen.getByRole('navigation').querySelectorAll('.equipment-art')).toHaveLength(8)
    expect(within(screen.getByRole('navigation')).getByText('Hospital')).toBeTruthy()
  })
  it('troca menus em um toque e esconde só os controles visuais de combate', () => {
    render(<ActionDock />)
    expect(screen.getByText('Controles de golpes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mochila' }))
    expect(useUiStore.getState().currentScreen).toBe('mochila')
    expect(screen.queryByText('Controles de golpes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }))
    expect(useUiStore.getState().currentScreen).toBe('equipe')
  })
  it('preserva marcar e cancelar viagem ao Hospital', () => {
    const map = Object.values(MAPS)[0]
    useWorldStore.setState({ mapDef: { ...map, collisionGrid: map.collisionGrid ?? null } })
    render(<ActionDock />)
    fireEvent.click(screen.getByRole('button', { name: 'Hospital' }))
    expect(useUiStore.getState().viagemAoHospital).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hospital' }))
    expect(useUiStore.getState().viagemAoHospital).toBeNull()
  })
  it('recolhe controles sob o Diário e volta à navegação em um toque', () => {
    useDiarioStore.setState({ painelAberto: true })
    render(<ActionDock />)
    expect(screen.queryByText('Controles de golpes')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mochila' }))
    expect(useDiarioStore.getState().painelAberto).toBe(false)
    expect(useUiStore.getState().currentScreen).toBe('mochila')
  })
  it('coloca Diário antes dos quatro atalhos, com nomes acessíveis e sem textos visíveis', () => {
    render(<ColunaDeAtalhos />)
    expect(TELAS_NA_COLUNA.map(d => d.screen)).toEqual(['especialidades', 'tasks', 'calc', 'pvp'])
    const coluna = document.querySelector<HTMLElement>('[data-journey-shortcuts]')!
    expect(within(coluna).getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['Diário', 'Especialidades', 'Tasks', 'Calculadora', 'PvP'])
    expect(within(coluna).queryByRole('button', { name: /Perfil do treinador/ })).toBeNull()
    expect(coluna.textContent).not.toContain('Especialidades')
    fireEvent.click(screen.getByRole('button', { name: 'Diário' }))
    expect(useDiarioStore.getState().painelAberto).toBe(true)
  })
  it('agrupa o guia sem perder destinos ou repetir os atalhos fixos', () => {
    useUiStore.setState({ moreOpen: true })
    render(<div id="camada-hud"><SheetMais /></div>)
    const social = screen.getByRole('region', { name: 'Encontrar outros treinadores' })
    expect(within(social).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Social', 'Troca', 'Ranking'])
    const tools = screen.getByRole('region', { name: 'Consultar e ajustar' })
    expect(within(tools).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Conquistas', 'Bestiário', 'Wiki', 'Tutoriais', 'Ajustes'])
    fireEvent.click(within(tools).getByRole('button', { name: 'Wiki' }))
    expect(useUiStore.getState().currentScreen).toBe('wiki')
    expect(useUiStore.getState().moreOpen).toBe(false)
  })
})
