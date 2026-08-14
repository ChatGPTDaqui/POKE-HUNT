// Invariantes do limite de 4 golpes. Estes testes existem porque a regra tem
// tres modos diferentes (selvagem, padrao do jogador, escolha do jogador) e o
// erro mais provavel — o AOE de nivel 50 escorregar pra dentro de um slot — nao
// causa erro nenhum, so come 25% do kit em silencio.
import { describe, it, expect } from 'vitest'
import { SPECIES } from './pokes'
import { getAbility, isDamagingAbility } from './abilities'
import { typedAoeMoveKey, TYPED_AOE_LEVEL } from './typedAoeMoves'
import {
  MAX_ACTIVE_ABILITIES, activeAbilitiesPadrao, activeAbilitiesSelvagem,
  encaixarNovosGolpes, golpesUtilizaveis, ehGolpeAoeDeNivel50,
} from './activeAbilities'
import type { PokeInstance } from './pokes'

const NIVEIS = [1, 10, 30, 50, 80]

function pokeFalso(speciesId: string, level: number, extra: Partial<PokeInstance> = {}): PokeInstance {
  const species = SPECIES[speciesId]
  return {
    uid: `teste-${speciesId}`,
    speciesId,
    level,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 },
    stats: { hp: 1, atkFis: 1, atkEsp: 1, def: 1, defEsp: 1, speed: 1 },
    hp: 1,
    unlockedAbilities: species.abilities
      .filter((a) => a.levelReq <= level)
      .map((a) => a.key)
      .filter((k) => getAbility(k)),
    ...extra,
  }
}

describe('limite de 4 golpes', () => {
  it('nunca passa de 4, em nenhuma especie ou nivel', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        expect(activeAbilitiesPadrao(species, level).length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
        expect(activeAbilitiesSelvagem(species, level).length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
      }
    }
  })

  it('o AOE de nivel 50 nunca ocupa slot, nem no padrao nem no selvagem', () => {
    for (const species of Object.values(SPECIES)) {
      const aoe = typedAoeMoveKey(species.type)
      for (const level of [TYPED_AOE_LEVEL, TYPED_AOE_LEVEL + 30]) {
        expect(activeAbilitiesPadrao(species, level)).not.toContain(aoe)
        expect(activeAbilitiesSelvagem(species, level)).not.toContain(aoe)
      }
    }
  })

  it('so escolhe golpe que a especie ja aprendeu naquele nivel', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        const permitidos = new Set(species.abilities.filter((a) => a.levelReq <= level).map((a) => a.key))
        for (const key of activeAbilitiesPadrao(species, level)) expect(permitidos.has(key)).toBe(true)
        for (const key of activeAbilitiesSelvagem(species, level)) expect(permitidos.has(key)).toBe(true)
      }
    }
  })

  it('o padrao do jogador prefere golpe de dano — nenhum POKE nasce com kit inerte', () => {
    for (const species of Object.values(SPECIES)) {
      for (const level of NIVEIS) {
        const learnset = species.abilities
          .filter((a) => a.levelReq <= level && a.key !== typedAoeMoveKey(species.type))
          .map((a) => getAbility(a.key))
        const temDano = learnset.some((a) => isDamagingAbility(a))
        if (!temDano) continue
        const escolhidos = activeAbilitiesPadrao(species, level).map((k) => getAbility(k))
        expect(escolhidos.some((a) => isDamagingAbility(a))).toBe(true)
      }
    }
  })
})

describe('golpesUtilizaveis', () => {
  it('selvagem nao recebe o AOE de nivel 50, mesmo no nivel 80', () => {
    const poke = pokeFalso('charizard', 80)
    const species = SPECIES.charizard
    const pool = golpesUtilizaveis(poke, species, true)
    expect(pool).not.toContain(typedAoeMoveKey(species.type))
    expect(pool.length).toBeLessThanOrEqual(MAX_ACTIVE_ABILITIES)
  })

  it('POKE do jogador recebe o AOE FORA dos 4 slots', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80)
    const pool = golpesUtilizaveis(poke, species, false)
    expect(pool).toContain(typedAoeMoveKey(species.type))
    expect(pool.length).toBe(MAX_ACTIVE_ABILITIES + 1)
  })

  it('selvagem ignora a escolha gravada — ele deriva da especie', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: [] })
    expect(golpesUtilizaveis(poke, species, true).length).toBeGreaterThan(0)
  })

  it('lista vazia e escolha valida: o POKE do jogador fica so com o AOE', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: [] })
    expect(golpesUtilizaveis(poke, species, false)).toEqual([typedAoeMoveKey(species.type)])
  })

  it('descarta escolha que o POKE nao conhece mais (especie trocada por evolucao)', () => {
    const species = SPECIES.charizard
    const poke = pokeFalso('charizard', 80, { activeAbilities: ['golpe_que_nao_existe', 'ember'] })
    expect(golpesUtilizaveis(poke, species, false)).not.toContain('golpe_que_nao_existe')
  })
})

describe('encaixarNovosGolpes', () => {
  it('preenche slot vazio', () => {
    expect(encaixarNovosGolpes(['ember', 'scratch'], ['flamethrower'])).toEqual(['ember', 'scratch', 'flamethrower'])
  })

  it('com os 4 cheios, nao derruba escolha do jogador', () => {
    const cheio = ['ember', 'scratch', 'growl', 'leer']
    expect(encaixarNovosGolpes(cheio, ['flamethrower'])).toEqual(cheio)
  })

  it('nunca encaixa o AOE de nivel 50 nem o Ataque Basico', () => {
    const aoe = typedAoeMoveKey('FIRE')
    expect(ehGolpeAoeDeNivel50(aoe)).toBe(true)
    expect(encaixarNovosGolpes(['ember'], [aoe, 'basic_attack'])).toEqual(['ember'])
  })
})
