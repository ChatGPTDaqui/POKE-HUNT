// @vitest-environment jsdom
//
// PH-115 — cada preset de ambiente tem que ter FORMA e MOVIMENTO proprios, e
// nao apenas cor e tamanho diferentes.
//
// O QUE ESTE TESTE TRANCA
//
// O PH-96 desenhava toda particula de todo preset como o mesmo circulo cheio
// (\`risco\`, da areia, era a unica excecao). No codigo os presets pareciam bem
// diferentes — sete receitas, sete cores; na tela, folha de floresta, brasa de
// vulcao e poeira de caverna eram o mesmo ponto pintado de outra cor.
//
// Um teste de cor nao pega isso: ele passaria com tudo redondo. O que se afirma
// aqui e o que o jogador ve — folha e ELIPSE que gira, brasa PULSA de tamanho,
// e a neve tem profundidade (floco maior cai mais rapido).
//
// A camada nao renderiza de verdade: o \`ctx\` e um espiao que anota cada chamada
// de desenho com o alpha e o raio do momento.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'

const FLORESTA = 'assets/hunt-backgrounds/forest.jpg'
const VULCAO = 'assets/hunt-backgrounds/volcano.jpg'
const CAVERNA = 'assets/hunt-backgrounds/ruins.jpg'
const MONTANHA = 'assets/hunt-backgrounds/mountain.jpg'

const JANELA = { x: 0, y: 0, w: 900, h: 600 }

/**
 * Passo de tempo por quadro, em ms.
 *
 * O RELOGIO PRECISA SER FALSO. `desenharAmbiente` mede o quadro com
 * `performance.now()`, e num teste os quadros rodam em sequencia sincrona: o
 * delta real fica em ~0, a fase nao avanca e TODO comportamento que depende do
 * tempo (giro da folha, pulso da brasa, queda do floco) sai indistinguivel de
 * "nao implementado". A primeira versao deste arquivo reprovou por isso, nao
 * pelo codigo.
 */
const PASSO_MS = 100

interface Desenho {
  forma: 'arc' | 'ellipse'
  x: number
  y: number
  raio: number
  rotacao: number
  alpha: number
}

function ctxEspiao() {
  const desenhos: Desenho[] = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    rotate: () => {},
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1,
    arc(x: number, y: number, raio: number) {
      desenhos.push({ forma: 'arc', x, y, raio, rotacao: 0, alpha: ctx.globalAlpha })
    },
    ellipse(x: number, y: number, raio: number, _ry: number, rotacao: number) {
      desenhos.push({ forma: 'ellipse', x, y, raio, rotacao, alpha: ctx.globalAlpha })
    },
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

function media(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / ns.length
}

beforeEach(() => {
  let agora = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
  // `reiniciarAmbiente` e nao um desenho com `null`: os dois soltam as
  // particulas, mas so ele zera o INSTANTE do ultimo quadro. Sem isso o relogio
  // falso deste caso comeca atras do relogio do caso anterior, o primeiro delta
  // sai negativo e as particulas andam pra tras — o que aparece como floco
  // pulando centenas de unidades, nao como erro.
  reiniciarAmbiente()
})

describe('forma por preset (PH-115)', () => {
  it('folha e elipse que gira, e nao circulo', () => {
    const quadros = rodar(FLORESTA, 12)
    const todos = quadros.flat()
    expect(todos.length, 'nada foi desenhado').toBeGreaterThan(0)
    expect(todos.every((d) => d.forma === 'ellipse'), 'alguma folha saiu como circulo').toBe(true)

    // GIRA: a rotacao do mesmo indice muda entre quadros. Sem isto, uma elipse
    // de rotacao fixa passaria — e uma folha que nao tomba nao le como folha.
    const primeiro = quadros[0]
    const ultimo = quadros[quadros.length - 1]
    const mudou = primeiro.filter((d, i) => ultimo[i] && ultimo[i].rotacao !== d.rotacao)
    expect(mudou.length, 'nenhuma folha girou entre o primeiro e o ultimo quadro').toBeGreaterThan(0)

    // Pra os dois lados: folha caindo toda no mesmo sentido le como engrenagem.
    const sentidos = new Set(primeiro.map((d) => Math.sign(d.rotacao)).filter((s) => s !== 0))
    expect(sentidos.size, 'todas as folhas giram pro mesmo lado').toBe(2)
  })

  it('brasa pulsa de tamanho; poeira nao', () => {
    // A comparacao com a poeira e o que faz o caso valer: sem ela, "o raio
    // varia" tambem passaria por causa do sorteio de raio no nascimento.
    const variacao = (imagem: string) => {
      const quadros = rodar(imagem, 30)
      const porIndice = new Map<number, number[]>()
      for (const quadro of quadros) {
        quadro.forEach((d, i) => {
          const lista = porIndice.get(i) ?? []
          lista.push(d.raio)
          porIndice.set(i, lista)
        })
      }
      // Amplitude relativa media: quanto o raio de UMA particula varia ao longo
      // do tempo, em fracao do proprio raio.
      return media([...porIndice.values()].map((raios) => {
        const min = Math.min(...raios)
        const max = Math.max(...raios)
        return max > 0 ? (max - min) / max : 0
      }))
    }
    expect(variacao(VULCAO)).toBeGreaterThan(0.15)
    expect(variacao(CAVERNA)).toBeLessThan(0.01)
  })

  it('neve tem profundidade: floco maior cai mais rapido e mais opaco', () => {
    const quadros = rodar(MONTANHA, 4)
    // Do SEGUNDO quadro em diante: o primeiro tem delta 0 por construcao (nao
    // existe quadro anterior pra medir contra), entao ninguem se move nele.
    const a = quadros[1]
    const c = quadros[3]
    // O indice e a mesma particula entre quadros — a ordem do array nao muda.
    // Quem RECICLOU no meio (saiu da janela e renasceu do outro lado) aparece
    // como salto de centenas de unidades e nao mede velocidade nenhuma: o teto
    // e a velocidade maxima da receita (46 u/s) em dois quadros de 100ms, com
    // folga.
    const TETO_DE_QUEDA = 46 * (PASSO_MS / 1000) * 2 * 3
    const amostras = a
      .map((d, i) => (c[i] ? { raio: d.raio, queda: Math.abs(c[i].y - d.y), alpha: d.alpha } : null))
      .filter((v): v is { raio: number; queda: number; alpha: number } => v != null && v.queda <= TETO_DE_QUEDA)
    expect(amostras.length).toBeGreaterThan(8)

    const porRaio = [...amostras].sort((x, y) => x.raio - y.raio)
    const corte = Math.floor(porRaio.length / 3)
    const pequenos = porRaio.slice(0, corte)
    const grandes = porRaio.slice(-corte)

    expect(media(grandes.map((v) => v.queda)), 'floco grande nao cai mais rapido')
      .toBeGreaterThan(media(pequenos.map((v) => v.queda)))
    expect(media(grandes.map((v) => v.alpha)), 'floco grande nao esta mais opaco')
      .toBeGreaterThan(media(pequenos.map((v) => v.alpha)))
  })
})
