// Rastro do dano na barra de HP (23/11/2026, referencia: LoL).
import { describe, expect, it } from 'vitest'
import { RastrosDoHp } from './rastroDoHp'
import { ESCOAMENTO_DO_RASTRO_S, ESPERA_DO_RASTRO_S } from '@/data/hpBar'

describe('rastro do dano na barra de HP', () => {
  it('segura o HP de antes, espera e escoa ate o valor novo', () => {
    const r = new RastrosDoHp()
    expect(r.atualizar('a', 1, 0)).toBe(1)
    expect(r.atualizar('a', 0.6, 1)).toBe(1)
    expect(r.atualizar('a', 0.6, 1 + ESPERA_DO_RASTRO_S - 0.01)).toBe(1)
    const meio = r.atualizar('a', 0.6, 1 + ESPERA_DO_RASTRO_S + ESCOAMENTO_DO_RASTRO_S / 2)
    expect(meio).toBeLessThan(1)
    expect(meio).toBeGreaterThan(0.6)
    expect(r.atualizar('a', 0.6, 1 + ESPERA_DO_RASTRO_S + ESCOAMENTO_DO_RASTRO_S)).toBeCloseTo(0.6)
  })

  it('segunda queda no meio do escoamento: segura de onde o rastro esta', () => {
    const r = new RastrosDoHp()
    r.atualizar('a', 1, 0)
    r.atualizar('a', 0.6, 1)
    const t = 1 + ESPERA_DO_RASTRO_S + ESCOAMENTO_DO_RASTRO_S / 2
    const antes = r.atualizar('a', 0.6, t)
    expect(r.atualizar('a', 0.3, t)).toBeCloseTo(antes)
  })

  it('cura nao deixa rastro', () => {
    const r = new RastrosDoHp()
    r.atualizar('a', 0.4, 0)
    expect(r.atualizar('a', 0.8, 1)).toBe(0.8)
  })
})
