// @vitest-environment jsdom
// PH-565: ranqueado assincrono — "Atacar" pareia numa chamada so, resolve na
// Edge e entra na arena; nao ha fila nem polling.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAuthStore } from '@/stores/authStore'
import * as rpc from '@/data/remote/pvpRpc'
import { servidor } from '@/data/remote/servidor'
import { entrarNaArena } from '@/features/arena/arena'
import { arenaDaSessao } from './arenaDaSessao'
import { usePvpRanked } from './usePvpRanked'

vi.mock('@/data/remote/pvpRpc', () => ({
  meuRankPvp: vi.fn(),
  meusPresetsPvp: vi.fn(),
  historicoPvp: vi.fn(),
  atacarRanqueado: vi.fn(),
  assinarMeuPvp: vi.fn(() => () => {}),
}))
vi.mock('@/data/remote/servidor', () => ({ servidor: { resolverPvp: vi.fn() }, servidorAtivo: () => true }))
vi.mock('@/features/arena/arena', () => ({ entrarNaArena: vi.fn() }))
vi.mock('./arenaDaSessao', () => ({ arenaDaSessao: vi.fn() }))

const EU = 'eu'
const rank: rpc.RankPvp = { mmr: 1000, partidas: 0, pdl: 0, divisao: 'bronze_1', vitorias: 0, derrotas: 0, partidasHoje: 0, resetEm: '' }
const preset = (tipo: rpc.TipoPresetPvp, ativo: boolean): rpc.PresetPvp => ({ tipo, posicao: 1, nome: '', slots: [{ pokemonId: 'p1', golpes: [] }], ativo, atualizadoEm: '' })
const hist = (extra: Partial<rpc.HistoricoPvp>): rpc.HistoricoPvp => ({
  id: 'h', sessaoId: 's', anfitriaoId: 'x', convidadoId: 'y', vencedorId: null, encerradaEm: '', modo: 'ranqueado',
  pdlDeltaAnfitriao: null, pdlDeltaConvidado: null, ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rpc.assinarMeuPvp).mockReturnValue(() => {})
  useAuthStore.setState({ user: { id: EU } } as never)
  vi.mocked(rpc.meuRankPvp).mockResolvedValue(rank)
  vi.mocked(rpc.meusPresetsPvp).mockResolvedValue([preset('ataque', true), preset('defesa', true)])
  vi.mocked(rpc.historicoPvp).mockResolvedValue([
    hist({ id: 'h1', anfitriaoId: 'outro', convidadoId: EU, vencedorId: EU, pdlDeltaConvidado: 8 }),
    hist({ id: 'h2', anfitriaoId: EU, convidadoId: 'outro', vencedorId: 'outro', pdlDeltaAnfitriao: -17 }),
    hist({ id: 'h3', anfitriaoId: 'bot', convidadoId: EU, modo: 'amistoso' }),
  ])
})
afterEach(cleanup)

describe('usePvpRanked (assincrono)', () => {
  it('carrega rank, defesa ativa e so os ataques sofridos no ranqueado', async () => {
    const { result } = renderHook(() => usePvpRanked())
    await waitFor(() => expect(result.current.carregando).toBe(false))
    expect(result.current.rank).toEqual(rank)
    expect(result.current.defesa?.tipo).toBe('defesa')
    expect(result.current.defesasRecentes.map((h) => h.id)).toEqual(['h1'])
  })

  it('atacar: uma chamada, resolve no servidor e entra na arena', async () => {
    const sessao = { id: 's1', anfitriaoId: EU, convidadoId: 'outro', modo: 'ranqueado' } as rpc.SessaoPvp
    vi.mocked(rpc.atacarRanqueado).mockResolvedValue(sessao)
    vi.mocked(servidor.resolverPvp).mockResolvedValue({ vencedorId: EU, semente: 7 } as never)
    vi.mocked(arenaDaSessao).mockResolvedValue({ semente: 7 } as never)
    const { result } = renderHook(() => usePvpRanked())
    await waitFor(() => expect(result.current.carregando).toBe(false))
    await act(async () => { await result.current.atacar() })
    expect(rpc.atacarRanqueado).toHaveBeenCalledTimes(1)
    expect(servidor.resolverPvp).toHaveBeenCalledWith('s1')
    expect(arenaDaSessao).toHaveBeenCalledWith(sessao, EU, { vencedorId: EU, semente: 7 }, 'oponente ranqueado')
    expect(entrarNaArena).toHaveBeenCalledTimes(1)
    expect(result.current.atacando).toBe(false)
  })

  it('erro do gate vira toast e nao entra na arena', async () => {
    vi.mocked(rpc.atacarRanqueado).mockRejectedValue(new Error('Limite de 5 partidas ranqueadas hoje atingido. Volta amanha.'))
    const { result } = renderHook(() => usePvpRanked())
    await waitFor(() => expect(result.current.carregando).toBe(false))
    await act(async () => { await result.current.atacar() })
    expect(entrarNaArena).not.toHaveBeenCalled()
    expect(result.current.atacando).toBe(false)
  })
})
