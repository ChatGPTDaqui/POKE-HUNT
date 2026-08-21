// TODA lista de id de golpe escrita a mao no motor tem que casar com o
// catalogo gerado.
//
// BUG REAL QUE ISTO TRANCA (PH-73): `SELF_DESTRUCT_ABILITY_KEYS` tinha
// `selfdestruct`, e a migracao pro catalogo do Ultra Sun renomeou a chave pra
// `self_destruct`. A entrada ficou orfa e Autodestruicao passou a causar os 200
// de poder EM AREA sem matar quem usou — o custo inteiro do golpe desapareceu,
// sem erro, sem log, sem teste falhando. O MESMO rename ja tinha furado a lista
// de golpes de area antes (ver AOE_ABILITY_KEYS em data/abilities.ts), o que
// mostra que o problema e a categoria de codigo, nao o descuido de uma vez.
//
// Espelha o teste que moveDescriptions.test.ts ja faz com
// GOLPES_COM_EFEITO_HARDCODED/GOLPES_DE_ESCUDO. As listas do motor nunca
// estiveram cobertas.
//
// COMO MANTER: lista de id nova em combatSystem.ts entra aqui. Se ela nao
// estiver neste arquivo, ela nao esta protegida.
import { describe, expect, it } from 'vitest'

import { ABILITIES_DATA } from '@/data/generated/abilities.generated'
import { GOLPES_DE_SOM } from '@/data/traitEffects'
import {
  DYNAMIC_POWER_ABILITIES,
  ESCUDO_ABILITIES,
  FIXED_DAMAGE_ABILITIES,
  PROTECAO_ABILITY_KEYS,
  PROTECT_BYPASS_ABILITY_IDS,
  SELF_DESTRUCT_ABILITY_KEYS,
} from './combatSystem'

const LISTAS: Record<string, string[]> = {
  SELF_DESTRUCT_ABILITY_KEYS: [...SELF_DESTRUCT_ABILITY_KEYS],
  PROTECAO_ABILITY_KEYS: [...PROTECAO_ABILITY_KEYS],
  PROTECT_BYPASS_ABILITY_IDS: [...PROTECT_BYPASS_ABILITY_IDS],
  ESCUDO_ABILITIES: Object.keys(ESCUDO_ABILITIES),
  DYNAMIC_POWER_ABILITIES: Object.keys(DYNAMIC_POWER_ABILITIES),
  FIXED_DAMAGE_ABILITIES: Object.keys(FIXED_DAMAGE_ABILITIES),
  GOLPES_DE_SOM: [...GOLPES_DE_SOM],
}

describe('listas de id de golpe hardcoded no motor', () => {
  for (const [nome, ids] of Object.entries(LISTAS)) {
    it(`${nome}: nenhuma chave orfa`, () => {
      const orfas = ids.filter((id) => !ABILITIES_DATA[id])
      expect(orfas).toEqual([])
    })
  }

  // Guard especifico do bug: o golpe existe no catalogo E esta na lista de
  // auto-KO. Nao basta a chave existir — ela precisa ser a chave DESTE golpe.
  it('Autodestruicao e Explosao estao as duas na lista de auto-KO', () => {
    expect(SELF_DESTRUCT_ABILITY_KEYS.has('self_destruct')).toBe(true)
    expect(SELF_DESTRUCT_ABILITY_KEYS.has('explosion')).toBe(true)
    expect(ABILITIES_DATA.self_destruct?.power).toBeGreaterThan(0)
  })
})
