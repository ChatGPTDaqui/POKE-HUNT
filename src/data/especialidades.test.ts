import { describe, expect, it } from 'vitest'

import {
  ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_CUSTOS,
  custoDoProximoNivel, especialidadeNiveisDefault, bonusDeAtaque, reducaoDeDefesa,
  progressoGlobal, tituloDoProgresso,
} from './especialidades'

describe('ESPECIALIDADE_TYPES', () => {
  it('cobre os 18 tipos, incluindo FAIRY', () => {
    expect(ESPECIALIDADE_TYPES).toHaveLength(18)
    expect(ESPECIALIDADE_TYPES).toContain('FAIRY')
  })
})

describe('custoDoProximoNivel', () => {
  it('devolve o custo do nivel 1 quando o atual e 0', () => {
    expect(custoDoProximoNivel(0)).toEqual(ESPECIALIDADE_CUSTOS[0])
  })

  it('devolve null no nivel maximo', () => {
    expect(custoDoProximoNivel(ESPECIALIDADE_NIVEL_MAX)).toBeNull()
  })

  it('custo cresce a cada nivel', () => {
    for (let i = 1; i < ESPECIALIDADE_CUSTOS.length; i++) {
      expect(ESPECIALIDADE_CUSTOS[i].gold).toBeGreaterThan(ESPECIALIDADE_CUSTOS[i - 1].gold)
      expect(ESPECIALIDADE_CUSTOS[i].stoneQtd).toBeGreaterThan(ESPECIALIDADE_CUSTOS[i - 1].stoneQtd)
    }
  })
})

describe('bonusDeAtaque / reducaoDeDefesa', () => {
  it('sem progresso (null) e neutro nos dois lados', () => {
    expect(bonusDeAtaque(null, 'FIRE')).toBe(1)
    expect(reducaoDeDefesa(null, 'FIRE')).toBe(1)
  })

  it('nivel maximo de dano da +5%, nivel maximo de defesa da -5%', () => {
    const niveis = especialidadeNiveisDefault()
    niveis.FIRE = { dano: ESPECIALIDADE_NIVEL_MAX, defesa: ESPECIALIDADE_NIVEL_MAX }
    expect(bonusDeAtaque(niveis, 'FIRE')).toBeCloseTo(1.05)
    expect(reducaoDeDefesa(niveis, 'FIRE')).toBeCloseTo(0.95)
  })

  it('so olha o tipo pedido — outro tipo no mesmo mapa nao vaza', () => {
    const niveis = especialidadeNiveisDefault()
    niveis.FIRE = { dano: 5, defesa: 5 }
    expect(bonusDeAtaque(niveis, 'WATER')).toBe(1)
    expect(reducaoDeDefesa(niveis, 'WATER')).toBe(1)
  })
})

describe('progressoGlobal', () => {
  it('zero por padrao, maximo e 18 tipos x 10 niveis', () => {
    const { atual, max } = progressoGlobal(especialidadeNiveisDefault())
    expect(atual).toBe(0)
    expect(max).toBe(180)
  })

  it('soma dano e defesa de todos os tipos', () => {
    const niveis = especialidadeNiveisDefault()
    niveis.FIRE = { dano: 3, defesa: 2 }
    niveis.WATER = { dano: 1, defesa: 0 }
    expect(progressoGlobal(niveis).atual).toBe(6)
  })
})

describe('tituloDoProgresso', () => {
  it('Novato em 0%, Lendario em 100%', () => {
    expect(tituloDoProgresso(0, 180)).toBe('Novato')
    expect(tituloDoProgresso(180, 180)).toBe('Lendario')
  })
})
