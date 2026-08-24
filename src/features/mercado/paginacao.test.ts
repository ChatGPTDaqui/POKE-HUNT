// PH-99: a contagem da vitrine tem que FECHAR.
//
// Os tres numeros ("1–25 de 40", "página 2 de 2") saem do mesmo total, e cada um
// tem o proprio jeito de errar na ultima pagina e no vazio. Errado, nada quebra
// — a tela so mostra uma faixa que nao fecha, e a conclusao do jogador e que a
// vitrine esta escondendo anuncio dele.
import { describe, expect, it } from 'vitest'

import { faixaDaPagina } from './paginacao'

describe('faixaDaPagina (PH-99)', () => {
  it('vitrine vazia nao mostra "1 de 0"', () => {
    // `ceil(0/25)` e 0, e "página 1 de 0" e o texto que sai se ninguem cuidar
    // disso. Uma pagina sempre existe, mesmo vazia.
    const f = faixaDaPagina(0, 0, 25)
    expect(f.paginas).toBe(1)
    expect(f.inicio).toBe(0)
    expect(f.fim).toBe(0)
  })

  it('uma pagina cheia', () => {
    expect(faixaDaPagina(25, 0, 25)).toEqual({ paginas: 1, inicio: 1, fim: 25 })
  })

  it('a ultima pagina para no TOTAL, nao no tamanho da pagina', () => {
    // Este e o caso do "26–50 de 40". O fim tem que ser 40.
    const f = faixaDaPagina(40, 1, 25)
    expect(f.paginas).toBe(2)
    expect(f.inicio).toBe(26)
    expect(f.fim).toBe(40)
  })

  it('total exatamente divisivel nao cria pagina fantasma', () => {
    // `ceil(50/25)` e 2, nao 3 — mas um `floor(...) + 1` distraido daria 3, e a
    // ultima ficaria vazia com o botao "Próxima" ativo.
    expect(faixaDaPagina(50, 1, 25).paginas).toBe(2)
    expect(faixaDaPagina(50, 1, 25).fim).toBe(50)
  })

  it('um anuncio so', () => {
    expect(faixaDaPagina(1, 0, 25)).toEqual({ paginas: 1, inicio: 1, fim: 1 })
  })

  it('pagina alem do fim nao produz numero negativo', () => {
    // Nao deveria acontecer (o efeito zera a pagina quando o filtro muda), mas
    // se acontecer o texto tem que ser inofensivo em vez de "51–40 de 40".
    const f = faixaDaPagina(40, 5, 25)
    expect(f.fim).toBe(40)
    expect(f.inicio).toBeGreaterThan(0)
  })

  it('porPagina invalido nao vira NaN na tela', () => {
    // Divisao por zero daria Infinity em `paginas` e a tela mostraria
    // "página 1 de Infinity".
    expect(faixaDaPagina(40, 0, 0).paginas).toBeGreaterThan(0)
    expect(Number.isFinite(faixaDaPagina(40, 0, 0).paginas)).toBe(true)
  })

  it('total negativo (resposta estranha do servidor) nao inventa faixa', () => {
    const f = faixaDaPagina(-3, 0, 25)
    expect(f.paginas).toBe(1)
    expect(f.inicio).toBe(0)
    expect(f.fim).toBe(0)
  })
})
