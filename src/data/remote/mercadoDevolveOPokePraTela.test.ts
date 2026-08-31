// PH-324 — o POKE que volta do Mercado (ou que voce acabou de comprar) tem que
// aparecer na Mochila sem recarregar.
//
// Achado ao vivo em 31/08: cancelei um anuncio, a tela disse com todas as
// letras "Anuncio cancelado — o POKE voltou pra sua mochila", o banco concordou
// (`location` de volta em `bag`)... e a Mochila na tela nao mostrava o POKE. Ele
// so reaparecia fechando e reabrindo a tela.
//
// TRES CAMINHOS TERMINAVAM ASSIM, e nenhum reconciliava a lista local:
//
//   cancelarAnuncio   POKE volta pra `bag`      -> refetch SEM o pokeUid
//   comprarAnuncio    POKE muda de dono         -> so refetch da carteira
//   responderOferta   POKE sai pro comprador    -> refetch SEM o pokeUid
//
// O de comprar e o pior: o jogador PAGOU e nao ve o que comprou.
//
// `refetchAposAnuncio(pokeUid)` ja fazia a reconciliacao certa — o que faltava
// era o ID, porque quem chama so tem o id do ANUNCIO em maos. Ler o `poke_uid`
// antes da RPC e o mesmo que `cancelarOrdem` ja fazia pro `item_id`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultGameStateData } from '@/stores/gameStateDefaults'

const POKE_UID = 'poke-do-anuncio'
const ANUNCIO_ID = 'anuncio-1'

/** O que a releitura de `pokemon_instances` devolve depois da RPC. */
let linhaDoPoke: Record<string, unknown> | null
let chamadasDeRpc: string[]
let selects: string[]

function builderListings() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: { poke_uid: POKE_UID }, error: null }),
  }
  return builder
}

function builderOffers() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: { listing_id: ANUNCIO_ID }, error: null }),
  }
  return builder
}

function builderPokemon() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: linhaDoPoke, error: null }),
  }
  return builder
}

function builderPlayers() {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve({ data: { gold: 10, diamonds: 0 }, error: null }),
  }
  return builder
}

let mochilaEstaCarregada = true

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      selects.push(tabela)
      if (tabela === 'market_listings') return builderListings()
      if (tabela === 'market_offers') return builderOffers()
      if (tabela === 'pokemon_instances') return builderPokemon()
      return builderPlayers()
    }),
    rpc: vi.fn((nome: string) => {
      chamadasDeRpc.push(nome)
      return Promise.resolve({ data: { ok: true, mensagem: 'feito' }, error: null })
    }),
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
  },
}))

vi.mock('@/stores/mochilaStore', () => ({
  mochilaCarregada: () => mochilaEstaCarregada,
  useMochilaStore: { getState: () => ({ invalidar: () => {} }) },
}))

beforeEach(() => {
  chamadasDeRpc = []
  selects = []
  mochilaEstaCarregada = true
  linhaDoPoke = { id: POKE_UID, species_id: 'bulbasaur', location: 'bag', team_slot: null, level: 5 }
  vi.resetModules()
})

async function comMochilaVazia() {
  const mercado = await import('./mercadoRpc')
  const { useGameStateStore } = await import('@/stores/gameStateStore')
  useGameStateStore.setState({ ...defaultGameStateData(), team: [], bagPokes: [] })
  return { mercado, useGameStateStore }
}

describe('cancelar anuncio devolve o POKE pra tela (PH-324)', () => {
  it('o POKE aparece na Mochila local', async () => {
    // A RPC responde "o POKE voltou pra sua mochila". A tela nao pode
    // contradizer a propria mensagem que ela acabou de mostrar.
    const { mercado, useGameStateStore } = await comMochilaVazia()
    await mercado.cancelarAnuncio(ANUNCIO_ID)
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual([POKE_UID])
  })

  it('o poke_uid e lido ANTES da RPC', async () => {
    // Depois, `comprar_anuncio` ja marcou o anuncio como vendido e a linha pode
    // deixar de ser legivel — a policy publica so cobre `status = 'ativo'`.
    const { mercado } = await comMochilaVazia()
    await mercado.cancelarAnuncio(ANUNCIO_ID)
    expect(selects.indexOf('market_listings')).toBeLessThan(selects.indexOf('pokemon_instances'))
    expect(chamadasDeRpc).toEqual(['cancelar_anuncio'])
  })
})

describe('comprar POKE poe ele na Mochila de quem pagou (PH-324)', () => {
  it('o POKE comprado aparece', async () => {
    const { mercado, useGameStateStore } = await comMochilaVazia()
    await mercado.comprarAnuncio(ANUNCIO_ID)
    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual([POKE_UID])
  })
})

describe('aceitar oferta tira o POKE vendido da tela de quem vendeu (PH-324)', () => {
  it('a linha que volta fora da mochila REMOVE o POKE da lista', async () => {
    // Guarda anti-vacuo dos casos acima: se o codigo simplesmente inserisse o
    // POKE sempre, este aqui reprovaria. Quem decide e a `location` da linha.
    linhaDoPoke = { id: POKE_UID, species_id: 'bulbasaur', location: 'market', team_slot: null, level: 5 }
    const { mercado, useGameStateStore } = await comMochilaVazia()
    const semente = await import('@/data/pokes')
    const { createRng } = await import('@/core/rng')
    useGameStateStore.setState({
      bagPokes: [{ ...semente.createPokeInstance(createRng(1), 'bulbasaur', 5), uid: POKE_UID }],
    })
    await mercado.responderOferta('oferta-1', true)
    expect(useGameStateStore.getState().bagPokes).toEqual([])
  })

  it('a oferta chega no POKE pelo anuncio', async () => {
    const { mercado } = await comMochilaVazia()
    await mercado.responderOferta('oferta-1', true)
    expect(selects.indexOf('market_offers')).toBeLessThan(selects.indexOf('market_listings'))
  })
})

describe('sem a Mochila carregada, nada e inventado (PH-324)', () => {
  it('a lista local continua vazia', async () => {
    // Inserir um POKE numa lista que nasceu vazia faria a tela mostrar UM POKE
    // numa conta de milhares. E o mesmo corte que `refetchAposAnuncio` ja fazia.
    mochilaEstaCarregada = false
    const { mercado, useGameStateStore } = await comMochilaVazia()
    await mercado.cancelarAnuncio(ANUNCIO_ID)
    expect(useGameStateStore.getState().bagPokes).toEqual([])
  })
})
