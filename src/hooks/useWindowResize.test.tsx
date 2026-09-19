// @vitest-environment jsdom
//
// PH-562 — redimensionar pelas bordas (nao so pelo canto). jsdom nao calcula
// layout de verdade, entao `getBoundingClientRect`/`getComputedStyle` sao
// forjados por cima do node real.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useUiStore } from '@/stores/uiStore'
import { useWindowResize } from './useWindowResize'

function Harness() {
  const { onPointerDownBorda } = useWindowResize('panel')
  return (
    <div data-window="panel" style={{ position: 'absolute' }}>
      <div data-testid="borda-right" onPointerDown={onPointerDownBorda('right')} />
      <div data-testid="borda-left" onPointerDown={onPointerDownBorda('left')} />
      <div data-testid="borda-bottom" onPointerDown={onPointerDownBorda('bottom')} />
      <div data-testid="borda-top" onPointerDown={onPointerDownBorda('top')} />
    </div>
  )
}

// Retangulo e limites fixos pra todo caso: janela de 200x100 em (50,30),
// largura entre 100 e 400px, altura entre 60 e 300px.
function forjarJanela(win: HTMLElement) {
  win.getBoundingClientRect = () => ({
    width: 200, height: 100, left: 50, top: 30, right: 250, bottom: 130, x: 50, y: 30, toJSON() { return {} },
  })
  const original = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el, ...rest) => {
    if (el !== win) return original(el, ...rest)
    return {
      getPropertyValue: (prop: string) => {
        if (prop === 'min-width') return '100px'
        if (prop === 'max-width') return '400px'
        if (prop === 'min-height') return '60px'
        if (prop === 'max-height') return '300px'
        return ''
      },
    } as CSSStyleDeclaration
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useUiStore.setState({ winPos: {} })
})

describe('useWindowResize (PH-562)', () => {
  it('borda direita so cresce a largura, sem mexer na posicao', () => {
    const { getByTestId } = render(<Harness />)
    const win = getByTestId('borda-right').closest('[data-window]') as HTMLElement
    forjarJanela(win)

    fireEvent.pointerDown(getByTestId('borda-right'), { button: 0, clientX: 250, clientY: 80 })
    fireEvent.pointerMove(window, { clientX: 300, clientY: 80 })

    expect(win.style.width).toBe('250px') // 200 + (300-250)
    expect(useUiStore.getState().winPos.panel).toBeUndefined()
  })

  it('borda esquerda cresce a largura E move x pro lado oposto do cursor', () => {
    const { getByTestId } = render(<Harness />)
    const win = getByTestId('borda-left').closest('[data-window]') as HTMLElement
    forjarJanela(win)

    // Cursor anda 30px pra ESQUERDA (dx negativo): a janela cresce 30px e o
    // canto esquerdo (x) recua 30px junto, o direito fica parado.
    fireEvent.pointerDown(getByTestId('borda-left'), { button: 0, clientX: 50, clientY: 80 })
    fireEvent.pointerMove(window, { clientX: 20, clientY: 80 })

    expect(win.style.width).toBe('230px')
    expect(useUiStore.getState().winPos.panel).toEqual({ x: 20, y: 30 })
  })

  it('borda esquerda para de mover x ao bater no minimo (nao "escorrega")', () => {
    const { getByTestId } = render(<Harness />)
    const win = getByTestId('borda-left').closest('[data-window]') as HTMLElement
    forjarJanela(win)

    // Empurra o cursor bem pra DIREITA — tentaria encolher a 200-150=50px,
    // abaixo do minimo de 100px. O clamp trava a largura em 100px, e o `x`
    // so pode avançar os 100px que a largura de fato perdeu, nao os 150.
    fireEvent.pointerDown(getByTestId('borda-left'), { button: 0, clientX: 50, clientY: 80 })
    fireEvent.pointerMove(window, { clientX: 200, clientY: 80 })

    expect(win.style.width).toBe('100px')
    expect(useUiStore.getState().winPos.panel).toEqual({ x: 150, y: 30 })
  })

  it('borda de baixo so cresce a altura', () => {
    const { getByTestId } = render(<Harness />)
    const win = getByTestId('borda-bottom').closest('[data-window]') as HTMLElement
    forjarJanela(win)

    fireEvent.pointerDown(getByTestId('borda-bottom'), { button: 0, clientX: 150, clientY: 130 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 160 })

    expect(win.style.height).toBe('130px')
  })

  it('solta o ponteiro e o movimento seguinte nao mexe mais na janela', () => {
    const { getByTestId } = render(<Harness />)
    const win = getByTestId('borda-right').closest('[data-window]') as HTMLElement
    forjarJanela(win)

    fireEvent.pointerDown(getByTestId('borda-right'), { button: 0, clientX: 250, clientY: 80 })
    fireEvent.pointerUp(window, { clientX: 260, clientY: 80 })
    fireEvent.pointerMove(window, { clientX: 400, clientY: 80 })

    expect(win.style.width).toBe('')
  })
})
