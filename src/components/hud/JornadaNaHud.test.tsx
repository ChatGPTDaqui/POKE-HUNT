// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { JornadaNaHud } from './JornadaNaHud'

vi.mock('@/features/primeirosPassos/CartaoDoPasso', () => ({ CartaoDoPasso: () => <button>Consultar objetivo</button> }))
vi.mock('@/features/primeirosPassos/FaixaDePremios', () => ({ FaixaDePremios: () => <button>Coletar tudo</button> }))
afterEach(cleanup)

it('começa recolhido, mantendo objetivos e prêmios disponíveis sob demanda', () => {
  const { container } = render(<JornadaNaHud />)
  const detalhes = container.querySelector('details')!
  expect(detalhes.open).toBe(false)
  expect(screen.getByText('Objetivos')).toBeTruthy()
  expect(detalhes.querySelectorAll('button')).toHaveLength(2)
  fireEvent.click(screen.getByText('Objetivos'))
  expect(detalhes.open).toBe(true)
})

it('fecha com Escape ou toque fora sem acionar coleta', () => {
  const { container } = render(<JornadaNaHud />)
  const detalhes = container.querySelector('details')!
  fireEvent.click(screen.getByText('Objetivos'))
  fireEvent.keyDown(detalhes, { key: 'Escape' })
  expect(detalhes.open).toBe(false)
  fireEvent.click(screen.getByText('Objetivos'))
  fireEvent.pointerDown(document.body)
  expect(detalhes.open).toBe(false)
})
