import { describe, expect, it } from 'vitest'

import { ATLAS_DOS_BIOMAS, salasEspeciaisDaEspecie, soEmSalaEspecial } from './atlasDosBiomas'
import { BIOMAS } from './biomas'
import { SPECIES } from './pokes'

describe('atlas dos biomas (Wiki e Pokedex)', () => {
  it('cobre todo bioma, todo sub-bioma e toda sala especial', () => {
    expect(ATLAS_DOS_BIOMAS.map((f) => f.bioma.chave)).toEqual(BIOMAS.map((b) => b.chave))
    for (const f of ATLAS_DOS_BIOMAS) {
      expect(f.subBiomas.length).toBe(f.bioma.subBiomas.length)
      expect(f.especiais.length).toBe((f.bioma.especiais ?? []).length)
      expect(f.composicao.length).toBe(10)
    }
  })

  it('todo sub-bioma mostra estagio, clima, itens e quem aparece', () => {
    for (const f of ATLAS_DOS_BIOMAS) {
      for (const s of f.subBiomas) {
        const rotulo = `${f.bioma.chave}/${s.sub.chave}`
        expect(s.estagios.length, rotulo).toBeGreaterThan(0)
        expect(s.estagios, rotulo).toContain(s.pico)
        expect(s.climas.length, rotulo).toBeGreaterThan(0)
        expect(s.itens.length, rotulo).toBeGreaterThan(0)
        expect(s.destaques.length, rotulo).toBeGreaterThan(0)
        for (const sp of s.destaques) expect(SPECIES[sp], `${rotulo}: ${sp}`).toBeDefined()
      }
    }
  })

  it('a Pokedex acha as exclusivas das salas especiais, e so elas', () => {
    expect(soEmSalaEspecial('eevee')).toBe(true)
    expect(soEmSalaEspecial('porygon')).toBe(true)
    expect(soEmSalaEspecial('bulbasaur')).toBe(true)
    expect(soEmSalaEspecial('pikachu')).toBe(false)
    expect(salasEspeciaisDaEspecie('eevee').map((x) => x.sala.sala.chave)).toEqual(['celadon-mansion'])
    expect(salasEspeciaisDaEspecie('charmander').map((x) => x.bioma.chave)).toEqual(['campo_aberto'])
    expect(salasEspeciaisDaEspecie('vaporeon')).toEqual([])
  })
})
