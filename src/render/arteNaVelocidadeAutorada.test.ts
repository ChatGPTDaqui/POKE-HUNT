// PH-374: a arte de golpe toca na velocidade AUTORADA (10 fps), e nao mais
// esticada pra caber na duracao do efeito.
//
// O DEFEITO QUE ISTO TRANCA. `faseDaTira` calculava `fase = idade / duracao`,
// entao o NUMERO DE QUADROS decidia a velocidade: a tira de 39 quadros tocava a
// 39 fps e a de 5 quadros a 4,2 fps, 9,3x de espalhamento. Nada quebrava — o
// jogo desenhava, bonito, no ritmo errado, e a queixa que abriu a leva foi
// exatamente essa ("parece que o POKE acelera a animacao pra caber no tempo").
//
// O invariante agora e temporal e nao proporcional: o quadro `k` aparece no
// instante `k / 10 s`, e isso NAO PODE depender de `duration`. O segundo caso
// e o que importa — foi a dependencia da duracao que criou o bug.
//
// Observado pelo `sx` do `drawImage`: `drawQuadroDeTira` recorta o quadro em
// `indice * sw`, entao `sx / sw` E o indice do quadro desenhado. Sem espiar o
// canvas nao da pra testar isto de fora — `faseDaTira` nao e exportada, e
// exporta-la so pro teste esconderia justamente a parte que erra (o recorte).
import { describe, it, expect, beforeEach, vi } from 'vitest'

import { TIRA_POR_ELEMENTO, FPS_DA_ARTE_DE_EFEITO } from '@/data/vfxTiras'

// A tira de referencia. NORMAL e radial (nao gira), entao o desenho cai no
// caminho rapido de `drawImage` com 9 argumentos e o `sx` fica trivial de ler.
const TIPO = 'NORMAL'
const QUADROS = TIRA_POR_ELEMENTO[TIPO].quadros

// TODA imagem falsa tem a MESMA largura, porque `Image` e global e o desenho
// nao diz qual tira esta pedindo. Entao a largura do QUADRO varia por tira
// (`sw = LARGURA_DA_TIRA / quadros`) e a conversao de `sx` pra indice precisa
// do numero de quadros daquela tira — foi por assumir `sw` fixo que a primeira
// versao deste teste acusou um erro que nao existia.
const LARGURA_DA_TIRA = 1200

class ImagemPronta {
  complete = true
  naturalWidth = LARGURA_DA_TIRA
  naturalHeight = 10
  #src = ''
  set src(v: string) { this.#src = v }
  get src() { return this.#src }
  addEventListener() {}
  removeEventListener() {}
}

vi.stubGlobal('Image', ImagemPronta)

let quadrosDesenhados: number[] = []

function ctxEspiao() {
  return new Proxy({}, {
    get: (_a, prop) => {
      if (prop === 'canvas') return { width: 300, height: 300 }
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') {
        return () => ({ addColorStop() {} })
      }
      if (prop === 'drawImage') {
        // Guarda o `sx` CRU; virar indice depende de quantos quadros a tira
        // tem, e so quem chama sabe.
        return (_img: unknown, sx: number) => {
          if (typeof sx === 'number') quadrosDesenhados.push(sx)
        }
      }
      return () => {}
    },
  }) as unknown as CanvasRenderingContext2D
}

function efeito(idade: number, duracao: number) {
  return {
    id: 'e1', type: 'abilityEffect' as const, x: 100, y: 100, targetX: 140, targetY: 100,
    radius: 14, color: '#ffffff', duration: duracao, delay: 0, age: idade,
    elementType: TIPO as never, abilityId: 'tackle', anguloDeAtaque: 0,
    laneSize: 1, ownerId: null, lane: 0,
  }
}

const mundoVazio = { player: null, enemies: [] } as never

// Aquecimento fora de qualquer `it` (PH-129): a primeira importacao de
// `sprites.ts` custa ~550ms e cairia dentro do primeiro caso.
await import('./sprites')
const { drawEffect } = await import('./sprites')

/** `sx` cru -> indice do quadro, usando a largura de quadro daquela tira. */
function indiceDoQuadro(sx: number, quadros: number): number {
  return Math.round(sx / (LARGURA_DA_TIRA / quadros))
}

/** Qual quadro o jogo desenha nesta idade, com esta duracao de efeito. */
function quadroEm(idade: number, duracao = 3.0, tipo = TIPO, quadros = QUADROS): number {
  quadrosDesenhados = []
  drawEffect(ctxEspiao(), { ...efeito(idade, duracao), elementType: tipo as never }, mundoVazio)
  expect(quadrosDesenhados.length, `nada desenhado em ${idade}s`).toBeGreaterThan(0)
  return indiceDoQuadro(quadrosDesenhados[0], quadros)
}

describe('arte de golpe na velocidade autorada', () => {
  beforeEach(() => { quadrosDesenhados = [] })

  it('a velocidade autorada e 10 fps, e a tira de referencia tem quadros pra medir', () => {
    // Guarda de sanidade: se o valor mudar, os numeros abaixo param de fazer
    // sentido e o teste tem que ser relido, nao remendado.
    expect(FPS_DA_ARTE_DE_EFEITO).toBe(10)
    expect(QUADROS).toBeGreaterThanOrEqual(20)
  })

  it.each([
    [0.0, 0],
    [0.5, 5],
    [1.0, 10],
    [2.0, 20],
  ])('em %ss desenha o quadro %i — um quadro a cada 100ms', (idade, esperado) => {
    expect(quadroEm(idade)).toBe(esperado)
  })

  it('o quadro NAO depende da duracao do efeito', () => {
    // O coracao da issue. Com o modelo antigo (`fase = idade / duracao`) o
    // mesmo instante caia em quadros diferentes conforme a duracao, que e como
    // a velocidade virava refem do numero de quadros.
    for (const idade of [0.3, 0.7, 1.4]) {
      const comUmSegundo = quadroEm(idade, 1.0)
      const comTresSegundos = quadroEm(idade, 3.0)
      expect(comUmSegundo, `idade ${idade}s`).toBe(comTresSegundos)
    }
  })

  it('duas tiras de tamanhos diferentes andam no MESMO ritmo', () => {
    // O espalhamento de 9,3x era isto: a tira de 30 quadros e a de 14 tocavam
    // em velocidades diferentes so por terem contagens diferentes.
    const curta = TIRA_POR_ELEMENTO.FAIRY
    expect(curta.quadros).toBeLessThan(QUADROS)
    // Meio segundo = 5 quadros, seja qual for o tamanho da tira.
    expect(quadroEm(0.5, 3.0, 'FAIRY', curta.quadros)).toBe(5)
    expect(quadroEm(0.5)).toBe(5)
  })

  it('passado o fim da arte, trava no ultimo quadro em vez de voltar pro comeco', () => {
    // `drawQuadroDeTira` faz clamp no indice. Sem ele, `fase > 1` daria a volta
    // e a animacao recomecaria — que e o modo `repetir`, e ele tem que ser
    // ESCOLHIDO por arte (PH-375), nunca o acidente do calculo.
    const fimDaArte = QUADROS / FPS_DA_ARTE_DE_EFEITO
    expect(quadroEm(fimDaArte + 0.5)).toBe(QUADROS - 1)
    expect(quadroEm(fimDaArte + 2.0)).toBe(QUADROS - 1)
  })
})
