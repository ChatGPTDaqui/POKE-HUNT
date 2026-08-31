// PH-312 (PH-120, fatia 3) — o que o cliente faz ao confirmar, e o que ele faz
// DEPOIS que a troca executou.
//
// Duas coisas, e as duas ja custaram caro neste projeto por outros caminhos:
//
//  1. A confirmacao carrega a VERSAO que a tela desenhou. Mandar a versao
//     relida na hora seria concordar com a mudanca sem olhar — exatamente o
//     golpe que a issue-mae descreve.
//  2. Quando a troca executa, o cliente ganha POKEs cujas linhas ele nunca leu.
//     Inventar a lista local seria mostrar uma mochila que nao existe; e manter
//     o dominio de exclusao antigo (PH-182) e o que faz o save seguinte tentar
//     apagar coisa. Invalidar a Mochila resolve os dois, porque `invalidar`
//     chama `esquecerIdsDaReserva`.
//
// O item recebido NAO aparece aqui de proposito: ele vai por `market_deliveries`
// e e reivindicado no proximo `/estado`. Somar no estado local tambem daria duas
// fontes pro mesmo credito.
import { beforeEach, describe, expect, it, vi } from 'vitest'

let chamadas: { nome: string; params: Record<string, unknown> | undefined }[]
let invalidacoes: number
let respostaDaRpc: Record<string, unknown>

const MESA = {
  id: 's1',
  anfitriao_id: 'u1',
  convidado_id: 'u2',
  criada_em: '2026-08-30T00:00:00.000Z',
  expira_em: '2026-08-30T00:15:00.000Z',
  encerrada_por: null,
  encerrada_em: null,
  versao: 4,
  versao_confirmada_anfitriao: 4,
  versao_confirmada_convidado: null,
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
    })),
    rpc: vi.fn((nome: string, params?: Record<string, unknown>) => {
      chamadas.push({ nome, params })
      return Promise.resolve({ data: respostaDaRpc, error: null })
    }),
  },
}))

vi.mock('@/stores/mochilaStore', () => ({
  mochilaCarregada: () => true,
  useMochilaStore: { getState: () => ({ invalidar: () => { invalidacoes += 1 } }) },
}))

beforeEach(() => {
  chamadas = []
  invalidacoes = 0
  respostaDaRpc = { ...MESA, estado: 'aberta' }
  vi.resetModules()
})

describe('confirmar carrega a versao que a tela viu (PH-312)', () => {
  it('a RPC recebe p_versao com o numero passado', async () => {
    const troca = await import('./trocaRpc')
    await troca.confirmarTroca('s1', 4)
    expect(chamadas[0]).toEqual({ nome: 'confirmar_troca', params: { p_sessao_id: 's1', p_versao: 4 } })
  })

  it('a sessao volta com as duas confirmacoes lidas', async () => {
    const troca = await import('./trocaRpc')
    const sessao = await troca.confirmarTroca('s1', 4)
    expect(sessao.versao).toBe(4)
    expect(sessao.versaoConfirmadaAnfitriao).toBe(4)
    expect(sessao.versaoConfirmadaConvidado).toBeNull()
  })

  it('desconfirmar manda so o id da mesa', async () => {
    const troca = await import('./trocaRpc')
    await troca.desconfirmarTroca('s1')
    expect(chamadas[0]).toEqual({ nome: 'desconfirmar_troca', params: { p_sessao_id: 's1' } })
  })
})

describe('depois que a troca executa, a Mochila e invalidada (PH-312)', () => {
  it('sessao concluida invalida', async () => {
    respostaDaRpc = { ...MESA, estado: 'concluida', versao_confirmada_convidado: 4 }
    const troca = await import('./trocaRpc')
    await troca.confirmarTroca('s1', 4)
    expect(invalidacoes).toBe(1)
  })

  it('confirmacao que AINDA nao executou nao invalida nada', async () => {
    // Invalidar a cada confirmacao faria a Mochila recarregar inteira toda vez
    // que qualquer um dos dois clicasse — e a leitura paginada e cara.
    const troca = await import('./trocaRpc')
    await troca.confirmarTroca('s1', 4)
    expect(invalidacoes).toBe(0)
  })

  it('desconfirmar tambem nao invalida', async () => {
    const troca = await import('./trocaRpc')
    await troca.desconfirmarTroca('s1')
    expect(invalidacoes).toBe(0)
  })
})
