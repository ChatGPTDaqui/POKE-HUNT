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
    // A linha do jogador deixou de ser gravada por PATCH cru e passou a ir
    // pela RPC `gravar_progresso` (PH-67), que pega o mesmo advisory lock das
    // RPCs de acao. Sem stubar aqui, o teste faz `fetch` DE VERDADE contra
    // `cfg.supabaseUrl` (que e `{}`) e morre com "falha ao falar com o banco"
    // antes de chegar no diff que ele existe pra medir.
    chamarRpc: vi.fn(async (_cfg: unknown, nome: string, args: Record<string, unknown>) => {
      if (nome !== 'gravar_progresso') return { ok: true }
      Object.assign(tabelaPlayers, args.p_patch as Record<string, unknown>)
      return { ok: true, updatedAt: tabelaPlayers.updated_at }
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
    // janela como creditada, e o CAS depende disso. Desde PH-67 o caminho e a
    // RPC `gravar_progresso` (mesmo advisory lock das RPCs de acao), nao mais
    // um PATCH cru — o invariante e o mesmo, o transporte que mudou.
    expect(db.chamarRpc).toHaveBeenCalledTimes(1)
    expect(db.chamarRpc).toHaveBeenCalledWith(cfg, 'gravar_progresso', expect.anything())
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

// ---------------------------------------------------------------------------
// PH-90 — quantas LINHAS sobem, nao so quais tabelas
// ---------------------------------------------------------------------------
// Os testes acima trancam "a tabela certa foi gravada". Isso deixava passar o
// custo real: a tabela certa era gravada INTEIRA. Um abate reescrevia as 104
// linhas da Pokedex do jogador, uma pocao reescrevia o inventario todo. Medido
// em producao antes do fix: 484.746 escritas em `player_pokedex` contra 13.045
// em `players`, 37x mais que a tabela principal do jogador.
//
// Estes casos medem o tamanho do lote enviado ao PostgREST, que e o numero que
// aparece na fatura.
describe('gravarEstado() — grava so as linhas que mudaram (PH-90)', () => {
  /** As linhas efetivamente enviadas num `inserir` naquela tabela. */
  function linhasEnviadas(tabela: string): Record<string, unknown>[] {
    const chamadas = (db.inserir as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const chamada = chamadas.find((c) => c[1] === tabela)
    return (chamada?.[2] ?? []) as Record<string, unknown>[]
  }

  function estadoComDexGrande(): GameStateData {
    const estado = defaultGameStateData()
    estado.items = { potion: 3, poke_ball: 10, revive: 2, antidote: 7 }
    estado.pokedexKills = {}
    for (let i = 0; i < 40; i++) {
      estado.pokedexKills[`especie_${i}`] = { normal: i + 1, shiny: 0 }
    }
    return estado
  }

  it('um abate grava UMA linha, nao a Pokedex inteira', async () => {
    const estado = estadoComDexGrande()
    const baseline = baselineDe(estado)
    expect(baseline.pokedex.length).toBe(40) // o baseline e grande de proposito
    estado.pokedexKills.especie_7 = { normal: 99, shiny: 0 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const enviadas = linhasEnviadas('player_pokedex')
    expect(enviadas).toHaveLength(1)
    expect(enviadas[0]).toMatchObject({ species_id: 'especie_7' })
  })

  it('um item consumido grava UMA linha, nao o inventario inteiro', async () => {
    const estado = estadoComDexGrande()
    const baseline = baselineDe(estado)
    estado.items = { ...estado.items, potion: 2 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const enviadas = linhasEnviadas('player_items')
    expect(enviadas).toHaveLength(1)
    expect(enviadas[0]).toMatchObject({ item_id: 'potion', quantity: 2 })
  })

  it('duas mudancas na mesma tabela sobem juntas, e so elas', async () => {
    const estado = estadoComDexGrande()
    const baseline = baselineDe(estado)
    estado.items = { ...estado.items, potion: 1, revive: 1 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const ids = linhasEnviadas('player_items').map((l) => l.item_id).sort()
    expect(ids).toEqual(['potion', 'revive'])
  })

  it('item NOVO (sem par no baseline) e gravado', async () => {
    // Sem isto o ganho viraria perda de progresso: linha sem par tem que
    // contar como mudanca, nao como "igual porque nao achei".
    const estado = estadoComDexGrande()
    const baseline = baselineDe(estado)
    estado.items = { ...estado.items, master_ball: 1 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    const ids = linhasEnviadas('player_items').map((l) => l.item_id)
    expect(ids).toEqual(['master_ball'])
  })

  it('sem baseline, sobe a tabela inteira — o fallback continua', async () => {
    const estado = estadoComDexGrande()

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at)

    expect(linhasEnviadas('player_pokedex')).toHaveLength(40)
    expect(linhasEnviadas('player_items')).toHaveLength(4)
  })

  it('mudanca na Pokedex nao arrasta o inventario junto', async () => {
    const estado = estadoComDexGrande()
    const baseline = baselineDe(estado)
    estado.pokedexKills.especie_3 = { normal: 50, shiny: 1 }

    await gravarEstado(cfg, USER, estado, new Set(), tabelaPlayers.updated_at, baseline)

    expect(linhasEnviadas('player_pokedex')).toHaveLength(1)
    expect(linhasEnviadas('player_items')).toHaveLength(0)
  })
})
