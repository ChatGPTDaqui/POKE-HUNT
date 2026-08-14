import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData } from '@/stores/gameStateStore'

// Fake minimo da linha de `players`: so o suficiente pra exercitar o CAS
// otimista de savePlayerState() sem Supabase real (PH-18). As outras tabelas
// que o modulo toca (pokemon_instances/player_items/player_pokedex/
// player_auto_catch_rules) nao sao o foco aqui -- viram builder generico que
// sempre resolve vazio, sem erro.
let tabelaPlayers: { user_id: string; updated_at: string; [k: string]: unknown }
// Simula RLS filtrando o UPDATE pra zero linhas por sessao invalida/revogada
// (PH-17) — sem `error` nenhum do Postgrest, exatamente o sucesso silencioso
// disfarcado que o bug descreve.
let bloqueadoPorRLS = false

function builderGenerico() {
  const builder = {
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
    eq: () => builder,
    in: () => Promise.resolve({ error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
  }
  return builder
}

// Uma unica linha em `tabelaPlayers`, entao qualquer `.eq('user_id', ...)`
// bate — só o `.eq('updated_at', ...)` do save (quando presente) precisa
// realmente filtrar, pra simular o CAS perdendo a corrida.
function builderPlayers() {
  let patch: Record<string, unknown> | null = null
  const filtrosUpdatedAt: string[] = []
  const builder = {
    select: () => builder,
    update: (p: Record<string, unknown>) => {
      patch = p
      return builder
    },
    eq: (campo: string, valor: string) => {
      if (campo === 'updated_at') filtrosUpdatedAt.push(valor)
      return builder
    },
    maybeSingle: () => Promise.resolve({ data: { ...tabelaPlayers }, error: null }),
    then: (resolve: (v: { data: Array<{ updated_at: string }>; error: null }) => void) => {
      if (bloqueadoPorRLS) {
        resolve({ data: [], error: null })
        return
      }
      const bateUpdatedAt = filtrosUpdatedAt.every((valor) => valor === tabelaPlayers.updated_at)
      if (!bateUpdatedAt) {
        resolve({ data: [], error: null })
        return
      }
      Object.assign(tabelaPlayers, patch)
      // Simula o trigger `players_set_updated_at`.
      tabelaPlayers.updated_at = new Date(new Date(tabelaPlayers.updated_at).getTime() + 1).toISOString()
      resolve({ data: [{ updated_at: tabelaPlayers.updated_at }], error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((tabela: string) => (tabela === 'players' ? builderPlayers() : builderGenerico())),
  },
}))

beforeEach(() => {
  tabelaPlayers = { user_id: 'jogador-1', updated_at: '2026-01-01T00:00:00.000Z' }
  bloqueadoPorRLS = false
  vi.resetModules()
})

describe('savePlayerState() — CAS otimista na linha de players (PH-18)', () => {
  it('duas abas do mesmo jogador: quem grava por ultimo com snapshot velho leva ConflitoDeEscrita', async () => {
    // Duas instancias de modulo = duas "abas": cada uma tem seu proprio
    // `updatedAtEsperado` privado, ambas carregando o MESMO estado inicial.
    const abaA = await import('./playerRepository')
    vi.resetModules()
    const abaB = await import('./playerRepository')

    await abaA.loadPlayerState('jogador-1', defaultGameStateData())
    await abaB.loadPlayerState('jogador-1', defaultGameStateData())

    // Aba A grava primeiro — sucesso, avanca updated_at no "banco".
    await abaA.savePlayerState('jogador-1', defaultGameStateData())

    // Aba B ainda acredita no updated_at de quando carregou (antes de A
    // gravar) — exatamente a corrida real da PH-18.
    await expect(abaB.savePlayerState('jogador-1', defaultGameStateData())).rejects.toThrow(abaB.ConflitoDeEscrita)
  })

  it('gravacao sequencial na mesma aba (cada save le a versao fresca) funciona normalmente', async () => {
    const aba = await import('./playerRepository')
    await aba.loadPlayerState('jogador-1', defaultGameStateData())

    await aba.savePlayerState('jogador-1', defaultGameStateData())
    await expect(aba.savePlayerState('jogador-1', defaultGameStateData())).resolves.toBeUndefined()
  })
})

describe('savePlayerState() — 0 linhas nunca e sucesso silencioso (PH-17)', () => {
  it('sessao invalida/revogada (RLS bloqueia sem `error`): joga erro explicito, mesmo sem CAS em voo', async () => {
    const aba = await import('./playerRepository')
    // Nunca chamou loadPlayerState nesta aba -- updatedAtEsperado comeca
    // null, entao sem o fix o retorno vazio do RLS passaria batido.
    bloqueadoPorRLS = true
    await expect(aba.savePlayerState('jogador-1', defaultGameStateData())).rejects.toThrow(/sessao pode ter expirado/)
  })
})
