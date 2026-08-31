// PH-311 — anunciar um POKE no Mercado com a Mochila aberta fazia o proximo
// save APAGAR o POKE do banco.
//
// Tres pecas certas isoladamente e erradas juntas:
//
//  1. abrir a Mochila registra os ids da reserva no dominio de exclusao
//     (`acrescentarIdsDaReserva`, mochilaRemota.ts — PH-182);
//  2. `refetchAposAnuncio` tira o POKE de `bagPokes` porque a linha voltou com
//     `location = 'market'` — correto, e sem avisar ninguem;
//  3. `savePlayerState` calcula `removidos = dominio - vivos`, e o id anunciado
//     esta no dominio e fora dos vivos. Vira DELETE.
//
// O teto de seguranca (12 por save) nao pega: anuncia-se um POKE por vez. E
// `market_listings_poke_uid_fkey` e `on delete set null`, entao o anuncio
// SOBREVIVE apontando pra nada — o POKE some pra sempre e a vitrine continua
// oferecendo ele a quem quiser pagar.
//
// `descartarIdsConhecidos` existe exatamente pra este caso e ja era usado na
// venda por RPC (`acoesRpc.ts`). O Mercado e que nunca recebeu a chamada.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { defaultGameStateData, type GameStateData } from '@/stores/gameStateDefaults'

const rng = createRng(3)
const poke = (uid: string) => ({ ...createPokeInstance(rng, 'bulbasaur', 5), uid })

let deletados: string[][]
/** O que a releitura do POKE anunciado devolve — 'market' e o caso real. */
let linhaDoPoke: Record<string, unknown> | null

function builderGenerico() {
  const builder = {
    select: () => builder,
    update: () => builder,
    delete: () => builder,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
    eq: () => builder,
    order: () => builder,
    in: () => Promise.resolve({ error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
  }
  return builder
}

function builderPlayers() {
  const builder = {
    select: () => builder,
    update: () => builder,
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({
      data: {
        user_id: 'u1', updated_at: '2026-01-01T00:00:00.000Z', gold: 100, diamonds: 0,
        unlocked_maps: [], unlocked_continents: [], active_team_index: 0,
        trainer_level: 1, trainer_exp: 0, trainer_name: 'T',
      },
      error: null,
    }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [{ updated_at: '2026-01-01T00:00:01.000Z' }], error: null }),
  }
  return builder
}

function builderPokemon() {
  let apagando = false
  const builder = {
    select: () => builder,
    upsert: () => Promise.resolve({ error: null }),
    delete: () => { apagando = true; return builder },
    eq: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: linhaDoPoke, error: null }),
    in: (_campo: string, ids: string[]) => {
      if (apagando) deletados.push(ids)
      return Promise.resolve({ error: null })
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
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
    rpc: vi.fn(() => Promise.resolve({ data: { ok: true, mensagem: 'anunciado' }, error: null })),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
  },
}))

// A Mochila CARREGADA e a precondicao do bug: e ela que poe os ids da reserva
// no dominio de exclusao. Com a Mochila fechada o defeito nao aparece, e foi
// por isso que ele passou tanto tempo sem ser visto.
vi.mock('@/stores/mochilaStore', () => ({
  mochilaCarregada: () => true,
  useMochilaStore: { getState: () => ({ invalidar: () => {} }) },
}))

const ANUNCIADO = poke('poke-anunciado')
const OUTRO = poke('poke-que-fica')

function estado(over: Partial<GameStateData> = {}): GameStateData {
  return { ...defaultGameStateData(), team: [], bagPokes: [ANUNCIADO, OUTRO], ...over }
}

beforeEach(() => {
  deletados = []
  // O que o banco devolve depois do anuncio: a linha existe e saiu da mochila.
  linhaDoPoke = { id: ANUNCIADO.uid, species_id: 'bulbasaur', location: 'market', team_slot: null, level: 5 }
  vi.resetModules()
})

async function comMochilaAberta() {
  const repo = await import('./playerRepository')
  const mercado = await import('./mercadoRpc')
  const { useGameStateStore } = await import('@/stores/gameStateStore')
  useGameStateStore.setState(estado())
  repo.definirIdsConhecidos('u1', [])
  // O passo que arma a armadilha: a leitura paginada da Mochila.
  repo.acrescentarIdsDaReserva('u1', [ANUNCIADO.uid, OUTRO.uid])
  return { repo, mercado, useGameStateStore }
}

describe('anunciar no Mercado nao apaga o POKE (PH-311)', () => {
  it('o save seguinte NAO manda DELETE do POKE anunciado', async () => {
    const { repo, mercado } = await comMochilaAberta()
    await mercado.anunciarPoke({ pokeUid: ANUNCIADO.uid, price: 500, currency: 'gold' })
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    expect(deletados).toEqual([])
  })

  it('criar leilao segue o mesmo caminho e tambem nao apaga', async () => {
    // Mesma RPC de movimento (`location = 'market'`), mesmo refetch. Corrigir so
    // `anunciar_poke` deixaria o leilao com o bug inteiro.
    const { repo, mercado } = await comMochilaAberta()
    await mercado.criarLeilao({
      pokeUid: ANUNCIADO.uid, currency: 'gold', horas: 6, lanceMinimo: 100, incrementoMinimo: 10,
    })
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    expect(deletados).toEqual([])
  })

  it('o POKE anunciado sai da mochila local', async () => {
    // Continua valendo o que a PR do Mercado ja fazia: a tela nao pode mostrar
    // na mochila um POKE que esta na vitrine.
    const { mercado, useGameStateStore } = await comMochilaAberta()
    await mercado.anunciarPoke({ pokeUid: ANUNCIADO.uid, price: 500, currency: 'gold' })
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual([OUTRO.uid])
  })

  it('GUARDA ANTI-VACUO: sem passar pelo Mercado, o mesmo save APAGA', async () => {
    // Sem este caso, desligar o diff de exclusao faria os tres de cima passarem
    // sem provar nada. Ele reproduz o bug original em uma linha.
    const { repo } = await comMochilaAberta()
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    expect(deletados).toEqual([[ANUNCIADO.uid]])
  })

  it('POKE que o jogador removeu de verdade continua sendo apagado', async () => {
    // A correcao tira do dominio SO o id que a RPC moveu. Se ela tirasse
    // qualquer coisa a mais, POKE liberado a mao nunca mais sairia do banco e
    // ressuscitaria na proxima leitura da Mochila.
    const { repo, mercado } = await comMochilaAberta()
    await mercado.anunciarPoke({ pokeUid: ANUNCIADO.uid, price: 500, currency: 'gold' })
    await repo.savePlayerState('u1', estado({ bagPokes: [] }))
    expect(deletados).toEqual([[OUTRO.uid]])
  })
})
