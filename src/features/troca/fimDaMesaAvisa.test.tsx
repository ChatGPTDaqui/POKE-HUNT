// @vitest-environment jsdom
//
// PH-321 — quando a mesa acaba, os DOIS lados precisam saber o que aconteceu.
//
// Achado ao vivo, com duas contas: quem confirma por ULTIMO executa, ve "Troca
// concluida" e tem a Mochila invalidada. Quem confirmou PRIMEIRO nao via nada —
// a tela voltava pro estado vazio sem uma palavra.
//
// Duas consequencias, e a segunda e a que doi:
//
//  1. "a mesa sumiu" e ambiguo entre a troca ter saido, o outro ter cancelado e
//     o prazo ter vencido. Numa feature cujo ponto e confianca entre dois
//     jogadores, e exatamente a hora de nao deixar duvida.
//  2. sem invalidar a Mochila, `carregada` continua `true`, `carregar()` vira
//     no-op, e o jogador ABRE A MOCHILA SEM VER o POKE que acabou de receber.
//     O dado esta certo no banco; e a tela que mente ate um F5.
//
// A causa era `minhaTrocaViva` devolver so mesa VIVA: o outro lado aprendia
// apenas `null`. O desfecho sempre esteve na linha (`estado`, `encerrada_por`)
// e ninguem perguntava.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, renderHook, waitFor } from '@testing-library/react'

const SESSAO_ABERTA = {
  id: 's1',
  anfitriaoId: 'eu',
  convidadoId: 'ele',
  estado: 'aberta' as string,
  criadaEm: '2026-08-31T00:00:00.000Z',
  expiraEm: '2999-01-01T00:00:00.000Z',
  encerradaPor: null as string | null,
  encerradaEm: null as string | null,
  versao: 3,
  versaoConfirmadaAnfitriao: 3,
  versaoConfirmadaConvidado: null as number | null,
}

let viva: typeof SESSAO_ABERTA | null = { ...SESSAO_ABERTA }
let desfecho: typeof SESSAO_ABERTA | null = null
let avisarDeMudanca: (() => void) | null = null
let toasts: { texto: string; tipo: string }[]
let invalidacoes: number

vi.mock('@/data/remote/trocaRpc', () => ({
  minhaTrocaViva: () => Promise.resolve(viva),
  lerTroca: (id: string) => Promise.resolve(desfecho && desfecho.id === id ? desfecho : null),
  lerMesa: () => Promise.resolve([]),
  assinarMinhaTroca: (_id: string, aoMudar: () => void) => { avisarDeMudanca = aoMudar; return () => {} },
  encerrarTroca: vi.fn(),
  confirmarTroca: vi.fn(),
}))

vi.mock('@/stores/toastStore', () => ({
  useToastStore: { getState: () => ({ pushToast: (texto: string, tipo: string) => { toasts.push({ texto, tipo }) } }) },
}))

vi.mock('@/stores/mochilaStore', () => ({
  mochilaCarregada: () => true,
  useMochilaStore: { getState: () => ({ invalidar: () => { invalidacoes += 1 } }) },
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (seletor: (s: unknown) => unknown) => seletor({ user: { id: 'eu' } }),
}))

import { useTroca } from './useTroca'

afterEach(cleanup)

beforeEach(() => {
  viva = { ...SESSAO_ABERTA }
  desfecho = null
  avisarDeMudanca = null
  toasts = []
  invalidacoes = 0
})

/** O evento que o Realtime dispara no lado que NAO executou. */
async function aMesaAcabaCom(estado: string, encerradaPor: string | null = null) {
  viva = null
  desfecho = { ...SESSAO_ABERTA, estado, encerradaPor, encerradaEm: '2026-08-31T00:05:00.000Z' }
  avisarDeMudanca?.()
}

describe('quem NAO deu o ultimo clique tambem e avisado (PH-321)', () => {
  it('troca concluida avisa E invalida a Mochila', async () => {
    // O POKE recebido mudou de dono em linhas que este cliente nunca leu. Sem
    // invalidar, a Mochila continua mostrando a lista velha.
    const { result } = renderHook(() => useTroca())
    await waitFor(() => expect(result.current.sessao).not.toBeNull())

    await aMesaAcabaCom('concluida')
    await waitFor(() => expect(result.current.sessao).toBeNull())

    expect(toasts.map((t) => t.texto)).toEqual(['Troca concluida.'])
    expect(invalidacoes).toBe(1)
  })

  it('cancelamento do OUTRO avisa, e nao invalida nada', async () => {
    // Nada mudou de dono: invalidar aqui faria a Mochila recarregar inteira a
    // toa, e a leitura paginada e cara.
    const { result } = renderHook(() => useTroca())
    await waitFor(() => expect(result.current.sessao).not.toBeNull())

    await aMesaAcabaCom('cancelada', 'ele')
    await waitFor(() => expect(result.current.sessao).toBeNull())

    expect(toasts.map((t) => t.texto)).toEqual(['A outra pessoa cancelou a troca.'])
    expect(invalidacoes).toBe(0)
  })

  it('cancelamento MEU nao vira toast', async () => {
    // Eu acabei de clicar em cancelar. Um aviso repetindo isso e ruido.
    const { result } = renderHook(() => useTroca())
    await waitFor(() => expect(result.current.sessao).not.toBeNull())

    await aMesaAcabaCom('cancelada', 'eu')
    await waitFor(() => expect(result.current.sessao).toBeNull())

    expect(toasts).toEqual([])
  })

  it('expiracao diz que o que estava na mesa voltou', async () => {
    // O jogador precisa saber que nao perdeu nada — a mesa some sozinha aos 15
    // minutos e nada explicaria por que.
    const { result } = renderHook(() => useTroca())
    await waitFor(() => expect(result.current.sessao).not.toBeNull())

    await aMesaAcabaCom('expirada')
    await waitFor(() => expect(result.current.sessao).toBeNull())

    expect(toasts[0]?.texto).toMatch(/expirou/)
  })

  it('o aviso NAO se repete a cada evento seguinte', async () => {
    // O Realtime dispara mais de uma vez: a execucao apaga as linhas da oferta,
    // e cada delete sobe a versao. Sem limpar o acompanhamento, cada evento
    // republicaria o mesmo toast.
    const { result } = renderHook(() => useTroca())
    await waitFor(() => expect(result.current.sessao).not.toBeNull())

    await aMesaAcabaCom('concluida')
    await waitFor(() => expect(result.current.sessao).toBeNull())
    avisarDeMudanca?.()
    avisarDeMudanca?.()
    await waitFor(() => expect(toasts.length).toBe(1))

    expect(invalidacoes).toBe(1)
  })
})
