// PH-182 — o boot passou a ler SO a equipe, e isso muda quem pode ser apagado.
//
// Enquanto o boot lia `pokemon_instances` inteira, "o que o banco tem" e "o que
// o estado local tem" eram a mesma coisa por construcao, e `savePlayerState`
// podia diferenciar contra o estado sem pensar. Com o boot lendo so a equipe,
// `state.bagPokes` nasce VAZIO — e diferenciar 922 ids conhecidos contra ele
// daria `removidos = 920` e um DELETE que apaga a colecao do jogador.
//
// A regra que estes casos trancam, nos dois sentidos:
//
//   um id so entra no diff de exclusao se o estado local for AUTORITATIVO
//   sobre o conjunto onde ele vive.
//
// Equipe: sempre (o boot le as 6 linhas). Reserva: so depois da leitura
// paginada, e ate ela ser esquecida.
//
// O caminho perigoso NAO e hipotetico: `aplicarEstadoDoServidor` zera
// `bagPokes` num flush parcial quando a mochila nao esta carregada, e um flush
// desses chega a cada 30 segundos.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { defaultGameStateData, type GameStateData } from '@/stores/gameStateDefaults'

const rng = createRng(11)
const poke = (uid: string) => ({ ...createPokeInstance(rng, 'bulbasaur', 5), uid })

/** Linhas de `pokemon_instances` que o banco fake devolve, por filtro aplicado. */
let linhasDoBanco: Record<string, unknown>[]
let deletados: string[][]
/** Filtros que a consulta de boot mandou — e como o teste vê o `location=team`. */
let filtrosDaLeitura: [string, unknown][]

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
    maybeSingle: () => Promise.resolve({
      data: { user_id: 'u1', updated_at: '2026-01-01T00:00:00.000Z', gold: 0, diamonds: 0, unlocked_maps: [], unlocked_continents: [], active_team_index: 0 },
      error: null,
    }),
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
    upsert: () => Promise.resolve({ error: null }),
    delete: () => { apagando = true; return builder },
    eq: (campo: string, valor: unknown) => {
      if (!apagando) filtrosDaLeitura.push([campo, valor])
      return builder
    },
    order: () => builder,
    in: (_campo: string, ids: string[]) => {
      deletados.push(ids)
      return Promise.resolve({ error: null })
    },
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: linhasDoBanco, error: null }),
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

const EQUIPE = [poke('time-1'), poke('time-2')]
/** A reserva do jogador mais pesado da base, encolhida pro teste rodar rapido. */
const RESERVA = Array.from({ length: 40 }, (_, i) => poke(`reserva-${i}`))

function linhaDe(p: { uid: string }, location: 'team' | 'bag', slot: number | null) {
  return { id: p.uid, location, team_slot: slot }
}

function estado(over: Partial<GameStateData> = {}): GameStateData {
  return { ...defaultGameStateData(), team: EQUIPE, bagPokes: [], ...over }
}

beforeEach(() => {
  linhasDoBanco = EQUIPE.map((p, i) => linhaDe(p, 'team', i))
  deletados = []
  filtrosDaLeitura = []
  vi.resetModules()
})

describe('o boot le so a equipe (PH-182)', () => {
  it('a consulta de POKE filtra por location=team', async () => {
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    expect(filtrosDaLeitura).toContainEqual(['location', 'team'])
  })
})

describe('o diff de exclusao com a Mochila NUNCA aberta (PH-182, criterio 3)', () => {
  it('salvar nao apaga POKE nenhum', async () => {
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    // A reserva existe no banco e NAO existe no estado — e exatamente esse
    // descompasso que apagava tudo.
    await repo.savePlayerState('u1', estado())
    expect(deletados).toEqual([])
  })
})

describe('o diff de exclusao DEPOIS de abrir e fechar a Mochila (PH-182, criterio 4)', () => {
  it('a reserva volta a ser esquecida, e o save seguinte nao apaga nada', async () => {
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())

    // 1. Mochila abre: a leitura paginada registra os 40 ids.
    repo.acrescentarIdsDaReserva('u1', RESERVA.map((p) => p.uid))
    await repo.savePlayerState('u1', estado({ bagPokes: RESERVA }))
    expect(deletados).toEqual([])

    // 2. Mochila e invalidada e um flush parcial zera `bagPokes` — o caminho
    //    real, que roda a cada 30s. Sem `esquecerIdsDaReserva`, o save abaixo
    //    veria 40 ids conhecidos contra uma mochila vazia.
    repo.esquecerIdsDaReserva()
    await repo.savePlayerState('u1', estado({ bagPokes: [] }))
    expect(deletados).toEqual([])
  })

  it('SEM esquecer a reserva, a escrita e RECUSADA em vez de apagar em massa', async () => {
    // A rede de seguranca. Ela existe pro dia em que alguem acrescentar um
    // quarto caminho que esvazia `bagPokes` e esquecer de avisar o repositorio:
    // o resultado tem que ser erro visivel, nao um DELETE silencioso.
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    repo.acrescentarIdsDaReserva('u1', RESERVA.map((p) => p.uid))

    await expect(repo.savePlayerState('u1', estado({ bagPokes: [] })))
      .rejects.toThrow(/Save abortado/)
    expect(deletados).toEqual([])
  })
})

describe('a exclusao legitima continua funcionando (PH-182)', () => {
  it('POKE que saiu da EQUIPE de verdade e apagado', async () => {
    // Guarda anti-vacuo dos casos acima: se o diff tivesse sido simplesmente
    // desligado, todos eles passariam e este seria o unico a reprovar.
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    await repo.savePlayerState('u1', estado({ team: [EQUIPE[0]] }))
    expect(deletados).toEqual([['time-2']])
  })

  it('POKE que saiu da RESERVA com a Mochila aberta tambem e apagado', async () => {
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    repo.acrescentarIdsDaReserva('u1', ['reserva-0', 'reserva-1'])
    await repo.savePlayerState('u1', estado({ bagPokes: [RESERVA[0]] }))
    expect(deletados).toEqual([['reserva-1']])
  })

  it('um save NAO promove a reserva de "nao lida" pra "lida"', async () => {
    // Save nao LE nada. Se ele pudesse promover o dominio, bastaria um save com
    // a mochila vazia pra que o SEGUINTE se achasse autoritativo sobre ela.
    const repo = await import('./playerRepository')
    await repo.loadPlayerState('u1', defaultGameStateData())
    await repo.savePlayerState('u1', estado({ bagPokes: RESERVA }))
    deletados = []
    await repo.savePlayerState('u1', estado({ bagPokes: [] }))
    expect(deletados).toEqual([])
  })
})
