import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { rpc: vi.fn(() => Promise.resolve({})) } }))

import { deveReportar, JANELA_POR_MENSAGEM_MS, reiniciarFreioDeErros, TETO_POR_ABA } from './globalErrorHandlers'

describe('freio dos relatorios de erro', () => {
  beforeEach(() => reiniciarFreioDeErros())

  it('a mesma mensagem sai uma vez por janela', () => {
    expect(deveReportar('x', 0)).toBe(true)
    expect(deveReportar('x', 1000)).toBe(false)
    expect(deveReportar('x', JANELA_POR_MENSAGEM_MS + 1)).toBe(true)
  })

  it('a aba inteira tem teto', () => {
    for (let i = 0; i < TETO_POR_ABA; i++) expect(deveReportar(`m${i}`, 0)).toBe(true)
    expect(deveReportar('outra', 0)).toBe(false)
  })
})
