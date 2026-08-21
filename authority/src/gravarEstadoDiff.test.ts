// `gravarEstado()` grava so o que MUDOU.
//
// O que estes testes trancam: uma janela de flush em que nada aconteceu (POKE
// desmaiado, inimigo ainda nascendo, jogador parado no Hospital) nao pode custar
// o mesmo que uma janela cheia de abates. Antes custava: cada uma das quatro
// tabelas levava dois round-trips fixos (o select do diff de remocao e o
// upsert), 120 vezes por hora por jogador.
//
// A falha aqui e SILENCIOSA nos dois sentidos, e por isso os dois lados estao
// cobertos: gravar demais so aparece na fatura do Supabase, e gravar de menos
// aparece como progresso que volta atras.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  defaultGameStateData,
  gameStateToPokemonRows, gameStateToItemRows, gameStateToPokedexRows, gameStateToAutoCatchRuleRows,
  type GameStateData, type PlayerSnapshot,
} from '#engine'
import type { Config } from './db.js'
import { gravarEstado } from './progresso.js'

let tabelaPlayers: { user_id: string; updated_at: string; [k: string]: unknown }

vi.mock('./db.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./db.js')>()
  return {
    ...real,
    atualizarRetornando: vi.fn(async (_cfg: unknown, _caminho: string, patch: Record<string, unknown>) => {
      Object.assign(tabelaPlayers, patch)
      return [tabelaPlayers]
    }),
    atualizar: vi.fn(async () => {}),
    selecionarTudo: vi.fn(async () => []),
    inserir: vi.fn(async () => []),
    apagar: vi.fn(async () => {}),
  }
})

const db = await import('./db.js')
const cfg = {} as Config
const USER = 'jogador-1'

/**
 * O baseline que o banco devolveria para ESTE estado.
 *
 * Derivado dos proprios mappers de propósito: o diff compara linha mapeada com
 * linha lida, então "o banco está em sincronia com o estado" é exatamente isso.
 * Montar as linhas à mão aqui testaria a minha digitação, não o diff.
 */
function baselineDe(estado: GameStateData): PlayerSnapshot {
  return {
    player: { user_id: USER, updated_at: tabelaPlayers.updated_at } as unknown as PlayerSnapshot['player'],
    pokemon: gameStateToPokemonRows(USER, estado) as unknown as PlayerSnapshot['pokemon'],
    items: gameStateToItemRows(USER, estado) as unknown as PlayerSnapshot['items'],
    pokedex: gameStateToPokedexRows(USER, estado) as unknown as PlayerSnapshot['pokedex'],
    autoCatchRules: gameStateToAutoCatchRuleRows(USER, estado) as unknown as PlayerSnapshot['autoCatchRules'],
  }
}

function estadoComItens(): GameStateData {
  const estado = defaultGameStateData()
  estado.items = { potion: 3, poke_ball: 10 }
  estado.pokedexKills = { charmander: { normal: 5, shiny: 0 } }
  return estado
}

beforeEach(() => {
  tabelaPlayers = { user_id: USER, updated_at: '2026-01-01T00:00:00.000Z' }
  vi.clearAllMocks()
})

describe('gravarEstado() — diff de escrita', () => {
  it('janela sem nenhum evento: grava so a linha de players', async () => {
    const estado = estadoComItens()

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baselineDe(estado))

    // `players` SEMPRE e gravada: `last_flush_at`/`updated_at` e o que marca a
    // janela como creditada, e o CAS depende disso.
    expect(db.atualizarRetornando).toHaveBeenCalledTimes(1)
    // As outras quatro tabelas nao sao nem consultadas — o select do diff de
    // remocao tambem cai fora.
    expect(db.inserir).not.toHaveBeenCalled()
    expect(db.apagar).not.toHaveBeenCalled()
    expect(db.selecionarTudo).not.toHaveBeenCalled()
  })

  it('um item consumido volta a gravar player_items — e SO ela', async () => {
    const estado = estadoComItens()
    const baseline = baselineDe(estado)
    estado.items = { ...estado.items, potion: 2 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const tabelasGravadas = (db.inserir as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[1])
    expect(tabelasGravadas).toEqual(['player_items'])
  })

  it('um abate novo na Pokedex volta a gravar player_pokedex', async () => {
    const estado = estadoComItens()
    const baseline = baselineDe(estado)
    estado.pokedexKills = { ...estado.pokedexKills, charmander: { normal: 6, shiny: 0 } }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const tabelasGravadas = (db.inserir as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[1])
    expect(tabelasGravadas).toEqual(['player_pokedex'])
  })

  it('sem baseline, reescreve tudo — o comportamento de antes', async () => {
    // Chamador que nao passa `linhasNoLoad` (codigo antigo, ou leitura que nao
    // guardou as linhas) nao pode ganhar um "nada mudou" por omissao: sem
    // baseline nao ha como afirmar isso.
    const estado = estadoComItens()

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at)

    const tabelasGravadas = (db.inserir as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[1])
    expect(tabelasGravadas).toContain('player_items')
    expect(tabelasGravadas).toContain('player_pokedex')
  })

  it('linha a MAIS no banco que o estado nao tem mais continua sendo apagada', async () => {
    // A protecao contra "grava demais" nao pode virar uma que impede REMOCAO: o
    // item consumido ate zero precisa sair do banco (senao 20 Stones gastas
    // voltam a 20 no reload — bug real que o diff de remocao conserta).
    const estado = estadoComItens()
    const baseline = baselineDe(estado)
    delete estado.items.potion
    ;(db.selecionarTudo as unknown as { mockResolvedValueOnce: (v: unknown) => void })
      .mockResolvedValueOnce([{ item_id: 'potion' }, { item_id: 'poke_ball' }])

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const apagados = (db.apagar as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[1]))
    expect(apagados.some((c) => c.includes('player_items') && c.includes('potion'))).toBe(true)
  })
})
