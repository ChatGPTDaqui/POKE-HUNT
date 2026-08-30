// @vitest-environment jsdom
//
// PH-188 — a folha nasce perto do topo da tela (banda de copa), nao
// espalhada pela janela inteira. Sem isso ela aparecia ja no chao desde o
// primeiro quadro, lendo como confete solto em vez de algo caindo da arvore.
// So a folha muda: neve, poeira etc continuam nascendo em qualquer altura.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'

const FLORESTA = 'assets/hunt-backgrounds/forest.jpg' // folha — faixaOrigemY
// PH-255: era `mountain.jpg`, que saiu de `neve` (a arte e um vale verde).
const MONTANHA = 'assets/hunt-backgrounds/ice-mountain.jpg' // neve — controle, sem faixa

const JANELA = { x: 0, y: 0, w: 900, h: 600 }

interface Ponto { y: number }

function ctxEspiao() {
  const desenhos: Ponto[] = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    rotate: () => {},
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1,
    arc(_x: number, y: number) { desenhos.push({ y }) },
    ellipse(_x: number, y: number) { desenhos.push({ y }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, desenhos }
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(0)
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarAmbiente()
})

describe('folha nasce perto do topo, nao espalhada ate o chao (PH-188)', () => {
  it('primeiro quadro: nenhuma folha nasce na metade de baixo da janela', () => {
    // Primeiro quadro = delta 0 = as posicoes SAO as de nascimento, sem
    // nenhum passo de queda ainda.
    const { ctx, desenhos } = ctxEspiao()
    desenharAmbiente(ctx, FLORESTA, JANELA)
    expect(desenhos.length, 'nada foi desenhado').toBeGreaterThan(0)
    const maximoY = Math.max(...desenhos.map((d) => d.y))
    expect(maximoY, 'folha nasceu na metade de baixo — nao le como caindo da copa')
      .toBeLessThan(JANELA.h * 0.55)
  })

  it('controle: neve continua nascendo em qualquer altura da janela', () => {
    const { ctx, desenhos } = ctxEspiao()
    desenharAmbiente(ctx, MONTANHA, JANELA)
    expect(desenhos.length, 'nada foi desenhado').toBeGreaterThan(0)
    const maximoY = Math.max(...desenhos.map((d) => d.y))
    expect(maximoY, 'a faixa de topo vazou pra um preset que nao pediu')
      .toBeGreaterThan(JANELA.h * 0.7)
  })
})
