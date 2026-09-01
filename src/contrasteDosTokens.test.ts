// PH-382: o texto pequeno da interface passa em AA, e a escada neutra continua
// sendo uma escada.
//
// O QUE ISTO TRANCA. `--color-n500` era `#717580` e dava 3,96 sobre `n900` e
// 4,29 sobre `background` — reprovado em AA para texto normal, e ele e
// justamente o token do MENOR texto do jogo (`SectionLabel` em `.75em`, o
// rotulo de `Taxa` em `.8em`, aba inativa do chat). O limiar frouxo de 3:1 vale
// para texto GRANDE, que nao e o caso de nenhum deles.
//
// POR QUE UM TESTE, e nao so o comentario no CSS: o valor antigo veio do
// handoff de design, entao a proxima pessoa que comparar o CSS com o Figma vai
// achar que #80848e e um erro de digitacao e "consertar" de volta. Contraste
// nao lanca excecao — sem isto, a regressao passa em silencio.
//
// O SEGUNDO CASO e o que impede o conserto obvio e errado: subir n500 ate
// passar tambem sobre `n800` exigiria ~#888c96, que encosta em n400 e apaga o
// degrau da escada. O teste tranca as duas pontas — piso de contraste E
// distancia minima para o vizinho de cima.
/// <reference types="node" />
//
// `node:fs` e nao `import.meta.glob('?raw')`, que e o padrao do resto dos
// testes que leem fonte (`hudNaoUsaTitleNativo`, `vfxTiras`). Motivo medido: o
// vitest roda com `css: false`, entao TODO import de `.css` volta como string
// VAZIA — inclusive com `?raw`. O teste passava lendo nada e so acusava
// "token nao encontrado".
//
// A referencia de tipo acima e necessaria porque `tsconfig.app.json` declara
// `"types": ["vite/client"]`, ou seja nao carrega os tipos de Node por padrao.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CSS = readFileSync(new URL('./index.css', import.meta.url), 'utf8')

/** Le um token da escada direto do `index.css` — a fonte, nao uma copia. */
function token(nome: string): string {
  const achado = CSS.match(new RegExp(`--color-${nome}:\\s*(#[0-9a-f]{6})`, 'i'))
  if (!achado) throw new Error(`token --color-${nome} nao encontrado no index.css`)
  return achado[1]
}

/** Luminancia relativa (WCAG 2.1). */
function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const canal = (v: number) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255)
}

function contraste(a: string, b: string): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

// `background` nao mora na escada `n*`: ele e o token do tema `.dark`.
const BACKGROUND = (CSS.match(/--background:\s*(#[0-9a-f]{6})/i) ?? [])[1] ?? '#0a0a0c'

describe('contraste dos tokens de texto (PH-382)', () => {
  it('a conta bate com um par conhecido — contrafactual do proprio medidor', () => {
    // Preto sobre branco e 21:1 por definicao. Sem esta ancora, um erro na
    // formula faria todos os casos abaixo passarem por engano.
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('n500 passa em AA sobre os dois fundos em que o texto pequeno pousa', () => {
    // n900 e o fundo de card (`GameCard`, o chip de `Taxa`); `background` e o
    // corpo de painel e janela.
    expect(contraste(token('n500'), token('n900'))).toBeGreaterThanOrEqual(4.5)
    expect(contraste(token('n500'), BACKGROUND)).toBeGreaterThanOrEqual(4.5)
  })

  it('n400 e n300, que carregam texto secundario, tambem passam', () => {
    for (const nome of ['n400', 'n300']) {
      expect(contraste(token(nome), token('n900')), nome).toBeGreaterThanOrEqual(4.5)
      expect(contraste(token(nome), BACKGROUND), nome).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('a escada continua sendo uma escada — n500 nao encosta em n400', () => {
    // O conserto errado seria subir n500 ate passar tambem sobre `n800`: dava
    // ~#888c96, colado no n400, e a escada perderia um degrau util.
    const passo = contraste(token('n400'), token('n900')) - contraste(token('n500'), token('n900'))
    expect(passo).toBeGreaterThan(1)
  })

  it('n600 continua ABAIXO do piso de texto, porque ele nao e cor de texto', () => {
    // Guarda de direcao: se alguem subir n600 pra "resolver contraste", ele
    // deixa de servir pra borda e separador, que e o papel dele.
    expect(contraste(token('n600'), token('n900'))).toBeLessThan(4.5)
  })
})
