// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { BlocoAuto } from './BlocoAuto'

afterEach(cleanup)

it('mostra resumo e toggle sem abrir todas as regras por padrão', () => {
  const aoLigar = vi.fn()
  render(<BlocoAuto titulo="Auto-catch" dica="Lança a bola selecionada." resumo="Poké Ball ×12"
    ligado={false} aoLigar={aoLigar}><input aria-label="Regra" defaultValue="12" /></BlocoAuto>)
  const configurar = screen.getByRole('button', { name: 'Configurar Auto-catch' })
  expect(configurar.getAttribute('aria-expanded')).toBe('false')
  expect(screen.getByText('Poké Ball ×12')).toBeTruthy()
  expect(screen.queryByRole('textbox', { name: 'Regra' })).toBeNull()
  fireEvent.click(screen.getByRole('switch', { name: 'Auto-catch' }))
  expect(aoLigar).toHaveBeenCalledWith(true)
  expect(configurar.getAttribute('aria-expanded')).toBe('false')
  fireEvent.click(configurar)
  expect(screen.getByRole('textbox', { name: 'Regra' })).toBeTruthy()
  expect(screen.getByText('Lança a bola selecionada.')).toBeTruthy()
})

it('recolher não desmonta nem apaga a configuração editada', () => {
  render(<BlocoAuto titulo="Auto-pot" dica="Cura pelo limite." resumo="HP ≤ 70%"
    ligado aoLigar={() => {}}><input aria-label="Limite" defaultValue="70" /></BlocoAuto>)
  const configurar = screen.getByRole('button', { name: 'Configurar Auto-pot' })
  fireEvent.click(configurar)
  fireEvent.change(screen.getByRole('textbox', { name: 'Limite' }), { target: { value: '40' } })
  fireEvent.click(configurar)
  fireEvent.click(configurar)
  expect((screen.getByRole('textbox', { name: 'Limite' }) as HTMLInputElement).value).toBe('40')
})

it('Lure sem resumo mantém controles e avisos visíveis', () => {
  render(<BlocoAuto titulo="Lure" dica="O grupo aumenta o dano recebido."
    ligado aoLigar={() => {}}><button>Quantidade</button></BlocoAuto>)
  expect(screen.getByRole('button', { name: 'Quantidade' })).toBeTruthy()
  expect(screen.getByLabelText('O que isso faz')).toBeTruthy()
})

it('estoque baixo continua sinalizado com as regras recolhidas', () => {
  render(<BlocoAuto titulo="Auto-revive" dica="Revive automático." resumo="Revive ×0"
    alerta ligado aoLigar={() => {}}><span>Detalhes</span></BlocoAuto>)
  expect(screen.getByLabelText('Estoque baixo')).toBeTruthy()
})
