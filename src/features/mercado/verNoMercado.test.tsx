// @vitest-environment jsdom
// "Ver no mercado" e a vitrine agrupada (28/10/2026).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMercadoStore } from './mercadoStore'

const rpc = vi.hoisted(() => ({
  vitrineDePokes: vi.fn(async () => ({ grupos: [], total: 0 })),
  anunciosDoGrupo: vi.fn(async () => []),
  historicoDoGrupo: vi.fn(async () => ({ serie: [], resumo: null })),
  precoDeReferencia: vi.fn(async () => []),
}))
vi.mock('@/data/remote/mercadoRpc', async (orig) => ({ ...(await orig<object>()), ...rpc }))

import { MercadoMenu } from './MercadoMenu'

function renderizar() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={cliente}><MercadoMenu /></QueryClientProvider>)
}

const CHARIZARD = { speciesId: 'charizard', isShiny: true, ivFaixa: 'f95' as const, currency: 'gold' as const }

beforeEach(() => {
  useMercadoStore.setState({ grupoAberto: null, pedido: 0, vendaPedida: null, pedidoDeVenda: 0 })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Ver no mercado', () => {
  it('pedido de fora leva o Mercado pra pagina do grupo e e consumido', async () => {
    useMercadoStore.getState().verNoMercado(CHARIZARD)
    renderizar()
    expect(await screen.findByText(/voltar à vitrine/i)).toBeTruthy()
    expect(screen.getByText('PREÇO MÉDIO (7 DIAS)')).toBeTruthy()
    expect(screen.getByText('IV perfeito')).toBeTruthy()
    // Consumido: reabrir o Mercado depois nao arrasta de novo pra Comprar.
    expect(useMercadoStore.getState().pedido).toBe(0)
    expect(rpc.anunciosDoGrupo).toHaveBeenCalledWith(expect.objectContaining({ speciesId: 'charizard', isShiny: true, ivFaixa: 'f95' }))
  })

  it('sem vendas, a pagina diz isso em vez de mostrar um preco', async () => {
    useMercadoStore.getState().verNoMercado(CHARIZARD)
    renderizar()
    expect(await screen.findByText('Sem vendas recentes')).toBeTruthy()
    expect(await screen.findByText('Ninguém está vendendo este grupo agora.')).toBeTruthy()
  })

  it('voltar fecha a pagina do grupo e mostra a vitrine agrupada', async () => {
    useMercadoStore.getState().verNoMercado(CHARIZARD)
    renderizar()
    act(() => { (screen.getByText(/voltar à vitrine/i) as HTMLButtonElement).click() })
    expect(useMercadoStore.getState().grupoAberto).toBeNull()
    expect(await screen.findByText('Nenhum POKE à venda com esses filtros.')).toBeTruthy()
    expect(rpc.vitrineDePokes).toHaveBeenCalled()
  })
})
