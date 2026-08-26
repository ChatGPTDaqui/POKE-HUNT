// @vitest-environment jsdom
//
// PH-195 — brasa e brilho confinados na mascara REAL de lava (celula por
// celula), nao soltos pela janela inteira nem colados numa linha na base da
// tela. Mesmo padrao de mock de `ondulacaoSoNaAgua.test.ts` (PH-113): grade
// sintetica pequena e rarefeita, sem depender do dado gerado real — o dado
// real (volcano.jpg) e conferido a olho no harness, nao aqui.
import { describe, expect, it, beforeEach, vi } from 'vitest'

const CELULA = 20
const LINHAS = 20
const COLUNAS = 20
const VULCAO = 'assets/hunt-backgrounds/volcano.jpg' // brasa, COM mascara mockada
const SEM_MASCARA = 'assets/hunt-backgrounds/cave-volcanic.jpg' // brasa, SEM entrada — controle

/** Lava so nas colunas 9 e 10 — rio estreito, rarefeito de proposito (mesma
 *  tecnica de `ondulacaoSoNaAgua.test.ts`: mascara larga passaria mesmo com
 *  o confinamento quebrado, porque a particula nunca chegaria a sair dela). */
const COLUNAS_DE_LAVA = new Set([9, 10])
const LINHA_MASCARA = Array.from({ length: COLUNAS }, (_, c) => (COLUNAS_DE_LAVA.has(c) ? '1' : '0')).join('')

vi.mock('@/data/generated/lavaMask.generated', () => ({
  LAVA_POR_ARTE: {
    'assets/hunt-backgrounds/volcano.jpg': {
      celula: CELULA,
      grid: Array.from({ length: LINHAS }, () => LINHA_MASCARA),
    },
  },
}))

const { desenharAmbiente, reiniciarAmbiente } = await import('./ambiente')
const { useUiStore } = await import('@/stores/uiStore')

const JANELA = { x: 0, y: 0, w: COLUNAS * CELULA, h: LINHAS * CELULA }
const PASSO_MS = 100

interface Desenho { forma: 'arc' | 'ellipse'; x: number; y: number; raio: number }

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
    arc(x: number, y: number, raio: number) { desenhos.push({ forma: 'arc', x, y, raio }) },
    ellipse(x: number, y: number, raio: number) { desenhos.push({ forma: 'ellipse', x, y, raio }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, desenhos }
}

function rodar(imagem: string, quadros: number): Desenho[][] {
  const porQuadro: Desenho[][] = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, desenhos } = ctxEspiao()
    desenharAmbiente(ctx, imagem, JANELA)
    porQuadro.push(desenhos)
  }
  return porQuadro
}

function colunaEmLava(x: number): boolean {
  return COLUNAS_DE_LAVA.has(Math.floor(x / CELULA))
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  reiniciarAmbiente()
})

describe('com mascara: brasa e brilho ficam dentro do rio de lava (PH-195)', () => {
  it('focos de brilho nascem so em cima de celula de lava', () => {
    const brilhos = rodar(VULCAO, 5).flat().filter((d) => d.forma === 'ellipse')
    expect(brilhos.length, 'nenhum foco de brilho desenhado').toBeGreaterThan(0)
    for (const b of brilhos) {
      expect(colunaEmLava(b.x), `foco em x=${b.x} caiu fora da coluna de lava`).toBe(true)
    }
  })

  it('brasa (o ponto que sobe) so aparece dentro da coluna de lava', () => {
    const embers = rodar(VULCAO, 5).flat().filter((d) => d.forma === 'arc')
    expect(embers.length, 'nenhuma brasa desenhada').toBeGreaterThan(0)
    for (const e of embers) {
      expect(colunaEmLava(e.x), `brasa em x=${e.x} apareceu fora da coluna de lava`).toBe(true)
    }
  })

  it('o brilho continua pulsando (raio muda entre o primeiro e o ultimo quadro)', () => {
    const quadros = rodar(VULCAO, 30)
    const primeiro = quadros[0].filter((d) => d.forma === 'ellipse')
    const ultimo = quadros[quadros.length - 1].filter((d) => d.forma === 'ellipse')
    expect(primeiro.length, 'numero de focos mudou entre quadros').toBe(ultimo.length)
    expect(primeiro.length).toBeGreaterThan(0)
    const mudou = primeiro.some((d, i) => Math.abs(d.raio - ultimo[i].raio) > 0.01)
    expect(mudou, 'raio do foco ficou parado — nao esta pulsando').toBe(true)
  })
})

describe('sem mascara: comportamento de antes, sem regressao (PH-195)', () => {
  it('sem entrada em LAVA_POR_ARTE, nao ha foco de brilho nenhum', () => {
    const brilhos = rodar(SEM_MASCARA, 5).flat().filter((d) => d.forma === 'ellipse')
    expect(brilhos.length, 'brilho apareceu sem mascara — nao devia adivinhar posicao').toBe(0)
  })

  it('sem entrada em LAVA_POR_ARTE, a brasa continua livre pela janela inteira', () => {
    const embers = rodar(SEM_MASCARA, 5).flat().filter((d) => d.forma === 'arc')
    expect(embers.length, 'nenhuma brasa desenhada').toBeGreaterThan(0)
    // Sem mascara, `nascer` nao filtra por regiao — tem que existir brasa
    // FORA da faixa que seria a coluna de lava no mock, ou o confinamento
    // vazou pra uma arte que nao tem mascara nenhuma.
    const foraDaFaixa = embers.some((e) => !colunaEmLava(e.x))
    expect(foraDaFaixa, 'brasa ficou presa numa faixa mesmo sem mascara pra essa arte').toBe(true)
  })
})
