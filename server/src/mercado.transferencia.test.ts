import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData } from '#engine'
import { type Config } from './db.js'
import { concluirCompra, responderOferta, type LinhaAnuncio, type LinhaOferta } from './mercado.js'

// Fake minimo multi-tabela: so o suficiente pra exercitar a compensacao
// quando a transferencia de POKE falha DEPOIS do CAS que fecha
// anuncio/oferta e cobra o comprador (PH-7). Uma falha real e transitoria
// (502 do PostgREST apos retries esgotados, ver db.ts:66) e simulada
// jogando o `atualizar` de `pokemon_instances` pra sempre falhar.
const tabelas: Record<string, Map<string, Record<string, unknown>>> = {
  market_listings: new Map(),
  market_offers: new Map(),
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
  return true
}

function acharLinhas(caminho: string): Record<string, unknown>[] {
  const [recurso, query = ''] = caminho.split('?')
  const tabela = tabelas[recurso]
  if (!tabela) return []
  const filtros = parseFiltros(query)
  return [...tabela.values()].filter((l) => filtros.every(([chave, valorFiltro]) => bateFiltro(l, chave, valorFiltro)))
}

let falharTransferenciaDePoke = false

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => acharLinhas(caminho)),
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      const alvos = acharLinhas(caminho)
      for (const alvo of alvos) Object.assign(alvo, patch)
      return alvos
    }),
    atualizar: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      if (caminho.startsWith('pokemon_instances?') && falharTransferenciaDePoke) {
        throw new Error('falha simulada — 502 apos retries esgotados')
      }
      for (const alvo of acharLinhas(caminho)) Object.assign(alvo, patch)
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

vi.mock('./progresso.js', () => ({
  gravarEstado: vi.fn(async () => {}),
  carregarEstado: vi.fn(async () => defaultGameStateData()),
}))

const cfg = {} as Config

function novoAnuncio(overrides: Partial<LinhaAnuncio>): LinhaAnuncio {
  return {
    id: 'anuncio-1',
    seller_id: 'vendedor-1',
    poke_uid: 'poke-1',
    price: 500,
    apenas_oferta: false,
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

beforeEach(() => {
  tabelas.market_listings.clear()
  tabelas.market_offers.clear()
  entregasEnfileiradas.length = 0
  falharTransferenciaDePoke = false
  vi.clearAllMocks()
})

describe('concluirCompra() — compensacao se a transferencia de POKE falhar (PH-7)', () => {
  it('reabre o anuncio e estorna o comprador quando a transferencia falha', async () => {
    const anuncio = novoAnuncio({})
    tabelas.market_listings.set(anuncio.id, { ...anuncio })
    falharTransferenciaDePoke = true

    await expect(
      concluirCompra(cfg, 'comprador-1', anuncio, 500, defaultGameStateData(), new Set(), 'v0'),
    ).rejects.toThrow('falha simulada')

    const listingFinal = tabelas.market_listings.get(anuncio.id)!
    expect(listingFinal.status).toBe('ativo')
    expect(listingFinal.buyer_id).toBeNull()
    expect(listingFinal.sold_at).toBeNull()

    expect(entregasEnfileiradas).toHaveLength(1)
    expect(entregasEnfileiradas[0]).toMatchObject({ userId: 'comprador-1', gold: 500, diamonds: 0 })
  })

  it('transferencia bem sucedida nao aciona nenhum estorno', async () => {
    const anuncio = novoAnuncio({})
    tabelas.market_listings.set(anuncio.id, { ...anuncio })
    falharTransferenciaDePoke = false

    await concluirCompra(cfg, 'comprador-1', anuncio, 500, defaultGameStateData(), new Set(), 'v0')

    expect(entregasEnfileiradas.some((e) => e.motivo.startsWith('Estorno'))).toBe(false)
    // Entrega normal do vendedor (pagamento) ainda acontece.
    expect(entregasEnfileiradas.some((e) => e.userId === 'vendedor-1')).toBe(true)
  })
})

describe('responderOferta() — compensacao se a transferencia de POKE falhar (PH-7)', () => {
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

  it('reabre o anuncio, fecha a oferta como recusada e estorna o comprador', async () => {
    const anuncio = novoAnuncio({ apenas_oferta: true, price: null })
    const oferta = novaOferta({})
    tabelas.market_listings.set(anuncio.id, { ...anuncio })
    tabelas.market_offers.set(oferta.id, { ...oferta })
    falharTransferenciaDePoke = true

    await expect(responderOferta(cfg, 'vendedor-1', oferta.id, true)).rejects.toThrow('falha simulada')

    const listingFinal = tabelas.market_listings.get(anuncio.id)!
    expect(listingFinal.status).toBe('ativo')
    expect(listingFinal.buyer_id).toBeNull()

    const ofertaFinal = tabelas.market_offers.get(oferta.id)!
    expect(ofertaFinal.status).toBe('recusada')

    expect(entregasEnfileiradas).toHaveLength(1)
    expect(entregasEnfileiradas[0]).toMatchObject({ userId: 'comprador-1', gold: 300, diamonds: 0 })
  })
})
