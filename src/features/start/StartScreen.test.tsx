// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { StartScreen } from './StartScreen'

vi.mock('@/engine/controller', () => ({ controller: {
  definirNomeDoTreinador: vi.fn().mockResolvedValue(true), chooseStarter: vi.fn(),
} }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('mantém os três iniciais e só escolhe após confirmação explícita', async () => {
  useGameStateStore.setState({ trainer: { ...useGameStateStore.getState().trainer, name: 'Treinador_Teste' } })
  render(<StartScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar e escolher meu POKE' }))
  const escolhas = await screen.findAllByRole('button', { name: 'Escolher' })
  expect(escolhas).toHaveLength(3)
  for (const nome of ['Charmander', 'Squirtle', 'Bulbasaur']) expect(screen.getByRole('img', { name: nome })).toBeTruthy()
  expect(controller.chooseStarter).not.toHaveBeenCalled()
  fireEvent.click(escolhas[1])
  expect(controller.chooseStarter).toHaveBeenCalledWith('squirtle', { x: 0, y: 0 })
})
