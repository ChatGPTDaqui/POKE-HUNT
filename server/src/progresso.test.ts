import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData } from '#engine'
import { ErroHttp, type Config } from './db.js'
import { gravarEstado, comRetryDeColisao, CONFLITO_ESCRITA_JOGADOR } from './progresso.js'

// Fake minimo da linha de `players`: so o suficiente pra exercitar o CAS de
// gravarEstado() sem banco real. As outras tabelas que gravarEstado toca
// (pokemon_instances/player_items/player_pokedex/player_auto_catch_rules) nao
// sao o foco da PH-5 -- ficam como no-op.
let tabelaPlayers: { user_id: string; updated_at: string; [k: string]: unknown }

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async (_cfg: unknown, caminho: string, patch: Record<string, unknown>) => {
      const bateUpdatedAt = caminho.includes(`updated_at=eq.${encodeURIComponent(tabelaPlayers.updated_at)}`)
      if (!bateUpdatedAt) return []
      Object.assign(tabelaPlayers, patch)
      // Simula o trigger `players_set_updated_at`: todo UPDATE bem sucedido
      // (nosso ou de um request concorrente) sempre avanca a versao.
      tabelaPlayers.updated_at = new Date(new Date(tabelaPlayers.updated_at).getTime() + 1).toISOString()
      return [tabelaPlayers]
    }),
    atualizar: vi.fn(async () => {}),
    selecionarTudo: vi.fn(async () => []),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const cfg = {} as Config

beforeEach(() => {
  tabelaPlayers = { user_id: 'jogador-1', updated_at: '2026-01-01T00:00:00.000Z' }
  vi.clearAllMocks()
})

describe('gravarEstado() — CAS na linha de players (PH-5)', () => {
  it('duas gravacoes concorrentes com o mesmo snapshot: a segunda leva 409, sem sobrescrever a primeira', async () => {
    const t0 = tabelaPlayers.updated_at
    const estado = defaultGameStateData()

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), t0)
    const apósPrimeira = tabelaPlayers.updated_at
    expect(apósPrimeira).not.toBe(t0)

    await expect(gravarEstado(cfg, 'jogador-1', estado, new Set(), t0)).rejects.toThrow(ErroHttp)
    // updated_at continua exatamente o da primeira escrita: a segunda nao
    // aplicou nada por cima (sem isso seria o bug real de PH-5).
    expect(tabelaPlayers.updated_at).toBe(apósPrimeira)
  })

  it('gravacao sequencial (cada uma le o updated_at fresco) funciona normalmente', async () => {
    const estado = defaultGameStateData()

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), tabelaPlayers.updated_at)
    const apósPrimeira = tabelaPlayers.updated_at

    await gravarEstado(cfg, 'jogador-1', estado, new Set(), apósPrimeira)
    expect(tabelaPlayers.updated_at).not.toBe(apósPrimeira)
  })
})

describe('comRetryDeColisao() — BUG REAL: janela inteira (inclusive a sequencia do Lance) descartada por uma colisao efemera', () => {
  it('retenta uma colisao de escrita e devolve o resultado da tentativa que deu certo', async () => {
    let chamadas = 0
    const resultado = await comRetryDeColisao(async () => {
      chamadas += 1
      if (chamadas < 3) throw new ErroHttp(409, CONFLITO_ESCRITA_JOGADOR)
      return 'sequencia gravada'
    })
    expect(resultado).toBe('sequencia gravada')
    expect(chamadas).toBe(3)
  })

  it('desiste depois do teto de tentativas e deixa o 409 subir', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new ErroHttp(409, CONFLITO_ESCRITA_JOGADOR)
    })).rejects.toThrow(CONFLITO_ESCRITA_JOGADOR)
    expect(chamadas).toBe(3)
  })

  it('NAO retenta um 409 de outro motivo (ex: "nenhuma sessao aberta")', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new ErroHttp(409, 'nenhuma sessao aberta')
    })).rejects.toThrow('nenhuma sessao aberta')
    expect(chamadas).toBe(1)
  })

  it('NAO retenta erro que nao e ErroHttp', async () => {
    let chamadas = 0
    await expect(comRetryDeColisao(async () => {
      chamadas += 1
      throw new Error('estouro de verdade, nao colisao')
    })).rejects.toThrow('estouro de verdade')
    expect(chamadas).toBe(1)
  })
})
