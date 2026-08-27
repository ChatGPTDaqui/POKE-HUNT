import { describe, expect, it } from 'vitest'

import {
  MISSAO_TYPES, MISSAO_BONUS_CADEIA_COMPLETA, alvoDaMissao, recompensaDaMissao,
  cadeiaDoTipo, chaveDaMissao, missaoDaChave,
} from './missoes'
import { SPECIES } from './pokes'
import { pokedexNumber } from './regions'

describe('MISSAO_TYPES', () => {
  it('cobre os 18 tipos', () => {
    expect(MISSAO_TYPES).toHaveLength(18)
  })
})

describe('alvoDaMissao / recompensaDaMissao', () => {
  it('crescem com a posicao', () => {
    expect(alvoDaMissao(1)).toBeGreaterThan(alvoDaMissao(0))
    expect(recompensaDaMissao(1, false)).toBeGreaterThan(recompensaDaMissao(0, false))
  })

  it('ultima da cadeia inclui o bonus fixo', () => {
    const semBonus = recompensaDaMissao(3, false)
    const comBonus = recompensaDaMissao(3, true)
    expect(comBonus - semBonus).toBe(MISSAO_BONUS_CADEIA_COMPLETA)
  })
})

describe('cadeiaDoTipo', () => {
  it('cobre os 18 tipos com pelo menos 1 especie', () => {
    for (const tipo of MISSAO_TYPES) {
      expect(cadeiaDoTipo(tipo).length).toBeGreaterThan(0)
    }
  })

  it('ordena por numero de pokedex crescente', () => {
    const cadeia = cadeiaDoTipo('WATER')
    for (let i = 1; i < cadeia.length; i++) {
      expect(pokedexNumber(cadeia[i].speciesId)).toBeGreaterThan(pokedexNumber(cadeia[i - 1].speciesId))
    }
  })

  it('posicao e sequencial a partir de 0, e so a ultima tem ehUltima', () => {
    const cadeia = cadeiaDoTipo('DRAGON')
    cadeia.forEach((m, i) => expect(m.posicao).toBe(i))
    expect(cadeia.filter((m) => m.ehUltima)).toHaveLength(1)
    expect(cadeia[cadeia.length - 1].ehUltima).toBe(true)
  })

  it('so especies do nosso catalogo entram (nenhuma fora de SPECIES)', () => {
    for (const missao of cadeiaDoTipo('FAIRY')) {
      expect(SPECIES[missao.speciesId]).toBeDefined()
    }
  })

  it('especie dual-type aparece nas duas cadeias', () => {
    const bulbasaur = Object.values(SPECIES).find((s) => s.id === 'bulbasaur')
    if (!bulbasaur?.type2) return // se o catalogo mudar o starter, o teste so pula
    expect(cadeiaDoTipo(bulbasaur.type).some((m) => m.speciesId === 'bulbasaur')).toBe(true)
    expect(cadeiaDoTipo(bulbasaur.type2).some((m) => m.speciesId === 'bulbasaur')).toBe(true)
  })
})

describe('chaveDaMissao / missaoDaChave', () => {
  it('e a inversa uma da outra', () => {
    const chave = chaveDaMissao('FIRE', 'charmander')
    expect(missaoDaChave(chave)).toEqual({ tipo: 'FIRE', speciesId: 'charmander' })
  })
})
