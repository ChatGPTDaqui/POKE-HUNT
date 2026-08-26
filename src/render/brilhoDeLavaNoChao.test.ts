// @vitest-environment jsdom
//
// PH-195 — brilho pulsante rente a base da tela nas artes de vulcao/lava
// (preset `brasa`), alem da brasa que ja subia (PH-96/PH-115). Mesma tecnica
// dos feixes de luz da floresta: gradiente na camada ambiente, sem particula
// nova, sem mascara pintada. So `brasa` ganha; nenhum outro preset.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'

const VULCAO = 'assets/hunt-backgrounds/volcano.jpg' // brasa — ganha o brilho
const CAVERNA = 'assets/hunt-backgrounds/ruins.jpg' // poeira — controle, sem brilho

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
const PASSO_MS = 100

interface Desenho { forma: 'arc' | 'ellipse'; y: number; raio: number }

function ctxEspiao() {
  const desenhos: Desenho[] = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    rotate: () => {},
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1,
    arc(_x: number, y: number, raio: number) { desenhos.push({ forma: 'arc', y, raio }) },
    ellipse(_x: number, y: number, raio: number) { desenhos.push({ forma: 'ellipse', y, raio }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, desenhos }
}

/** Roda `quadros` quadros e devolve o que foi desenhado em cada um. */
function rodar(imagem: string, quadros: number): Desenho[][] {
  const porQuadro: Desenho[][] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, desenhos } = ctxEspiao()
    desenharAmbiente(ctx, imagem, JANELA)
    porQuadro.push(desenhos)
  }
  return porQuadro
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarAmbiente()
})

describe('brilho de lava rente ao chao, so no vulcao (PH-195)', () => {
  it('vulcao desenha focos de brilho colados na base da janela', () => {
    // A brasa nunca usa `ctx.ellipse` (so gira quando `girar` esta ligado, e
    // brasa nao liga) — todo `ellipse` visto aqui so pode vir do brilho novo.
    const quadros = rodar(VULCAO, 10)
    const brilhos = quadros.flat().filter((d) => d.forma === 'ellipse')
    expect(brilhos.length, 'nenhum foco de brilho desenhado').toBeGreaterThan(0)
    for (const b of brilhos) {
      expect(b.y, 'foco de brilho longe da base da janela').toBeGreaterThan(JANELA.h * 0.95)
    }
  })

  it('o brilho pulsa — o raio do mesmo foco muda entre quadros distantes', () => {
    const quadros = rodar(VULCAO, 40)
    const primeiro = quadros[0].filter((d) => d.forma === 'ellipse')
    const ultimo = quadros[quadros.length - 1].filter((d) => d.forma === 'ellipse')
    expect(primeiro.length, 'numero de focos mudou entre quadros').toBe(ultimo.length)
    expect(primeiro.length).toBeGreaterThan(0)
    const mudou = primeiro.some((d, i) => Math.abs(d.raio - ultimo[i].raio) > 0.01)
    expect(mudou, 'raio do foco ficou parado — nao esta pulsando').toBe(true)
  })

  it('controle: poeira nao ganha foco de brilho nenhum', () => {
    const quadros = rodar(CAVERNA, 10)
    const brilhos = quadros.flat().filter((d) => d.forma === 'ellipse')
    expect(brilhos.length, 'brilho vazou pra um preset que nao pediu').toBe(0)
  })
})
