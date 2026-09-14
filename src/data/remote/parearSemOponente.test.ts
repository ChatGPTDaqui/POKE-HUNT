// PH-539 — `tentar_parear_ranqueado` devolve NULL de tipo composto quando
// nao ha par, e o PostgREST serializa isso como um objeto com todas as
// colunas nulas. Tratar esse objeto como sessao fazia o polling parar e
// chamar `/pvp/resolver` com `sessaoId: null` — a fila ranqueada nunca
// esperava o oponente (nem o fallback de bot, que exige 15s de fila).
import { describe, expect, it, vi } from 'vitest'

let respostaDaRpc: unknown

vi.mock('@/lib/supabase', () => ({
  schema: 'dev',
  supabase: {
    rpc: vi.fn(() => Promise.resolve({ data: respostaDaRpc, error: null })),
  },
}))

import { tentarPearearRanqueado } from './pvpRpc'

const LINHA_NULA = {
  id: null, anfitriao_id: null, convidado_id: null, estado: null, modo: null,
  criada_em: null, expira_em: null, encerrada_por: null, encerrada_em: null,
  vencedor_id: null, anfitriao_poke: null, convidado_poke: null,
}

describe('tentarPearearRanqueado sem oponente', () => {
  it('linha toda nula do PostgREST vira null, nao sessao', async () => {
    respostaDaRpc = LINHA_NULA
    expect(await tentarPearearRanqueado()).toBeNull()
  })

  it('null cru tambem vira null', async () => {
    respostaDaRpc = null
    expect(await tentarPearearRanqueado()).toBeNull()
  })

  it('sessao real continua passando', async () => {
    respostaDaRpc = { ...LINHA_NULA, id: 's1', anfitriao_id: 'u1', convidado_id: 'bot', estado: 'aberta', modo: 'ranqueado_bot', criada_em: 'x', expira_em: 'y' }
    const s = await tentarPearearRanqueado()
    expect(s?.id).toBe('s1')
    expect(s?.modo).toBe('ranqueado_bot')
  })
})
