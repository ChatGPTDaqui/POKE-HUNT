// PH-310 (PH-120, fatia 2) — por na mesa reserva no SERVIDOR, e o cliente tem
// que acompanhar. Se ele nao acompanhar, o proximo flush desfaz a reserva.
//
// `savePlayerState` escreve `pokemon_instances` e `player_items` a partir do
// estado LOCAL. Isso cria dois caminhos que anulam a reserva, e os dois sao
// silenciosos:
//
//  1. POKE deixado em `bagPokes` volta pra `location = 'bag'` no upsert do
//     proximo save — reservado na mesa e disponivel na mochila ao mesmo tempo.
//     Dai ele pode ser vendido enquanto o outro lado ja confirmou.
//  2. POKE tirado de `bagPokes` SEM sair do dominio conhecido (PH-182) entra no
//     diff de exclusao, e o save seguinte APAGA a linha — o POKE deixa de
//     existir no meio da troca.
//
// Item tem a mesma armadilha pela terceira porta: `gameStateToItemRows` grava a
// quantidade local por cima da do banco. Debitar so no servidor faz o proximo
// save devolver o que foi pra mesa, e o jogador fica com o item E com a oferta.
//
// Estes casos sao a prova de que as duas metades andam juntas.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { defaultGameStateData, type GameStateData } from '@/stores/gameStateDefaults'

const rng = createRng(7)
const poke = (uid: string) => ({ ...createPokeInstance(rng, 'bulbasaur', 5), uid })

let deletados: string[][]
let upsertados: Record<string, unknown>[][]
let itensUpsertados: Record<string, unknown>[][]
/** A linha que a releitura de um POKE devolve (usada por `tirarPokeDaMesa`). */
let linhaDoPoke: Record<string, unknown> | null
let chamadasDeRpc: { nome: string; params: Record<string, unknown> | undefined }[]

const SESSAO = {
  id: 's1',
  anfitriao_id: 'u1',
  convidado_id: 'u2',
  estado: 'aberta',
  criada_em: '2026-08-30T00:00:00.000Z',
  expira_em: '2026-08-30T00:15:00.000Z',
  encerrada_por: null,
  encerrada_em: null,
  versao: 1,
}

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
        user_id: 'u1', updated_at: '2026-01-01T00:00:00.000Z', gold: 0, diamonds: 0,
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
    upsert: (linhas: Record<string, unknown>[]) => {
      upsertados.push(linhas)
      return Promise.resolve({ error: null })
    },
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

function builderItens() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    upsert: (linhas: Record<string, unknown>[]) => {
      itensUpsertados.push(linhas)
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
      if (tabela === 'player_items') return builderItens()
      return builderGenerico()
    }),
    rpc: vi.fn((nome: string, params?: Record<string, unknown>) => {
      chamadasDeRpc.push({ nome, params })
      return Promise.resolve({ data: SESSAO, error: null })
    }),
  },
}))

// A Mochila carregada e o caso PERIGOSO: e nele que os ids da reserva estao no
// dominio conhecido, e portanto e nele que o save pode apagar.
vi.mock('@/stores/mochilaStore', () => ({
  mochilaCarregada: () => true,
  useMochilaStore: { getState: () => ({ invalidar: () => {} }) },
}))

const NA_MESA = poke('poke-na-mesa')
const OUTRO = poke('poke-que-fica')

function estado(over: Partial<GameStateData> = {}): GameStateData {
  return {
    ...defaultGameStateData(),
    team: [],
    bagPokes: [NA_MESA, OUTRO],
    items: { potion: 10 },
    ...over,
  }
}

beforeEach(() => {
  deletados = []
  upsertados = []
  itensUpsertados = []
  chamadasDeRpc = []
  linhaDoPoke = null
  vi.resetModules()
})

async function modulos() {
  const repo = await import('./playerRepository')
  const troca = await import('./trocaRpc')
  const { useGameStateStore } = await import('@/stores/gameStateStore')
  useGameStateStore.setState(estado())
  repo.definirIdsConhecidos('u1', [])
  repo.acrescentarIdsDaReserva('u1', [NA_MESA.uid, OUTRO.uid])
  return { repo, troca, useGameStateStore }
}

describe('POKE na mesa sai do estado local (PH-310)', () => {
  it('por na mesa tira o POKE da mochila local', async () => {
    // Sem isto o upsert do proximo save gravaria `location: 'bag'` por cima do
    // 'troca' que a RPC acabou de escrever.
    const { troca, useGameStateStore } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual([OUTRO.uid])
  })

  it('o save seguinte NAO apaga o POKE reservado', async () => {
    // O id saiu do estado, mas quem o moveu foi o servidor e a linha continua
    // existindo. Sem `descartarIdsConhecidos`, o diff de exclusao o leria como
    // "sumiu" e mandaria DELETE — o POKE deixaria de existir no meio da troca.
    const { repo, troca } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    expect(deletados).toEqual([])
  })

  it('o save seguinte NAO regrava o POKE reservado como mochila', async () => {
    const { repo, troca } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    const ids = upsertados.flat().map((l) => l.id)
    expect(ids).not.toContain(NA_MESA.uid)
  })

  it('GUARDA ANTI-VACUO: sem passar pela RPC, o mesmo save APAGA', async () => {
    // Se os casos acima passassem porque o diff de exclusao esta desligado, este
    // aqui seria o unico a reprovar.
    const { repo } = await modulos()
    await repo.savePlayerState('u1', estado({ bagPokes: [OUTRO] }))
    expect(deletados).toEqual([[NA_MESA.uid]])
  })
})

describe('POKE tirado da mesa volta pra mochila local (PH-310)', () => {
  it('a linha relida com location=bag volta pra lista', async () => {
    const { troca, useGameStateStore } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    linhaDoPoke = { id: NA_MESA.uid, species_id: 'bulbasaur', location: 'bag', team_slot: null, level: 5 }
    await troca.tirarPokeDaMesa('s1', NA_MESA.uid)
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toContain(NA_MESA.uid)
  })

  it('linha que ainda diz troca NAO volta pra lista', async () => {
    // Defensivo: se a releitura pegar o estado anterior (replica atrasada), a
    // tela nao pode mostrar na mochila um POKE que ainda esta reservado.
    const { troca, useGameStateStore } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    linhaDoPoke = { id: NA_MESA.uid, species_id: 'bulbasaur', location: 'troca', team_slot: null, level: 5 }
    await troca.tirarPokeDaMesa('s1', NA_MESA.uid)
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).not.toContain(NA_MESA.uid)
  })
})

describe('item na mesa e debitado do estado local (PH-310)', () => {
  it('por item na mesa desconta a quantidade local', async () => {
    const { troca, useGameStateStore } = await modulos()
    await troca.porItemNaMesa('s1', 'potion', 4)
    expect(useGameStateStore.getState().items.potion).toBe(6)
  })

  it('o save seguinte grava a quantidade JA debitada', async () => {
    // Este e o caso de duplicacao: sem o debito local, o upsert devolveria 10 e
    // o jogador ficaria com os 10 na mochila E com 4 na mesa.
    const { repo, troca, useGameStateStore } = await modulos()
    await troca.porItemNaMesa('s1', 'potion', 4)
    await repo.savePlayerState('u1', useGameStateStore.getState() as GameStateData)
    const linha = itensUpsertados.flat().find((l) => l.item_id === 'potion')
    expect(linha?.quantity).toBe(6)
  })

  it('tirar da mesa devolve a quantidade', async () => {
    const { troca, useGameStateStore } = await modulos()
    await troca.porItemNaMesa('s1', 'potion', 4)
    await troca.tirarItemDaMesa('s1', 'potion', 4)
    expect(useGameStateStore.getState().items.potion).toBe(10)
  })

  it('nunca desce abaixo de zero', async () => {
    // O servidor ja recusou o que nao havia; um numero negativo aqui viraria
    // `check (quantity >= 0)` estourado no proximo save, que e 502 na cara do
    // jogador em vez de erro tratado.
    const { troca, useGameStateStore } = await modulos()
    await troca.porItemNaMesa('s1', 'potion', 10)
    await troca.porItemNaMesa('s1', 'potion', 10)
    expect(useGameStateStore.getState().items.potion).toBe(0)
  })
})

describe('a RPC recebe o que a assinatura do banco espera (PH-310)', () => {
  it('os nomes de parametro batem com o SQL', async () => {
    // PostgREST casa RPC por NOME de parametro. Um `p_poke` no lugar de
    // `p_poke_id` nao e erro de tipo — e 404 em producao.
    const { troca } = await modulos()
    await troca.porPokeNaMesa('s1', NA_MESA.uid)
    await troca.porItemNaMesa('s1', 'potion', 2)
    expect(chamadasDeRpc[0]).toEqual({
      nome: 'por_poke_na_mesa',
      params: { p_sessao_id: 's1', p_poke_id: NA_MESA.uid },
    })
    expect(chamadasDeRpc[1]).toEqual({
      nome: 'por_item_na_mesa',
      params: { p_sessao_id: 's1', p_item_id: 'potion', p_quantidade: 2 },
    })
  })
})
