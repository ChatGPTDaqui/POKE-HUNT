import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ErroHttp, type Config } from './db.js'
import { limparMundoDoJogador } from './reiniciar.js'
import { responderOferta, type LinhaAnuncio, type LinhaOferta } from './mercado.js'

// Fake minimo multi-tabela: cobre so o que o fluxo de reset (PH-4) e
// responderOferta tocam nestes testes — market_listings, market_offers, e um
// pokemon_instances vazio (a transferencia so roda se a oferta ainda estiver
// pendente, o que os cenarios de reset aqui garantem que nao acontece mais).
const tabelas: Record<string, Map<string, Record<string, unknown>>> = {
  market_listings: new Map(),
  market_offers: new Map(),
  pokemon_instances: new Map(),
}

function parseFiltros(query: string) {
  const filtros: Array<[string, string]> = []
  for (const parte of query.split('&')) {
    if (!parte) continue
    const [chave, valor] = parte.split('=')
    if (chave === 'select' || chave === 'order' || chave === 'limit') continue
    filtros.push([chave, decodeURIComponent(valor)])
  }
  return filtros
}

function bateFiltro(linha: Record<string, unknown>, chave: string, valorFiltro: string): boolean {
  const ponto = valorFiltro.indexOf('.')
  const op = valorFiltro.slice(0, ponto)
  const valor = valorFiltro.slice(ponto + 1)
  if (op === 'eq') return String(linha[chave]) === valor
  if (op === 'neq') return String(linha[chave]) !== valor
  return true
}

function acharLinhas(caminho: string): Record<string, unknown>[] {
  const [recurso, query = ''] = caminho.split('?')
  const tabela = tabelas[recurso]
  if (!tabela) return []
  const filtros = parseFiltros(query)
  return [...tabela.values()].filter((l) => filtros.every(([chave, valorFiltro]) => bateFiltro(l, chave, valorFiltro)))
}

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => acharLinhas(caminho)),
    selecionarTudo: vi.fn(async (_cfg: unknown, caminho: string) => acharLinhas(caminho)),
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      const alvos = acharLinhas(caminho)
      for (const alvo of alvos) Object.assign(alvo, patch)
      return alvos
    }),
    atualizar: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      for (const alvo of acharLinhas(caminho)) Object.assign(alvo, patch)
    }),
    apagar: vi.fn(async (_cfg: unknown, caminho: string) => {
      const [recurso, query = ''] = caminho.split('?')
      const tabela = tabelas[recurso]
      if (!tabela) return
      const filtros = parseFiltros(query)
      for (const [id, linha] of [...tabela.entries()]) {
        if (filtros.every(([chave, valorFiltro]) => bateFiltro(linha, chave, valorFiltro))) tabela.delete(id)
      }
    }),
    inserir: vi.fn(async () => []),
  }
})

const entregasEnfileiradas: Array<{ userId: string; gold?: number; diamonds?: number; motivo: string }> = []
vi.mock('./entregas.js', () => ({
  enfileirarEntrega: vi.fn(async (_cfg: unknown, entrega: { userId: string; gold?: number; diamonds?: number; motivo: string }) => {
    entregasEnfileiradas.push(entrega)
  }),
}))

const cfg = {} as Config

function novoAnuncio(overrides: Partial<LinhaAnuncio>): LinhaAnuncio {
  return {
    id: 'anuncio-1',
    seller_id: 'vendedor-1',
    poke_uid: 'poke-1',
    price: null,
    apenas_oferta: true,
    currency: 'gold',
    status: 'ativo',
    species_id: 'charmander',
    level: 5,
    rarity: 'comum',
    is_shiny: false,
    iv_percent: 50,
    created_at: new Date().toISOString(),
    sold_at: null,
    buyer_id: null,
    ...overrides,
  }
}

function novaOferta(overrides: Partial<LinhaOferta>): LinhaOferta {
  return {
    id: 'oferta-1',
    listing_id: 'anuncio-1',
    buyer_id: 'comprador-1',
    valor: 300,
    currency: 'gold',
    status: 'pendente',
    created_at: new Date().toISOString(),
    resolved_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  tabelas.market_listings.clear()
  tabelas.market_offers.clear()
  tabelas.pokemon_instances.clear()
  entregasEnfileiradas.length = 0
  vi.clearAllMocks()
})

describe('limparMundoDoJogador — market_offers no reset de conta (PH-4)', () => {
  it('como vendedor: devolve o escrow de quem ofertou antes de apagar o anuncio', async () => {
    const anuncio = novoAnuncio({ id: 'anuncio-1', seller_id: 'vendedor-que-reseta' })
    const oferta = novaOferta({ id: 'oferta-1', listing_id: 'anuncio-1', buyer_id: 'ofertante-1', valor: 750 })
    tabelas.market_listings.set(anuncio.id, { ...anuncio })
    tabelas.market_offers.set(oferta.id, { ...oferta })

    await limparMundoDoJogador(cfg, 'vendedor-que-reseta')

    expect(entregasEnfileiradas).toHaveLength(1)
    expect(entregasEnfileiradas[0]).toMatchObject({ userId: 'ofertante-1', gold: 750, diamonds: 0 })
    // O anuncio (do jogador que resetou) foi mesmo apagado.
    expect(tabelas.market_listings.has(anuncio.id)).toBe(false)
  })

  it('como comprador: cancela a oferta enviada, sem gerar credito orfao quando o vendedor responde depois', async () => {
    const anuncio = novoAnuncio({ id: 'anuncio-2', seller_id: 'vendedor-2' })
    const oferta = novaOferta({ id: 'oferta-2', listing_id: 'anuncio-2', buyer_id: 'jogador-que-reseta', valor: 400 })
    tabelas.market_listings.set(anuncio.id, { ...anuncio })
    tabelas.market_offers.set(oferta.id, { ...oferta })

    await limparMundoDoJogador(cfg, 'jogador-que-reseta')

    expect(tabelas.market_offers.get(oferta.id)!.status).toBe('cancelada')
    expect(entregasEnfileiradas).toHaveLength(0)

    // A contraparte (vendedor-2) so resolve DEPOIS do reset -- se ainda
    // conseguisse aceitar, creditaria uma conta que "comecou do zero".
    await expect(responderOferta(cfg, 'vendedor-2', oferta.id, true)).rejects.toThrow(ErroHttp)
    expect(entregasEnfileiradas).toHaveLength(0)
  })
})
