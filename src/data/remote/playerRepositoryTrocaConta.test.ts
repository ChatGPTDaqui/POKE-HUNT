// idsNoBanco/updatedAtEsperado eram singleton de MODULO — login/logout sao
// navegacao SPA, sem reload, entao o modulo sobrevive a troca de conta na
// mesma aba. Cenario real (PH-19): jogador A remove um POKE e faz logout com
// esse save ainda pendente; o login de B ja roda antes do save de A
// resolver; quando o save de A termina, sua ultima linha sobrescrevia o
// estado global de volta pros dados de A — o proximo save de B comparava
// contra ids/CAS errados, deixando o POKE que B removeu de verdade "vivo" no
// banco (ele reaparece numa leitura futura).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defaultGameStateData } from '@/stores/gameStateStore'

interface LinhaPlayer { user_id: string; updated_at: string }

let playersPorUsuario: Record<string, LinhaPlayer>
let pokemonPorUsuario: Record<string, { id: string }[]>
let chamadasDelete: { userId: string; ids: string[] }[]
// Trava o resolve do UPDATE de `players` pro user preso, ate `liberar()` ser
// chamado — e o que permite interlear "save de A ainda em voo" com "login de
// B ja rodou" na ordem exata do cenario real.
let presoAte: Record<string, { promise: Promise<void>; liberar: () => void }>

function criarTravaPara(userId: string) {
  let liberar!: () => void
  const promise = new Promise<void>((resolve) => { liberar = resolve })
  presoAte[userId] = { promise, liberar }
}

function builderGenerico() {
  const builder = {
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
    eq: () => builder,
    // PH-182: o boot passou a ordenar a equipe por `team_slot`.
    order: () => builder,
    in: () => Promise.resolve({ error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
  }
  return builder
}

function builderPlayers() {
  let userId = ''
  let patch: Record<string, unknown> | null = null
  let filtroUpdatedAt: string | null = null
  const builder = {
    select: () => builder,
    update: (p: Record<string, unknown>) => {
      patch = p
      return builder
    },
    eq: (campo: string, valor: string) => {
      if (campo === 'user_id') userId = valor
      if (campo === 'updated_at') filtroUpdatedAt = valor
      return builder
    },
    maybeSingle: () => Promise.resolve({ data: { ...playersPorUsuario[userId] }, error: null }),
    then: async (resolve: (v: { data: Array<{ updated_at: string }>; error: null }) => void) => {
      if (presoAte[userId]) await presoAte[userId].promise
      const linha = playersPorUsuario[userId]
      if (filtroUpdatedAt != null && filtroUpdatedAt !== linha.updated_at) {
        resolve({ data: [], error: null })
        return
      }
      Object.assign(linha, patch)
      linha.updated_at = new Date(new Date(linha.updated_at).getTime() + 1).toISOString()
      resolve({ data: [{ updated_at: linha.updated_at }], error: null })
    },
  }
  return builder
}

function builderPokemon() {
  let userId = ''
  let acaoDelete = false
  const builder = {
    select: () => builder,
    delete: () => {
      acaoDelete = true
      return builder
    },
    eq: (campo: string, valor: string) => {
      if (campo === 'user_id') userId = valor
      return builder
    },
    // PH-182: o boot passou a ordenar a equipe por `team_slot`.
    order: () => builder,
    in: (_campo: string, ids: string[]) => {
      chamadasDelete.push({ userId, ids })
      return Promise.resolve({ error: null })
    },
    upsert: () => Promise.resolve({ error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
      if (acaoDelete) { resolve({ data: [], error: null }); return }
      resolve({ data: pokemonPorUsuario[userId] ?? [], error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      if (tabela === 'players') return builderPlayers()
      if (tabela === 'pokemon_instances') return builderPokemon()
      return builderGenerico()
    }),
  },
}))

beforeEach(() => {
  playersPorUsuario = {
    'usuario-a': { user_id: 'usuario-a', updated_at: '2026-01-01T00:00:00.000Z' },
    'usuario-b': { user_id: 'usuario-b', updated_at: '2026-01-01T00:00:00.000Z' },
  }
  pokemonPorUsuario = {
    'usuario-a': [{ id: 'poke-a1' }],
    'usuario-b': [{ id: 'poke-b1' }],
  }
  chamadasDelete = []
  presoAte = {}
  vi.resetModules()
})

describe('troca de conta na mesma aba nao corrompe o diff de exclusao (PH-19)', () => {
  it('save pendente de A resolvendo apos login de B nao sobrescreve ids/CAS de B', async () => {
    const repo = await import('./playerRepository')

    // 1. A carrega e comeca um save (fica preso no UPDATE de `players`).
    await repo.loadPlayerState('usuario-a', defaultGameStateData())
    criarTravaPara('usuario-a')
    const saveDeAPendente = repo.savePlayerState('usuario-a', defaultGameStateData())

    // 2. Antes do save de A terminar, B faz login na mesma aba (SPA, sem
    // reload) — ancora os ids/CAS de B.
    await repo.loadPlayerState('usuario-b', defaultGameStateData())

    // 3. So agora o save de A (que estava em voo desde o passo 1) termina.
    presoAte['usuario-a'].liberar()
    await saveDeAPendente

    // 4. B remove o proprio POKE de verdade. Sem o fix, o diff usaria os ids
    // de A (sobrescritos por A no passo 3) e o CAS token de A — B levaria
    // ConflitoDeEscrita falso ou apagaria o POKE errado (ou nenhum).
    await repo.savePlayerState('usuario-b', defaultGameStateData())

    const deleteDeB = chamadasDelete.find((c) => c.userId === 'usuario-b')
    expect(deleteDeB?.ids).toEqual(['poke-b1'])
    expect(chamadasDelete.some((c) => c.userId === 'usuario-a' && c.ids.includes('poke-b1'))).toBe(false)
  })
})
