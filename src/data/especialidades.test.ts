import { describe, expect, it } from 'vitest'

import {
  ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX,
  custoDoProximoNivel, custosDoTipo, especialidadeNiveisDefault, bonusDeAtaque, reducaoDeDefesa,
  progressoGlobal, tituloDoProgresso,
} from './especialidades'

describe('ESPECIALIDADE_TYPES', () => {
  it('cobre os 18 tipos, incluindo FAIRY', () => {
    expect(ESPECIALIDADE_TYPES).toHaveLength(18)
    expect(ESPECIALIDADE_TYPES).toContain('FAIRY')
  })
})

describe('custoDoProximoNivel', () => {
  it('devolve o custo do nivel 1 quando o atual e 0, pro tipo pedido', () => {
    for (const tipo of ESPECIALIDADE_TYPES) {
      expect(custoDoProximoNivel(tipo, 0)).toEqual(custosDoTipo(tipo)[0])
    }
  })

  it('devolve null no nivel maximo', () => {
    expect(custoDoProximoNivel('FIRE', ESPECIALIDADE_NIVEL_MAX)).toBeNull()
  })

  it('o custo em ouro cresce a cada nivel e e igual pros 18 tipos', () => {
    // Ouro nao tem oferta por tipo elemental, entao nao escala por tipo — ao
    // contrario da Stone (PH-246).
    const ouroDeFire = custosDoTipo('FIRE').map((c) => c.gold)
    for (const tipo of ESPECIALIDADE_TYPES) {
      expect(custosDoTipo(tipo).map((c) => c.gold), tipo).toEqual(ouroDeFire)
    }
    for (let i = 1; i < ouroDeFire.length; i++) {
      expect(ouroDeFire[i]).toBeGreaterThan(ouroDeFire[i - 1])
    }
  })

  it('o custo em Stone nunca decresce dentro de um tipo', () => {
    // Nao-decrescente, e nao estritamente crescente: nos tipos de oferta
    // minuscula (DARK, STEEL) o custo inteiro cabe em poucas Stones, e forcar
    // +1 por nivel inflaria o esforco real — ver o gerador.
    for (const tipo of ESPECIALIDADE_TYPES) {
      const custos = custosDoTipo(tipo)
      expect(custos).toHaveLength(ESPECIALIDADE_NIVEL_MAX)
      for (let i = 1; i < custos.length; i++) {
        expect(custos[i].stoneQtd, `${tipo} nivel ${i + 1}`).toBeGreaterThanOrEqual(custos[i - 1].stoneQtd)
      }
      expect(custos[0].stoneQtd, `${tipo} nivel 1 de graca`).toBeGreaterThan(0)
    }
  })

  it('o custo em Stone difere entre tipos de oferta diferente', () => {
    // Se isto passar a ser igual pros 18, o escalonamento por oferta sumiu e a
    // desigualdade de 9x volta em silencio.
    const total = (t: (typeof ESPECIALIDADE_TYPES)[number]) =>
      custosDoTipo(t).reduce((s, c) => s + c.stoneQtd, 0)
    expect(total('WATER')).toBeGreaterThan(total('DARK'))
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

  it('a trilha de defesa REDUZ dano recebido — nunca amplifica', () => {
    // O rotulo da tela dizia "+1% a +5% de defesa", que e outra mecanica. Este
    // caso trava o que a funcao realmente faz (PH-246).
    const niveis = especialidadeNiveisDefault()
    for (let n = 0; n <= ESPECIALIDADE_NIVEL_MAX; n++) {
      niveis.WATER = { dano: 0, defesa: n }
      expect(reducaoDeDefesa(niveis, 'WATER')).toBeLessThanOrEqual(1)
    }
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
