// PH-501 — a reescala do nivel dos jogos reais pros nossos 10 estagios.
//
// Ela e uma linha de aritmetica, e por isso mesmo merece teste: e a peca que
// decide EM QUE ESTAGIO cada encontro real cai, e um erro de ponta aqui move
// centenas de linhas de elenco sem quebrar nada visivel.
import { describe, expect, it } from 'vitest'
import {
  estagioDoNivelReal, estagiosDoEncontro,
  NIVEL_REAL_MINIMO, NIVEL_REAL_MAXIMO, ESTAGIOS,
} from './nivel-real-para-estagio.mjs'

describe('estagioDoNivelReal', () => {
  it('ancora as duas pontas: o menor nivel real no estagio 1, o maior no 10', () => {
    expect(estagioDoNivelReal(NIVEL_REAL_MINIMO)).toBe(1)
    expect(estagioDoNivelReal(NIVEL_REAL_MAXIMO)).toBe(ESTAGIOS)
  })

  it('e monotonica: nivel maior nunca cai num estagio menor', () => {
    let anterior = 0
    for (let lv = NIVEL_REAL_MINIMO; lv <= NIVEL_REAL_MAXIMO; lv++) {
      const e = estagioDoNivelReal(lv)
      expect(e, `Lv ${lv}`).toBeGreaterThanOrEqual(anterior)
      anterior = e
    }
  })

  it('cobre os 10 estagios, sem deixar nenhum vazio', () => {
    const vistos = new Set()
    for (let lv = NIVEL_REAL_MINIMO; lv <= NIVEL_REAL_MAXIMO; lv++) vistos.add(estagioDoNivelReal(lv))
    expect([...vistos].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('apara nas pontas em vez de estourar', () => {
    // Fonte nova (um remake, uma tabela de pos-jogo) nao pode derrubar o
    // gerador: ela cai no estagio da ponta, que e a resposta certa.
    expect(estagioDoNivelReal(1)).toBe(1)
    expect(estagioDoNivelReal(-50)).toBe(1)
    expect(estagioDoNivelReal(100)).toBe(ESTAGIOS)
    expect(estagioDoNivelReal(999)).toBe(ESTAGIOS)
  })

  // Os dois percentis do dado real, conferidos contra o que o cabecalho do
  // modulo AFIRMA. Sem isto a documentacao envelhece calada.
  it('poe o p50 do dado real (Lv 26) no estagio 4 e o p90 (Lv 40) no 6', () => {
    expect(estagioDoNivelReal(26)).toBe(4)
    expect(estagioDoNivelReal(40)).toBe(6)
  })
})

describe('estagiosDoEncontro', () => {
  it('um encontro de nivel fixo cobre um estagio so', () => {
    expect(estagiosDoEncontro(2, 2)).toEqual([1])
  })

  it('a pesca do Emerald (Lv 5-45) atravessa sete estagios', () => {
    // O caso que motivou a funcao: usar so o ponto medio faria o Magikarp de
    // vara super existir num estagio so, quando nos jogos ele vai de Lv 5 a 45.
    expect(estagiosDoEncontro(5, 45)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('nao devolve faixa vazia nem invertida quando min e max vem trocados', () => {
    // Lv 40 cai no estagio 6 e Lv 5 no 1, entao a faixa e 1..6 — a mesma que
    // `estagiosDoEncontro(5, 40)`. A ordem dos argumentos nao muda o resultado.
    expect(estagiosDoEncontro(40, 5)).toEqual([1, 2, 3, 4, 5, 6])
    expect(estagiosDoEncontro(40, 5)).toEqual(estagiosDoEncontro(5, 40))
  })

  it('toda faixa e contigua e crescente', () => {
    for (const [lo, hi] of [[2, 67], [10, 12], [30, 31], [45, 53]]) {
      const faixa = estagiosDoEncontro(lo, hi)
      expect(faixa.length).toBeGreaterThan(0)
      for (let i = 1; i < faixa.length; i++) expect(faixa[i]).toBe(faixa[i - 1] + 1)
    }
  })
})
