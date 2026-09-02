// PH-435 — o anúncio que sai da vitrine e entra na conversa.
//
// O caminho antigo (PH-119) era vitrine → perfil público → "Conversar", e
// levava só `{ userId, nick }`. O contexto morria na primeira tela: o vendedor
// recebia "aceita 1.8M?" sem saber de qual dos anúncios dele se tratava.
//
// O que este arquivo trava é a CONVERSÃO — o único ponto onde a linha do
// servidor vira o que a conversa entende. Errar um campo aqui não quebra
// nenhum tipo (`AnuncioMercado` e `AnuncioParaConversa` não têm relação de
// tipo entre si) e produziria um card com o POKE certo e o preço errado.
import { describe, expect, it } from 'vitest'
import type { AnuncioMercado } from '@/data/remote/servidor'
import { anuncioParaConversa } from './utils'

function anuncio(extra: Partial<AnuncioMercado> = {}): AnuncioMercado {
  return {
    id: 'anuncio-1',
    seller_id: 'vendedor',
    poke_uid: 'poke-1',
    price: 2_500_000,
    apenas_oferta: false,
    currency: 'gold',
    species_id: 'charmander',
    level: 40,
    rarity: 'raro',
    is_shiny: false,
    iv_percent: 88,
    created_at: '2026-09-02T10:00:00Z',
    ...extra,
  }
}

describe('anuncioParaConversa', () => {
  it('carrega o id do anuncio — o unico campo que a RPC de envio consome', () => {
    expect(anuncioParaConversa(anuncio()).id).toBe('anuncio-1')
  })

  it('leva o vendedor, pro card saber de que lado da mesa o leitor esta', () => {
    // Sem `sellerId`, o card nao consegue escolher entre "Sobre o seu anuncio" e
    // "Veio pelo anuncio" — e as duas frases dizem coisas opostas.
    expect(anuncioParaConversa(anuncio()).sellerId).toBe('vendedor')
  })

  it('preserva especie, nivel, raridade, IV, shiny e preco sem trocar nenhum', () => {
    expect(anuncioParaConversa(anuncio({ is_shiny: true, iv_percent: 93, level: 71 }))).toEqual({
      id: 'anuncio-1',
      sellerId: 'vendedor',
      speciesId: 'charmander',
      level: 71,
      isShiny: true,
      rarity: 'raro',
      ivPercent: 93,
      price: 2_500_000,
      currency: 'gold',
      modo: 'preco_fixo',
      apenasOferta: false,
    })
  })

  it('mantem `price` nulo em anuncio somente-lance em vez de virar zero', () => {
    // Zero diria que o POKE e de graca. O card usa a AUSENCIA de preco pra
    // escrever "somente lance".
    const r = anuncioParaConversa(anuncio({ price: null, apenas_oferta: true }))
    expect(r.price).toBeNull()
    expect(r.apenasOferta).toBe(true)
  })

  it('le leilao como leilao', () => {
    expect(anuncioParaConversa(anuncio({ modo: 'leilao', price: null, apenas_oferta: true })).modo)
      .toBe('leilao')
  })

  it('cai pra preco fixo quando o `modo` nao veio', () => {
    // Mesmo default da coluna no banco: anuncio antigo e resposta de servidor
    // mais velho eram preco fixo.
    expect(anuncioParaConversa(anuncio({ modo: undefined })).modo).toBe('preco_fixo')
  })

  it('respeita diamante', () => {
    expect(anuncioParaConversa(anuncio({ currency: 'diamond' })).currency).toBe('diamond')
  })
})
