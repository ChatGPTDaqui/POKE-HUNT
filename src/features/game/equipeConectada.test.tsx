// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { SPECIES } from '@/data/pokes'
import { proximoAprendizado } from '@/components/shared/ProximoGolpe'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useUiStore } from '@/stores/uiStore'
import { HudLayer } from './HudLayer'

vi.mock('@/hooks/useMedirAltura', () => ({ useMedirAltura: () => {} }))
vi.mock('@/features/arena/PlacarDoDuelo', () => ({ PlacarDoDuelo: () => <div>Placar contextual</div> }))
vi.mock('@/components/hud/ActionDock', () => ({ ActionDock: () => null, SheetMais: () => null }))
vi.mock('@/components/hud/ColunaDeAtalhos', () => ({ ColunaDeAtalhos: () => null }))
vi.mock('@/components/hud/TaxasNoCanto', () => ({ TaxasNoCanto: () => null }))
vi.mock('@/components/toasts/ChatLog', () => ({ ChatLog: () => null }))
vi.mock('@/components/toasts/ChatMobile', () => ({ ChatMobile: () => null }))
vi.mock('@/components/auto/AutoFloatingPanel', () => ({ AutoWindow: () => null }))
vi.mock('@/features/primeirosPassos/Diario', () => ({ PainelDoDiario: () => null }))
vi.mock('@/components/hud/JornadaNaHud', () => ({ JornadaNaHud: () => <div>Objetivos contextuais</div> }))

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
  useGameStateStore.setState({ team: ['bulbasaur', 'squirtle'].map((id, i) => createPokeInstance(createRng(i + 1), id, 10)), activeIndex: 0 })
  useWorldStore.setState({ player: null, sala: null, mapDef: null, clima: null })
  useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, currentScreen: null, coarsePointer: true })
})
afterEach(cleanup)

describe('retratos e âncora permanente da equipe', () => {
  it.each([320, 390, 844, 1366])('mostra próximo golpe junto ao ativo e acompanha troca/nível em %ipx', width => {
    useUiStore.setState({ viewportWidth: width })
    const view = render(<HudLayer />)
    const conferir = () => {
      const ativo = useGameStateStore.getState().team[useGameStateStore.getState().activeIndex]
      const futuro = proximoAprendizado(ativo, SPECIES[ativo.speciesId])!
      const resumo = document.querySelector('.journey-next-move')!
      expect(resumo.closest('.journey-status-rail')).toBeTruthy()
      expect(resumo.closest('.journey-vitals')).toBeTruthy()
      expect(resumo.textContent).toContain(futuro.golpes[0].name)
      expect(resumo.textContent).toContain(`Lv ${futuro.nivel}`)
    }
    conferir()
    useGameStateStore.setState({ activeIndex: 1 })
    view.rerender(<HudLayer />)
    conferir()
    const ativo = useGameStateStore.getState().team[1]
    const futuro = proximoAprendizado(ativo, SPECIES[ativo.speciesId])!
    useGameStateStore.setState({ team: [useGameStateStore.getState().team[0], { ...ativo, level: futuro.nivel }] })
    view.rerender(<HudLayer />)
    conferir()
  })
  it.each([390, 844, 1366, 2560])('usa uma medida única para as duas fotos em %ipx', width => {
    useUiStore.setState({ viewportWidth: width, viewportHeight: width === 844 ? 390 : 844 })
    render(<HudLayer />)
    const poke = screen.getByRole('button', { name: 'Perfil de Bulbasaur' })
    const treinador = screen.getByRole('img', { name: /^Foto de / })
    expect(poke.style.width).toBe('var(--journey-portrait-size, 2.5em)')
    expect(treinador.style.width).toBe(poke.style.width)
    expect(treinador.style.height).toBe(poke.style.height)
    expect(document.querySelector('.journey-party')!.className).not.toContain('max-w-')
    const header = document.querySelector('.journey-status-rail')!
    expect(header.lastElementChild!.contains(treinador)).toBe(true)
    expect(width === 390 ? treinador === treinador.parentElement!.lastElementChild : treinador.classList.contains('order-last')).toBe(true)
  })
  it.each([390, 1366])('reservas não saem do cabeçalho com detalhes, placar ou gestão em %ipx', width => {
    useUiStore.setState({ viewportWidth: width })
    const view = render(<HudLayer />)
    const party = document.querySelector('.journey-party')!
    const trilho = party.firstElementChild!
    const companions = party.querySelector('.journey-companions')!
    const reservas = screen.getByRole('group', { name: 'Companheiros da equipe' })
    expect(trilho.nextElementSibling).toBe(companions)
    expect(companions.contains(reservas)).toBe(true)
    expect(screen.getByText('Placar contextual').parentElement!.className).toContain('absolute')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar detalhes' }))
    expect(document.querySelector('.journey-status-extra')!.className).toContain('absolute')
    expect(trilho.nextElementSibling).toBe(companions)
    useUiStore.setState({ currentScreen: 'mochila' })
    view.rerender(<HudLayer />)
    expect(screen.getByRole('group', { name: 'Companheiros da equipe' })).toBe(reservas)
    expect(companions.closest('.journey-party')).toBe(party)
    expect(reservas.parentElement!.className).toContain('z-[59]')
  })
})
