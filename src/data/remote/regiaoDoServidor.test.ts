// A Edge Function precisa rodar na regiao do BANCO, nao na do jogador.
//
// Medido em producao em 12/10/2026: a funcao rodava em sa-east-1 (perto de quem
// joga do Brasil) e o banco fica em us-east-1. Cada uma das ~13 idas do flush ao
// PostgREST atravessava o continente, e o flush levava 3 s de mediana.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const { urlDoServidor } = await import('./servidor')

const FUNCAO = 'https://uogmhqbyjgafjujbqdty.supabase.co/functions/v1/jogo'

describe('urlDoServidor', () => {
  it('fixa a funcao do Supabase na regiao do banco', () => {
    expect(urlDoServidor('/sessao/flush', FUNCAO, 'us-east-1'))
      .toBe(`${FUNCAO}/sessao/flush?forceFunctionRegion=us-east-1`)
  })

  it('rota que ja tem query string ganha o parametro com &', () => {
    expect(urlDoServidor('/estado?parcial=1', FUNCAO, 'us-east-1'))
      .toBe(`${FUNCAO}/estado?parcial=1&forceFunctionRegion=us-east-1`)
  })

  it('o servidor local de desenvolvimento nao recebe o parametro', () => {
    expect(urlDoServidor('/sessao/flush', 'http://localhost:8787', 'us-east-1'))
      .toBe('http://localhost:8787/sessao/flush')
  })

  it('sem regiao configurada a URL sai como antes', () => {
    expect(urlDoServidor('/sessao/flush', FUNCAO, '')).toBe(`${FUNCAO}/sessao/flush`)
  })
})
