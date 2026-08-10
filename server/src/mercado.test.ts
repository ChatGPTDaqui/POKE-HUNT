import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ErroHttp, type Config } from './db.js'
import { casar, type LinhaOrdem } from './mercado.js'

// Fake minimo do PostgREST: guarda `market_orders` num Map e entende os
// filtros de query string que mercado.ts realmente usa (eq/neq/lte/gte,
// select, order, limit). Suficiente pra exercitar o CAS de casar() sem
// precisar de banco real.
const tabela = new Map<string, LinhaOrdem>()

function parseFiltros(query: string) {
  const filtros: Array<[string, string]> = []
  let limit: number | undefined
  for (const parte of query.split('&')) {
    if (!parte) continue
    const [chave, valor] = parte.split('=')
    if (chave === 'select' || chave === 'order') continue
    if (chave === 'limit') { limit = Number(valor); continue }
    filtros.push([chave, decodeURIComponent(valor)])
  }
  return { filtros, limit }
}

function bateFiltro(ordem: LinhaOrdem, chave: string, valorFiltro: string): boolean {
  const ponto = valorFiltro.indexOf('.')
  const op = valorFiltro.slice(0, ponto)
  const valor = valorFiltro.slice(ponto + 1)
  const campo = (ordem as unknown as Record<string, unknown>)[chave]
  if (op === 'eq') return String(campo) === valor
  if (op === 'neq') return String(campo) !== valor
  if (op === 'lte') return Number(campo) <= Number(valor)
  if (op === 'gte') return Number(campo) >= Number(valor)
  return true
}

function selecionarLinhas(caminho: string): LinhaOrdem[] {
  const [recurso, query = ''] = caminho.split('?')
  if (recurso !== 'market_orders') return []
  const { filtros, limit } = parseFiltros(query)
  let linhas = [...tabela.values()].filter((o) => filtros.every(([chave, valorFiltro]) => bateFiltro(o, chave, valorFiltro)))
  linhas = linhas.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (limit) linhas = linhas.slice(0, limit)
  return linhas
}

// Ponto de injecao da corrida: depois que a "outra" ordem de uma partida e
// decrementada via CAS dentro do loop de casar(), simula um terceiro
// jogador casando concorrentemente contra a ordem sob teste.
let aoAplicarPatchDaOutra: ((idOutra: string) => void) | null = null

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    selecionar: vi.fn(async (_cfg: unknown, caminho: string) => selecionarLinhas(caminho)),
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      const [alvo] = selecionarLinhas(caminho)
      if (!alvo) return []
      Object.assign(alvo, patch)
      aoAplicarPatchDaOutra?.(alvo.id)
      return [alvo]
    }),
    atualizar: vi.fn(async () => {}),
    inserir: vi.fn(async () => []),
  }
})

vi.mock('./entregas.js', () => ({
  enfileirarEntrega: vi.fn(async () => {}),
}))

const cfg = {} as Config
const store = { addItem: vi.fn(), addGold: vi.fn() } as unknown as Parameters<typeof casar>[3]

function novaOrdem(overrides: Partial<LinhaOrdem>): LinhaOrdem {
  return {
    id: 'sem-id',
    user_id: 'sem-user',
    item_id: 'poke_ball',
    side: 'venda',
    unit_price: 100,
    quantity: 10,
    remaining: 10,
    gold_retido: 0,
    status: 'ativa',
    created_at: new Date().toISOString(),
    closed_at: null,
    ...overrides,
  }
}

beforeEach(() => {
  tabela.clear()
  aoAplicarPatchDaOutra = null
  vi.clearAllMocks()
})

describe('casar() — CAS na escrita final da propria ordem (PH-3)', () => {
  it('nao sobrescreve decremento concorrente aplicado por outro casamento durante o loop', async () => {
    const ordemA = novaOrdem({ id: 'A', user_id: 'seller-A', side: 'venda', remaining: 10, gold_retido: 0 })
    const ordemB = novaOrdem({
      id: 'B', user_id: 'buyer-B', side: 'compra', remaining: 4, unit_price: 100, gold_retido: 400,
      created_at: new Date(Date.now() - 1000).toISOString(),
    })
    tabela.set('A', { ...ordemA })
    tabela.set('B', { ...ordemB })

    // Enquanto casar(A) esta decrementando B via CAS, um terceiro jogador
    // (fora deste teste) casa 3 unidades contra A pelo MESMO caminho de CAS
    // correto (linha ~380) — cenario real descrito na issue.
    aoAplicarPatchDaOutra = (idOutra) => {
      if (idOutra !== 'B') return
      const linhaA = tabela.get('A')!
      linhaA.remaining -= 3
    }

    const resultado = await casar(cfg, 'seller-A', { ...ordemA }, store)

    expect(resultado.executado).toBe(4)
    // 10 (original) - 3 (match externo concorrente) - 4 (match desta chamada) = 3.
    // Sem o CAS, o PATCH final absoluto gravaria 10-4=6 e apagaria o -3 externo.
    expect(tabela.get('A')!.remaining).toBe(3)
    expect(tabela.get('A')!.status).toBe('ativa')
    expect(tabela.get('B')!.remaining).toBe(0)
    expect(tabela.get('B')!.status).toBe('concluida')
  })

  it('recalcula gold_retido (nao so remaining) quando a propria ordem e de compra', async () => {
    const ordemA = novaOrdem({
      id: 'A', user_id: 'buyer-A', side: 'compra', remaining: 10, unit_price: 100, gold_retido: 1000,
    })
    const ordemB = novaOrdem({
      id: 'B', user_id: 'seller-B', side: 'venda', remaining: 4, unit_price: 100, gold_retido: 0,
      created_at: new Date(Date.now() - 1000).toISOString(),
    })
    tabela.set('A', { ...ordemA })
    tabela.set('B', { ...ordemB })

    aoAplicarPatchDaOutra = (idOutra) => {
      if (idOutra !== 'B') return
      tabela.get('A')!.remaining -= 3
    }

    await casar(cfg, 'buyer-A', { ...ordemA }, store)

    expect(tabela.get('A')!.remaining).toBe(3)
    // gold_retido recalculado sobre o valor FRESCO lido no reread, nao sobre
    // o pre-calculado da primeira tentativa.
    expect(tabela.get('A')!.gold_retido).toBe(1000 - 100 * 4)
  })

  it('joga 409 se a ordem nao esta mais ativa quando o CAS falha (sem sobrescrever)', async () => {
    const ordemA = novaOrdem({ id: 'A', user_id: 'seller-A', side: 'venda', remaining: 10 })
    const ordemB = novaOrdem({
      id: 'B', user_id: 'buyer-B', side: 'compra', remaining: 4, unit_price: 100, gold_retido: 400,
      created_at: new Date(Date.now() - 1000).toISOString(),
    })
    tabela.set('A', { ...ordemA })
    tabela.set('B', { ...ordemB })

    aoAplicarPatchDaOutra = (idOutra) => {
      if (idOutra !== 'B') return
      // Ordem A foi cancelada por outra via enquanto este casar() estava em voo.
      tabela.get('A')!.status = 'cancelada'
      tabela.get('A')!.closed_at = new Date().toISOString()
    }

    await expect(casar(cfg, 'seller-A', { ...ordemA }, store)).rejects.toThrow(ErroHttp)
    expect(tabela.get('A')!.status).toBe('cancelada')
  })
})
