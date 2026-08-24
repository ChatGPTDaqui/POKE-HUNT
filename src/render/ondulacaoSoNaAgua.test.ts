// @vitest-environment jsdom
//
// PH-113 — a ondulacao de agua so pode ser DESENHADA dentro da agua.
//
// O QUE ESTE TESTE TRANCA
//
// O PH-96 deixou o preset de agua discreto de propósito, porque ele "nao sabe
// onde a agua esta, entao passa por cima de terra tambem". A mascara pintada
// levanta essa restricao — e o reforco de receita que vem junto (1.8x particula,
// 1.5x alpha, raio maior) transforma um brilho quase invisivel em algo que o
// jogador ve. Se o recorte falhar, o que aparece e AREIA ONDULANDO, mais
// visivel que o problema original.
//
// POR QUE A MASCARA DE TESTE E ESPARSA
//
// A primeira versao deste teste usava metade do mundo como agua e PASSAVA mesmo
// com o recorte do laco de desenho removido — a particula nasce dentro da agua e
// se move devagar (4-11 unidades/s), entao em 60 quadros ela nunca chega a sair.
// O teste nao provava nada.
//
// Com agua rara (2 colunas de 20), o `nascer` esgota as 12 tentativas com
// frequencia e cai no ramo de DESISTIR, que poe a particula em qualquer lugar —
// inclusive em terra. E o laco de desenho que precisa recicla-la antes de
// desenhar. Essa e a unica configuracao em que o recorte do desenho e
// observavel, e e por isso que ela e assim.
import { describe, expect, it, beforeEach, vi } from 'vitest'

const CELULA = 20
const LINHAS = 20
const COLUNAS = 20
const ARTE = 'assets/hunt-backgrounds/sea.jpg'
const SEM_MASCARA = 'assets/hunt-backgrounds/lake.jpg'

/** Agua so nas colunas 9 e 10 — rara de proposito, ver o cabecalho. */
const COLUNAS_DE_AGUA = new Set([9, 10])
const LINHA_MASCARA = Array.from({ length: COLUNAS }, (_, c) => (COLUNAS_DE_AGUA.has(c) ? '1' : '0')).join('')

vi.mock('@/data/generated/aguaMask.generated', () => ({
  AGUA_POR_ARTE: {
    'assets/hunt-backgrounds/sea.jpg': {
      celula: 20,
      grid: Array.from({ length: 20 }, () => '00000000011000000000'),
    },
  },
}))

const { desenharAmbiente } = await import('./ambiente')
const { useUiStore } = await import('@/stores/uiStore')

const JANELA = { x: 0, y: 0, w: COLUNAS * CELULA, h: LINHAS * CELULA }

/**
 * `ctx` de mentira que anota onde a camada desenhou.
 *
 * Anota as DUAS formas: `arc` (ponto) e `ellipse` (o anel de ondulacao, PH-113
 * segunda parte). Anotar so `arc` faria o recorte deixar de ser verificado
 * exatamente na forma nova — que e a que abre e portanto a que mais tem chance
 * de vazar pra terra.
 */
function ctxEspiao() {
  const pontos: Array<{ x: number; y: number; anel: boolean }> = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillRect: () => {},
    arc: (x: number, y: number) => { pontos.push({ x, y, anel: false }) },
    ellipse: (x: number, y: number) => { pontos.push({ x, y, anel: true }) },
    createLinearGradient: () => ({ addColorStop: () => {} }),
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, pontos }
}

function eAguaNaMascara(x: number): boolean {
  return COLUNAS_DE_AGUA.has(Math.floor(x / CELULA))
}

function rodar(imagem: string, quadros: number) {
  const todos: Array<{ x: number; y: number; anel: boolean }> = []
  for (let i = 0; i < quadros; i++) {
    const { ctx, pontos } = ctxEspiao()
    desenharAmbiente(ctx, imagem, JANELA)
    todos.push(...pontos)
  }
  return todos
}

describe('ondulacao de agua respeita a mascara (PH-113)', () => {
  beforeEach(() => {
    useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
    // Troca de arte forca repovoar; sem isto o estado de modulo vaza entre casos.
    desenharAmbiente(ctxEspiao().ctx, null, JANELA)
  })

  it('a mascara de teste e mesmo esparsa (guarda contra o teste que nao prova nada)', () => {
    // Se alguem "melhorar" a mascara enchendo de agua, o caso abaixo volta a
    // passar por construcao em vez de por comportamento. Este caso trava isso.
    expect(LINHA_MASCARA).toBe('00000000011000000000')
    expect(COLUNAS_DE_AGUA.size / COLUNAS).toBeLessThan(0.15)
  })

  it('desenha alguma coisa (guarda contra o teste vazio)', () => {
    expect(rodar(ARTE, 40).length).toBeGreaterThan(0)
  })

  it('nenhuma particula e desenhada fora da agua', () => {
    const fora = rodar(ARTE, 120).filter((p) => !eAguaNaMascara(p.x))
    expect(fora.length, `${fora.length} particula(s) desenhada(s) em terra`).toBe(0)
  })

  it('com mascara, parte do que e desenhado e anel de ondulacao', () => {
    // Sem este caso, trocar o desenho de volta pra so pontinho passaria calado:
    // os outros casos falam de POSICAO, nenhum deles de forma.
    const pontos = rodar(ARTE, 60)
    expect(pontos.some((p) => p.anel), 'nenhum anel desenhado na agua').toBe(true)
  })

  it('anel nenhum e desenhado fora da agua', () => {
    // Redundante com o caso geral de propósito: o anel CRESCE depois de nascer,
    // e e a unica particula da camada capaz de cobrir area maior que ela mesma.
    // Se alguem tirar o teto de raio ou a folga de nascimento, o proximo dev
    // quer ver o nome deste caso, nao um caso generico.
    const fora = rodar(ARTE, 120).filter((p) => p.anel && !eAguaNaMascara(p.x))
    expect(fora.length, `${fora.length} anel(is) desenhado(s) em terra`).toBe(0)
  })

  it('arte SEM mascara nao ganha anel nenhum', () => {
    // O reforco e CONDICIONAL a mascara. Anel em arte sem referencia pintada
    // seria ondulacao em cima de terra — o problema que o PH-96 registrou e que
    // esta issue existe pra nao repetir.
    const pontos = rodar(SEM_MASCARA, 60)
    expect(pontos.length).toBeGreaterThan(0)
    expect(pontos.some((p) => p.anel), 'anel apareceu em arte sem mascara').toBe(false)
  })

  it('arte SEM mascara continua desenhando pela janela inteira', () => {
    // `lake` nao esta no mock, entao cai no caminho de hoje. Se este caso parar
    // de ver ponto fora das duas colunas de agua, o recorte vazou pra quem nao
    // pediu — e arte sem referencia pintada teria PIORADO por causa desta
    // mudanca, que e exatamente o que ela promete nao fazer.
    const pontos = rodar(SEM_MASCARA, 40)
    expect(pontos.length).toBeGreaterThan(0)
    expect(pontos.some((p) => !eAguaNaMascara(p.x))).toBe(true)
  })
})
