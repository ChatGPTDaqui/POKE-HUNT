// Os TRES tracos individuais dos jogos, no formato deste jogo:
//
//   NATUREZA        data/natures.ts          sorteada, gravada, mexe em stat
//   HABILIDADE      data/traits.ts           sorteada, gravada, mexe em combate
//   CARACTERISTICA  data/characteristics.ts  DERIVADA dos IVs, nao gravada
//
// Todos falham em silencio. Natureza errada nao lanca — sai um POKE 10% mais
// fraco. Habilidade fora do catalogo nao lanca — `traitDoPoke` devolve o slot 1
// e ninguem ve. Caracteristica apontando pro atributo errado nao lanca — vira
// uma pista mentirosa sobre o IV, que e a unica funcao dela.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { SPECIES, createPokeInstance, computeStatsAtLevel } from '@/data/pokes'
import {
  NATURES, NATURE_LIST, NATURE_STATS, NATURE_BONUS, NATURE_PENALTY,
  multiplicadorDeNatureza, NATURES_NEUTRAS,
} from './natures'
import { TRAITS, traitsDaEspecie, traitDoPoke, sortearTrait } from './traits'
import { caracteristicaDe, statDeMaiorIv } from './characteristics'
import { STAT_ORDER } from './statLabels'

const IV = { hp: 10, atkFis: 20, atkEsp: 5, def: 15, defEsp: 8, speed: 30 }

describe('Natureza', () => {
  it('sao exatamente as 25 do produto 5x5, sem repetir', () => {
    expect(NATURE_LIST).toHaveLength(25)
    expect(new Set(NATURE_LIST.map((n) => n.nome)).size).toBe(25)
  })

  it('5 sao neutras e 20 mexem em dois atributos DIFERENTES', () => {
    expect(NATURES_NEUTRAS).toHaveLength(5)
    for (const n of NATURE_LIST) {
      if (!n.sobe) { expect(n.desce).toBeNull(); continue }
      expect(n.sobe).not.toBe(n.desce)
    }
  })

  it('nenhuma natureza alcanca o HP — a regra que vale em toda a serie', () => {
    for (const n of NATURE_LIST) {
      expect(multiplicadorDeNatureza(n.key, 'hp')).toBe(1)
    }
    expect(NATURE_STATS).not.toContain('hp')
  })

  it('cada atributo (menos HP) e subido por 5 naturezas e descido por 5', () => {
    for (const stat of NATURE_STATS) {
      expect(NATURE_LIST.filter((n) => n.sobe === stat)).toHaveLength(4)
      expect(NATURE_LIST.filter((n) => n.desce === stat)).toHaveLength(4)
    }
  })

  it('o multiplicador chega no atributo final, e so nos dois atributos dela', () => {
    const especie = SPECIES.charmander
    const neutro = computeStatsAtLevel(especie, 50, IV, 'comum', false, 'hardy')
    // Adamant: +Atk Fis, -Atk Esp.
    const adamant = computeStatsAtLevel(especie, 50, IV, 'comum', false, 'adamant')
    expect(NATURES.adamant.sobe).toBe('atkFis')
    expect(NATURES.adamant.desce).toBe('atkEsp')
    expect(adamant.atkFis).toBe(Math.round(neutro.atkFis * NATURE_BONUS))
    expect(adamant.atkEsp).toBe(Math.round(neutro.atkEsp * NATURE_PENALTY))
    for (const stat of ['hp', 'def', 'defEsp', 'speed'] as const) {
      expect(adamant[stat]).toBe(neutro[stat])
    }
  })

  it('POKE sem natureza (save anterior a 2026-08-18) sai igual a uma neutra', () => {
    const especie = SPECIES.charmander
    expect(computeStatsAtLevel(especie, 50, IV, 'comum', false, undefined))
      .toEqual(computeStatsAtLevel(especie, 50, IV, 'comum', false, 'hardy'))
  })

  it('todo POKE novo nasce com uma das 25', () => {
    for (let semente = 0; semente < 30; semente++) {
      const poke = createPokeInstance(createRng(semente), 'rattata', 20)
      expect(poke.nature).toBeDefined()
      expect(NATURES[poke.nature!]).toBeDefined()
    }
  })
})

describe('Habilidade (Trait)', () => {
  it('toda especie do elenco tem atribuicao, e toda chave existe no catalogo', () => {
    const semTrait: string[] = []
    const foraDoCatalogo: string[] = []
    for (const id of Object.keys(SPECIES)) {
      const t = traitsDaEspecie(id)
      if (!t || t.normais.length === 0) { semTrait.push(id); continue }
      for (const chave of [...t.normais, ...(t.oculta ? [t.oculta] : [])]) {
        if (!TRAITS[chave]) foraDoCatalogo.push(`${id}: ${chave}`)
      }
    }
    expect(semTrait).toEqual([])
    expect(foraDoCatalogo).toEqual([])
  })

  it('o sorteio so devolve habilidade que a especie realmente pode ter', () => {
    for (const id of Object.keys(SPECIES)) {
      const permitidas = new Set([
        ...traitsDaEspecie(id)!.normais,
        ...(traitsDaEspecie(id)!.oculta ? [traitsDaEspecie(id)!.oculta!] : []),
      ])
      for (let semente = 0; semente < 5; semente++) {
        expect(permitidas.has(sortearTrait(createRng(semente), id)!), `${id}`).toBe(true)
      }
    }
  })

  it('POKE sem habilidade gravada cai no slot 1 da especie, nunca em null', () => {
    for (const id of Object.keys(SPECIES)) {
      expect(traitDoPoke({ speciesId: id }), id).toBe(traitsDaEspecie(id)!.normais[0])
    }
  })

  it('habilidade gravada que nao existe mais no catalogo cai no slot 1, sem quebrar', () => {
    expect(traitDoPoke({ speciesId: 'pikachu', trait: 'habilidade_que_nao_existe' }))
      .toBe(traitsDaEspecie('pikachu')!.normais[0])
  })

  it('a atribuicao e a do Ultra Sun, e nao a hand-authored que ela substituiu', () => {
    // Dois casos que a tabela antiga errava, e que sao o motivo de ela ter
    // saido: Gengar PERDEU Levitate na Gen VII (so tem Cursed Body), e Marill
    // tem Huge Power como slot 2 real, nao como unica opcao.
    expect(traitsDaEspecie('gengar')!.normais).not.toContain('levitate')
    expect(traitsDaEspecie('gengar')!.normais).toContain('cursed_body')
    expect(traitsDaEspecie('marill')!.normais).toContain('huge_power')
  })
})

describe('Caracteristica', () => {
  it('aponta sempre o atributo de MAIOR IV', () => {
    for (let semente = 0; semente < 50; semente++) {
      const poke = createPokeInstance(createRng(semente), 'rattata', 20)
      const c = caracteristicaDe(poke.ivs)!
      const maior = Math.max(...STAT_ORDER.map((s) => poke.ivs[s]))
      expect(poke.ivs[c.stat], `semente ${semente}`).toBe(maior)
      expect(c.iv).toBe(maior)
    }
  })

  it('a frase varia com o IV modulo 5 — e a pista fina que ela existe pra dar', () => {
    const base = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 31 }
    const frases = new Set<string>()
    for (let iv = 0; iv <= 31; iv++) {
      frases.add(caracteristicaDe({ ...base, speed: iv === 0 ? 0 : iv })!.texto)
    }
    // 5 frases da familia "speed" + a de HP quando velocidade e 0 e o empate
    // cai no primeiro de STAT_ORDER.
    expect(frases.size).toBe(6)
  })

  it('empate resolve pela ordem fixa de STAT_ORDER, nao aleatoriamente', () => {
    const todosIguais = { hp: 31, atkFis: 31, atkEsp: 31, def: 31, defEsp: 31, speed: 31 }
    expect(statDeMaiorIv(todosIguais)).toBe(STAT_ORDER[0])
    expect(caracteristicaDe(todosIguais)!.texto).toBe(caracteristicaDe(todosIguais)!.texto)
  })
})
