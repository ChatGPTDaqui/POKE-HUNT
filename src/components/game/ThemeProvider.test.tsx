// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { ThemeProvider, UI_THEME_STORAGE_KEY } from './ThemeProvider'
import { ThemeSelector } from '@/features/settings/ThemeSelector'

let saved = new Map<string, string>()
beforeEach(() => {
  saved = new Map()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(key => saved.get(key) ?? null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => { saved.set(key, value) })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-ui-theme')
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = ''
})

function Partida() {
  const [turno, setTurno] = useState(0)
  return <button onClick={() => setTurno(n => n + 1)}>Turno {turno}</button>
}
function AppDeTeste() {
  return <ThemeProvider><ThemeSelector /><Partida /></ThemeProvider>
}

describe('tema da interface', () => {
  it('começa no escuro e anuncia o estado das duas opções', () => {
    render(<AppDeTeste />)
    expect(document.documentElement.dataset.uiTheme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Claro · Jornada' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: 'Escuro · Dark Glass' }).getAttribute('aria-pressed')).toBe('true')
  })
  it('troca em tempo real, sem recriar filhos, e restaura após remontar', () => {
    const view = render(<AppDeTeste />)
    fireEvent.click(screen.getByText('Turno 0'))
    fireEvent.click(screen.getByRole('button', { name: 'Claro · Jornada' }))
    expect(document.documentElement.dataset.uiTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(screen.getByText('Turno 1')).toBeTruthy()
    expect(saved.has(UI_THEME_STORAGE_KEY)).toBe(true)
    view.unmount()
    render(<AppDeTeste />)
    expect(document.documentElement.dataset.uiTheme).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Escuro · Dark Glass' }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
  it.each(['corrompido', '"system"', '{}', 'enc:invalido'])('ignora preferência inválida: %s', raw => {
    saved.set(UI_THEME_STORAGE_KEY, raw)
    render(<AppDeTeste />)
    expect(document.documentElement.dataset.uiTheme).toBe('dark')
  })
  it('permite alternar mesmo quando o aparelho bloqueia a persistência', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('bloqueado') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('cheio') })
    render(<AppDeTeste />)
    fireEvent.click(screen.getByRole('button', { name: 'Claro · Jornada' }))
    expect(document.documentElement.dataset.uiTheme).toBe('light')
  })
})
