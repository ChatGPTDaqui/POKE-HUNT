// A escolha dos 4 golpes chega SANEADA da carga.
//
// BUG QUE ISTO TRANCA: `active_abilities` podia guardar chave que o learnset
// atual nao tem mais (regra do Recordador na v6.8, rename de 15 chaves na
// migracao do Ultra Sun), e `unlocked_abilities` — que a RPC
// `definir_golpes_ativos` usa pra validar — e reescrita com o recalculo fresco
// em todo flush. Lendo a coluna crua, a tela mandava a chave orfa de volta em
// cada edicao e o Postgres recusava a chamada inteira: o POKE ficava com a
// escolha travada, sem nada visivel pra desmarcar.
//
// Nada disso lanca erro em lugar nenhum — o sintoma e "nao consigo trocar meu
// golpe", que so aparece com um POKE de dado antigo em maos.
import { describe, expect, it } from 'vitest'

import { rowToPoke, type PokemonRow } from './playerMapper'
import { SPECIES } from '@/data/pokes'
import { golpesAprendidosAte } from '@/data/activeAbilities'

const ESPECIE = 'charizard'
const NIVEL = 80

function linha(activeAbilities: string[] | null): PokemonRow {
  const conhecidos = golpesAprendidosAte(SPECIES[ESPECIE], NIVEL)
  return {
    id: '11111111-1111-1111-1111-111111111111',
    user_id: 'u1',
    species_id: ESPECIE,
    level: NIVEL,
    exp: 0,
    hp: 100,
    is_shiny: false,
    rarity: 'comum',
    location: 'team',
    team_slot: 0,
    iv_hp: 10, iv_atk_fis: 10, iv_atk_esp: 10, iv_def: 10, iv_def_esp: 10, iv_speed: 10,
    stat_hp: 100, stat_atk_fis: 50, stat_atk_esp: 50, stat_def: 50, stat_def_esp: 50, stat_speed: 50,
    unlocked_abilities: conhecidos,
    active_abilities: activeAbilities,
    disabled_abilities: {},
    status: null,
    status_turns: null,
    original_trainer: null,
    nature: null,
    trait: null,
    locked: false,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  } as unknown as PokemonRow
}

describe('rowToPoke: escolha de golpes', () => {
  it('descarta a chave que o learnset atual nao tem mais', () => {
    const validos = golpesAprendidosAte(SPECIES[ESPECIE], NIVEL).slice(0, 2)
    const poke = rowToPoke(linha(['golpe_do_recordador_extinto', ...validos]))

    expect(poke.activeAbilities).not.toContain('golpe_do_recordador_extinto')
    // O slot que a chave orfa ocupava e recomposto com golpe que o POKE
    // conhece — a escolha nao encolhe em silencio.
    expect(poke.activeAbilities).toHaveLength(3)
    for (const key of poke.activeAbilities ?? []) {
      expect(poke.unlockedAbilities.includes(key) || key === 'basic_attack').toBe(true)
    }
  })

  it('o que a carga devolve e sempre um payload que a RPC aceita', () => {
    // A RPC valida cada id contra `unlocked_abilities` (mais a isencao do
    // Ataque Basico), recusa repetido e recusa mais de 4. Se a carga jamais
    // produzir lista fora disso, nenhuma edicao pode ser recusada por dado
    // velho.
    const validos = golpesAprendidosAte(SPECIES[ESPECIE], NIVEL)
    const poke = rowToPoke(linha([
      'chave_inventada', validos[0], validos[0], 'basic_attack', validos[1],
    ]))
    const escolha = poke.activeAbilities ?? []

    expect(escolha.length).toBeLessThanOrEqual(4)
    expect(new Set(escolha).size).toBe(escolha.length)
    for (const key of escolha) {
      expect(poke.unlockedAbilities.includes(key) || key === 'basic_attack').toBe(true)
    }
  })

  it('escolha vazia continua vazia — e opcao valida, nao dado corrompido', () => {
    // Zero golpes = o POKE nao ataca (combatSystem#pickAbility nao tem
    // fallback pro jogador). Recompor pra 4 aqui desfaria a escolha dele.
    expect(rowToPoke(linha([])).activeAbilities).toEqual([])
  })

  it('coluna nula cai no padrao, como antes', () => {
    const poke = rowToPoke(linha(null))
    expect(poke.activeAbilities?.length).toBeGreaterThan(0)
  })

  it('o Ataque Basico sobrevive ao saneamento (nunca esta em unlocked_abilities)', () => {
    const validos = golpesAprendidosAte(SPECIES[ESPECIE], NIVEL)
    const poke = rowToPoke(linha(['basic_attack', validos[0]]))
    expect(poke.activeAbilities).toEqual(['basic_attack', validos[0]])
  })
})
