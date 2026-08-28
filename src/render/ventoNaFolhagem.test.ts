// @vitest-environment jsdom
//
// PH-188 — vento em rajada no preset folha: bamboleio e velocidade de queda
// sobem durante a rajada e voltam ao normal depois, sem tocar nenhum outro
// preset. Mesmo padrao de prova do formaPorPreset.test.ts (PH-115): o `ctx` e
// um espiao que so anota posicao, e o relogio e mockado — sem isso o delta
// real fica em ~0 e nenhum comportamento dependente de tempo aparece.
import { describe, expect, it, beforeEach, vi } from 'vitest'

import { useUiStore } from '@/stores/uiStore'
import { desenharAmbiente, reiniciarAmbiente } from './ambiente'
import { intensidadeDoVento } from './vento'

const FLORESTA = 'assets/hunt-backgrounds/forest.jpg' // folha — tem vento
const CAVERNA = 'assets/hunt-backgrounds/ruins.jpg' // poeira — controle, sem vento

const JANELA = { x: 0, y: 0, w: 900, h: 600 }
const PASSO_MS = 100

interface Ponto { x: number; y: number }

function ctxEspiao() {
  const desenhos: Ponto[] = []
  const ctx = {
    save: () => {}, restore: () => {}, beginPath: () => {}, fill: () => {},
    stroke: () => {}, moveTo: () => {}, lineTo: () => {}, fillRect: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    rotate: () => {},
    globalCompositeOperation: '', fillStyle: '', strokeStyle: '',
    globalAlpha: 1, lineWidth: 1,
    arc(x: number, y: number) { desenhos.push({ x, y }) },
    ellipse(x: number, y: number) { desenhos.push({ x, y }) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, desenhos }
}

function media(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0) / ns.length
}

beforeEach(() => {
  useUiStore.setState({ vidaNoCenario: true, viewportWidth: 1200 })
})

describe('intensidadeDoVento: rajada bursty, nao respiracao regular (PH-188)', () => {
  it('fica em [0, 1], sobe o bastante pra ler como rajada, mas fica baixa na media', () => {
    const amostras: number[] = []
    for (let t = 0; t < 600; t += 0.25) amostras.push(intensidadeDoVento(t))
    expect(Math.min(...amostras)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...amostras)).toBeLessThanOrEqual(1)
    expect(Math.max(...amostras), 'rajada nunca sobe o bastante pra se notar').toBeGreaterThan(0.4)
    expect(media(amostras), 'fica alta demais — le como vento constante, nao rajada').toBeLessThan(0.3)
  })

  it('nao e constante — varia com o tempo', () => {
    expect(intensidadeDoVento(0)).not.toBeCloseTo(intensidadeDoVento(37), 2)
  })
})

describe('a rajada acelera a queda da folha, e so da folha (PH-188)', () => {
  /** Quantos quadros a media de queda olha pra tras em cada checkpoint. */
  const JANELA_AMOSTRA = 15
  // A busca de extremos tem que comecar depois desse piso: o primeiro
  // checkpoint precisa desse tanto de quadros pra encher a janela de amostra.
  const INICIO_VALIDO = (JANELA_AMOSTRA + 2) * (PASSO_MS / 1000)

  /** Instante de rajada minima e maxima num intervalo, pra comparar os dois. */
  function acharExtremos(janelaSegundos: number): { baixo: number; alto: number; amplitude: number } {
    let baixo = INICIO_VALIDO, alto = INICIO_VALIDO, minV = Infinity, maxV = -Infinity
    for (let t = INICIO_VALIDO; t < janelaSegundos; t += 0.5) {
      const v = intensidadeDoVento(t)
      if (v < minV) { minV = v; baixo = t }
      if (v > maxV) { maxV = v; alto = t }
    }
    return { baixo, alto, amplitude: maxV - minV }
  }

  /**
   * Simula UMA sessao continua e devolve, pra cada checkpoint (em segundos,
   * crescente), os ultimos `JANELA_AMOSTRA` quadros ate aquele instante.
   *
   * Precisa ser uma sessao so, e nao uma chamada de `desenharAmbiente` por
   * checkpoint. Desde o PH-233 o relogio da rajada vive em `vento.ts` e e
   * ABSOLUTO (fase = instante / 1000), entao ele acompanha o relogio falso
   * deste teste — que o `vi.spyOn` abaixo reinicia em zero a cada chamada.
   * Rodar tudo numa sessao continua e o que garante que os checkpoints caem
   * nos instantes de rajada que `acharExtremos` escolheu, e que a folha e a
   * poeira sao medidas exatamente nos MESMOS instantes de vento.
   */
  function coletarJanelas(imagem: string, checkpointsSegundos: number[]): Ponto[][][] {
    const ordem = [...checkpointsSegundos].sort((a, b) => a - b)
    let agora = 0
    vi.spyOn(performance, 'now').mockImplementation(() => (agora += PASSO_MS))
    reiniciarAmbiente()
    const historico: Ponto[][] = []
    const janelas: Ponto[][][] = []
    let decorrido = 0
    let proximo = 0
    while (proximo < ordem.length) {
      const { ctx, desenhos } = ctxEspiao()
      desenharAmbiente(ctx, imagem, JANELA)
      historico.push(desenhos)
      if (historico.length > JANELA_AMOSTRA) historico.shift()
      decorrido += PASSO_MS / 1000
      if (decorrido >= ordem[proximo]) {
        janelas.push([...historico])
        proximo++
      }
    }
    // Devolve na ordem PEDIDA (`checkpointsSegundos`), nao na ordem crescente
    // usada pra simular.
    return checkpointsSegundos.map((t) => janelas[ordem.indexOf(t)])
  }

  /**
   * Queda media por passo dentro de uma janela de quadros.
   *
   * Uma janela de varios quadros, e nao so o ultimo par: particulas de um
   * preset tendem a cruzar a tela em tempos parecidos (mesma faixa de
   * velocidade), entao reciclam em grupo — um par so pegou quase todas
   * reciclando ao mesmo tempo e caiu pra 4 amostras de 34. Somar varios pares
   * consecutivos, filtrando so o passo que reciclou (nao o quadro inteiro),
   * resolve.
   */
  function quedaMedia(janela: Ponto[][], velocidadeMaxima: number): number {
    // Teto com folga: quem reciclou entre dois quadros salta a tela inteira
    // nesse passo e nao mede queda nenhuma — so infla a media com ruido.
    const teto = velocidadeMaxima * (PASSO_MS / 1000) * 3
    const quedas: number[] = []
    for (let i = 1; i < janela.length; i++) {
      const anterior = janela[i - 1]
      for (let p = 0; p < janela[i].length; p++) {
        if (!anterior[p]) continue
        const dy = Math.abs(janela[i][p].y - anterior[p].y)
        if (dy <= teto) quedas.push(dy)
      }
    }
    expect(quedas.length, 'amostra pequena demais pra comparar media').toBeGreaterThan(8)
    return media(quedas)
  }

  it('folha cai mais rapido no pico da rajada do que na calmaria', () => {
    const { baixo, alto, amplitude } = acharExtremos(600)
    expect(amplitude, 'nao ha rajada distinguivel nesse intervalo pra testar').toBeGreaterThan(0.3)

    const [janelaBaixaFolha, janelaAltaFolha] = coletarJanelas(FLORESTA, [baixo, alto])
    const difFolha = quedaMedia(janelaAltaFolha, 34) - quedaMedia(janelaBaixaFolha, 34)
    expect(difFolha, 'queda na rajada nao ficou maior que na calmaria').toBeGreaterThan(0)

    // Controle: poeira nao tem `r.vento` — os mesmos dois instantes nao podem
    // produzir a mesma diferenca sistematica, ou a rajada nao esta restrita
    // a folha.
    const [janelaBaixaPoeira, janelaAltaPoeira] = coletarJanelas(CAVERNA, [baixo, alto])
    const difPoeira = Math.abs(quedaMedia(janelaAltaPoeira, 9) - quedaMedia(janelaBaixaPoeira, 9))
    expect(difPoeira, 'poeira tambem acelerou nos mesmos instantes — vento vazou pra outro preset')
      .toBeLessThan(difFolha * 0.5)
  })
})
