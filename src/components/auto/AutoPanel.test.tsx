// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { AutoPanel } from './AutoPanel'

vi.mock('@/stores/tutorialStore', () => ({
  TUTORIAL_BOT: 'bot', useTutorialStore: { getState: () => ({ abrirSeInedito: vi.fn() }) },
}))

beforeEach(() => useGameStateStore.getState().resetToDefaults())
afterEach(cleanup)

it('oferece a rotação de golpes e as quatro rotinas sem empilhar suas configurações', () => {
  render(<AutoPanel />)
  expect(screen.getAllByRole('switch')).toHaveLength(5)
  expect(screen.getAllByRole('button', { name: /^Configurar Auto-/ })).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'Bola padrão' })).toBeNull()
})

it('mantém seletores padrão e shiny independentes do interruptor shiny', () => {
  render(<AutoPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Auto-catch' }))
  const padrao = screen.getByRole('button', { name: 'Bola padrão' })
  const shiny = screen.getByRole('button', { name: 'Bola Shiny' })
  expect(padrao.closest('label')).toBeNull()
  expect(shiny.closest('label')).toBeNull()
  fireEvent.click(screen.getByRole('switch', { name: 'Usar bola diferente em shinies' }))
  expect((shiny as HTMLButtonElement).disabled).toBe(!useGameStateStore.getState().autoCatchConfig.catchShinyEnabled)
  expect((padrao as HTMLButtonElement).disabled).toBe(false)
})

it('permite editar poção mesmo desligada e mantém o valor ao recolher', () => {
  useGameStateStore.setState({
    autoPotRules: [{ hpPercent: 70, itemId: 'potion' }],
    autoToggles: { ...useGameStateStore.getState().autoToggles, autoPot: false },
  })
  render(<AutoPanel />)
  expect(screen.queryByRole('spinbutton')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Auto-pot' }))
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '40' } })
  expect(useGameStateStore.getState().autoPotRules[0].hpPercent).toBe(40)
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Auto-pot' }))
  expect(screen.getByText('HP ≤ 40% · Potion')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Auto-pot' }))
  expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('40')
})

it('Lure continua acessível com quantidade e avisos, sem mudar a configuração', () => {
  const antes = useGameStateStore.getState().lureConfig
  render(<AutoPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Lure' }))
  expect(screen.getByRole('switch', { name: 'Lure' })).toBeTruthy()
  expect(screen.getByText(/Shiny em campo cancela/)).toBeTruthy()
  expect(useGameStateStore.getState().lureConfig).toBe(antes)
})
