import { describe, expect, it } from 'vitest'

import { MISSAO_TYPES, cadeiaDoTipo, chaveDaMissao, missaoDaChave } from './missoes'
import { SPECIES } from './pokes'

describe('MISSAO_TYPES', () => {
  it('cobre os 18 tipos', () => {
    expect(MISSAO_TYPES).toHaveLength(18)
  })
})

describe('cadeiaDoTipo', () => {
  it('cobre os 18 tipos com pelo menos 1 especie', () => {
    for (const tipo of MISSAO_TYPES) {
      expect(cadeiaDoTipo(tipo).length, `cadeia de ${tipo} vazia`).toBeGreaterThan(0)
    }
  })

  it('posicao e sequencial a partir de 0, e so a ultima tem ehUltima', () => {
    for (const tipo of MISSAO_TYPES) {
      const cadeia = cadeiaDoTipo(tipo)
      cadeia.forEach((m, i) => expect(m.posicao, `${tipo}[${i}]`).toBe(i))
      expect(cadeia.filter((m) => m.ehUltima), `${tipo} tem mais de uma ultima`).toHaveLength(1)
      expect(cadeia[cadeia.length - 1].ehUltima).toBe(true)
    }
  })

  it('alvo nunca decresce ao longo da cadeia', () => {
    for (const tipo of MISSAO_TYPES) {
      const cadeia = cadeiaDoTipo(tipo)
      for (let i = 1; i < cadeia.length; i++) {
        expect(cadeia[i].alvo, `${tipo} pos ${i}`).toBeGreaterThanOrEqual(cadeia[i - 1].alvo)
      }
    }
  })

  it('so especies do nosso catalogo entram, em TODOS os tipos', () => {
    // Era `cadeiaDoTipo('FAIRY')` sozinho, e passava mesmo com a cadeia
    // derivada errada. Agora varre os 18.
    for (const tipo of MISSAO_TYPES) {
      for (const missao of cadeiaDoTipo(tipo)) {
        expect(SPECIES[missao.speciesId], `${tipo}: ${missao.speciesId} fora de SPECIES`).toBeDefined()
      }
    }
  })

  it('a especie de cada missao realmente tem o tipo da cadeia', () => {
    for (const tipo of MISSAO_TYPES) {
      for (const missao of cadeiaDoTipo(tipo)) {
        const s = SPECIES[missao.speciesId]
        expect(s.type === tipo || s.type2 === tipo, `${missao.speciesId} nao e ${tipo}`).toBe(true)
      }
    }
  })

  it('nenhuma especie aparece duas vezes na mesma cadeia', () => {
    for (const tipo of MISSAO_TYPES) {
      const ids = cadeiaDoTipo(tipo).map((m) => m.speciesId)
      expect(new Set(ids).size, `${tipo} tem especie repetida`).toBe(ids.length)
    }
  })

  it('especie dual-type aparece nas duas cadeias', () => {
    const gastly = SPECIES['gastly']
    expect(gastly.type).toBe('GHOST')
    expect(gastly.type2).toBe('POISON')
    expect(cadeiaDoTipo('GHOST').some((m) => m.speciesId === 'gastly')).toBe(true)
    expect(cadeiaDoTipo('POISON').some((m) => m.speciesId === 'gastly')).toBe(true)
  })
})

describe('chaveDaMissao / missaoDaChave', () => {
  it('e a inversa uma da outra', () => {
    const chave = chaveDaMissao('FIRE', 'charmander')
    expect(missaoDaChave(chave)).toEqual({ tipo: 'FIRE', speciesId: 'charmander' })
  })
})
