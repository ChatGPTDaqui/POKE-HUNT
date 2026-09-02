// PH-435 — qual mensagem desenha o card do anúncio, e qual não.
//
// A regra existe porque o servidor estampa `contexto_anuncio` em TODA mensagem
// que sai com anúncio na mão. Sem esta filtragem, quem clica duas vezes em
// "negociar" (ou volta ao mesmo anúncio depois de duas falas) veria duas
// molduras idênticas empilhadas — o critério 4 da issue.
//
// O caso que decide a forma da regra é o do meio: A, nada, A. Comparar com a
// mensagem IMEDIATAMENTE anterior faria a fala solta "resetar" o assunto e o
// card do mesmo anúncio nasceria de novo do outro lado dela. Por isso a
// comparação é contra o último anúncio VISTO no fio.
import { describe, expect, it } from 'vitest'
import type { ContextoAnuncioSocial, MensagemSocial } from '@/data/remote/servidor'
import { idsComCardDeAnuncio } from './cardsDoAnuncio'

function ctx(anuncioId: string): ContextoAnuncioSocial {
  return {
    anuncioId, sellerId: 'vendedor', speciesId: 'charmander', level: 40,
    isShiny: false, rarity: 'raro', ivPercent: 88, price: 2_500_000,
    currency: 'gold', modo: 'preco_fixo', apenasOferta: false,
  }
}

function msg(id: string, anuncioId?: string): MensagemSocial {
  return {
    id, de_id: 'eu', de_nome: 'Eu', para_id: 'contato', tipo: 'texto',
    assunto: null, corpo: `msg ${id}`, estado: 'pendente',
    created_at: '2026-09-02T10:00:00Z',
    contexto_anuncio: anuncioId ? ctx(anuncioId) : null,
  }
}

describe('idsComCardDeAnuncio', () => {
  it('nao marca nada num fio sem anuncio nenhum', () => {
    expect(idsComCardDeAnuncio([msg('a'), msg('b')]).size).toBe(0)
  })

  it('marca a primeira mensagem que carrega o anuncio', () => {
    const ids = idsComCardDeAnuncio([msg('a'), msg('b', 'anuncio-1'), msg('c')])
    expect([...ids]).toEqual(['b'])
  })

  it('nao empilha card quando o MESMO anuncio e estampado de novo em seguida', () => {
    // Dois cliques em "negociar" antes de a primeira mensagem sair.
    const ids = idsComCardDeAnuncio([msg('a', 'anuncio-1'), msg('b', 'anuncio-1')])
    expect([...ids]).toEqual(['a'])
  })

  it('nao reabre o card do mesmo anuncio quando ha fala solta no meio', () => {
    // O caso A, nada, A — o que separa "ultimo anuncio visto" de "mensagem
    // anterior". Comparando com a anterior, `c` entraria na lista.
    const ids = idsComCardDeAnuncio([msg('a', 'anuncio-1'), msg('b'), msg('c', 'anuncio-1')])
    expect([...ids]).toEqual(['a'])
  })

  it('marca de novo quando a negociacao MUDA de anuncio', () => {
    const ids = idsComCardDeAnuncio([
      msg('a', 'anuncio-1'), msg('b'), msg('c', 'anuncio-2'), msg('d', 'anuncio-2'),
    ])
    expect([...ids]).toEqual(['a', 'c'])
  })

  it('volta a marcar quando a conversa RETORNA a um anuncio anterior', () => {
    // Aqui o card tem que reaparecer: o assunto realmente mudou duas vezes, e
    // sem a moldura o leitor nao teria como saber que voltaram ao primeiro.
    const ids = idsComCardDeAnuncio([
      msg('a', 'anuncio-1'), msg('b', 'anuncio-2'), msg('c', 'anuncio-1'),
    ])
    expect([...ids]).toEqual(['a', 'b', 'c'])
  })
})
