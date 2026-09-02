// PH-437 — o adaptador da reserva.
//
// Dois invariantes que nenhum tipo pega:
//
// 1. Preço e destinatário vão na MESMA chamada. Duas chamadas (uma pro preço,
//    outra pra reserva) abririam a janela em que o anúncio está barato e ainda
//    público — e a vitrine ordena por preço crescente, então o POKE apareceria
//    no topo da lista de todo mundo exatamente nela.
// 2. `mercadoMeus` lê os anúncios da VIEW, não da tabela. A tabela guarda só o
//    uuid de quem reservou, e "reservado para 8f3a…" não diz nada; e o `ofertas`
//    que a tela já lia vinha `undefined` da tabela, mostrando "0 lance(s)" em
//    anúncio com lance.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const rpc = vi.fn()
const de = vi.fn()
const eq = vi.fn()
const selecionar = vi.fn()
const ordem = vi.fn()

let resposta: { data: unknown; error: { message: string } | null; count?: number } = { data: [], error: null }
const construtor: Record<string, unknown> = {}
Object.assign(construtor, {
  select: selecionar.mockReturnValue(construtor),
  eq: eq.mockReturnValue(construtor),
  order: ordem.mockReturnValue(construtor),
  limit: vi.fn().mockReturnValue(construtor),
  maybeSingle: () => Promise.resolve(resposta),
  then: (aceitar: (v: unknown) => unknown) => Promise.resolve(resposta).then(aceitar),
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => { de(...args); return construtor },
    rpc: (...args: unknown[]) => rpc(...args),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'eu' } } } }) },
  },
}))

vi.mock('@/stores/mochilaStore', () => ({ mochilaCarregada: () => false, useMochilaStore: { setState: vi.fn() } }))

const { reservarAnuncio, mercadoMeus } = await import('./mercadoRpc')

describe('reservarAnuncio', () => {
  beforeEach(() => { vi.clearAllMocks(); resposta = { data: [], error: null } })

  it('manda anuncio, destinatario e preco numa unica RPC', () => {
    rpc.mockResolvedValue({ data: { ok: true, mensagem: 'Charmander reservado para Misty por 1800000.' }, error: null })
    return reservarAnuncio({ anuncioId: 'anuncio-1', paraId: 'u2', price: 1_800_000 }).then((r) => {
      expect(rpc).toHaveBeenCalledTimes(1)
      expect(rpc).toHaveBeenCalledWith('reservar_anuncio', {
        p_anuncio_id: 'anuncio-1', p_para_id: 'u2', p_price: 1_800_000,
      })
      expect(r.mensagem).toContain('reservado para Misty')
    })
  })

  it('limpar a reserva manda destinatario nulo e NAO manda preco', () => {
    // Mandar um preco aqui reescreveria o valor do anuncio na hora de soltar,
    // que e o oposto do que "liberar" significa.
    rpc.mockResolvedValue({ data: { ok: true, mensagem: 'Reserva removida.' }, error: null })
    return reservarAnuncio({ anuncioId: 'anuncio-1', paraId: null }).then(() => {
      expect(rpc).toHaveBeenCalledWith('reservar_anuncio', {
        p_anuncio_id: 'anuncio-1', p_para_id: null, p_price: null,
      })
    })
  })

  it('transforma recusa do servidor em ErroServidor com a mensagem dele', () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Este anuncio tem 1 lance(s) pendente(s) — responda antes de reservar.' } })
    return expect(reservarAnuncio({ anuncioId: 'a', paraId: 'u2', price: 1 }))
      .rejects.toThrow('responda antes de reservar')
  })
})

describe('mercadoMeus', () => {
  beforeEach(() => { vi.clearAllMocks(); resposta = { data: [], error: null } })

  it('le os anuncios da view, que e quem sabe o nome de quem reservou', async () => {
    await mercadoMeus()
    expect(de).toHaveBeenCalledWith('mercado_anuncios_ativos')
    // A tabela crua nao pode mais ser a fonte desta lista.
    const tabelas = de.mock.calls.map((c) => c[0])
    expect(tabelas).not.toContain('market_listings')
  })
})
