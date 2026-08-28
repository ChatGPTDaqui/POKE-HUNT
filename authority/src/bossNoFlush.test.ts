// PH-217/236: o protetor da sala (Guardian/Lord do bioma piloto) tem que
// ATRAVESSAR a janela de flush. `world.protetorPendente` vive so em memoria;
// as 15 colunas `game_sessions.boss_*` (migrations PH-201 + boss_aparencia,
// nome de coluna mantido ate a migration do PH-241) existiam mas NINGUEM
// lia ou gravava — o servidor re-sorteava o protetor a cada reconstrucao de
// mundo (~30s), o RNG dele saia de sincronia com o do cliente e a sala do
// bioma piloto podia nunca fechar.
//
// `protetorDaLinha` e `colunasDoProtetor` sao o par leitura/escrita. Este
// arquivo tranca a invariante: o que uma grava, a outra le de volta IGUAL.
import { describe, expect, it } from 'vitest'
import type { ProtetorPendente } from '#engine'
import { protetorDaLinha, colunasDoProtetor, type LinhaSessao } from './progresso.js'

const PROTETOR: ProtetorPendente = {
  uid: '11111111-2222-3333-4444-555555555555',
  speciesId: 'charizard',
  encounterId: 'volcano_charizard',
  level: 30,
  ivs: { hp: 20, atkFis: 31, atkEsp: 25, def: 28, defEsp: 22, speed: 30 },
  rarity: 'raro',
  isShiny: true,
  nature: 'adamant',
  trait: 'blaze',
  hpAtual: 47,
}

// So os campos que os helpers tocam — o resto de LinhaSessao nao importa aqui.
function linhaBase(): LinhaSessao {
  return {
    id: 's1', user_id: 'u1', map_id: 'igneo_faixa1', poke_uid: 'p1',
    seed: 1, rng_state: 0, rng_draws: 0, last_flush_at: '', simulated_seconds: 0,
    closed_at: null, flushing_since: null, sequence_index: 0, sequence_cleared: false,
    sala_indice: 0, sala_chave: 'volcano', sala_abates: 30, ciclos: 0,
    boss_uid: null, boss_species_id: null, boss_encounter_id: null, boss_level: null,
    boss_iv_hp: null, boss_iv_atk_fis: null, boss_iv_atk_esp: null, boss_iv_def: null,
    boss_iv_def_esp: null, boss_iv_speed: null, boss_rarity: null, boss_is_shiny: null,
    boss_nature: null, boss_trait: null, boss_hp_atual: null,
  }
}

describe('protetorDaLinha / colunasDoProtetor — round-trip pelo flush (PH-217)', () => {
  it('grava e le de volta o mesmo protetor', () => {
    const linha = { ...linhaBase(), ...colunasDoProtetor(PROTETOR) } as unknown as LinhaSessao
    expect(protetorDaLinha(linha)).toEqual(PROTETOR)
  })

  it('protetor resolvido: colunasDoProtetor(null) zera as 15 colunas e protetorDaLinha volta null', () => {
    const cols = colunasDoProtetor(null)
    expect(Object.values(cols).every((v) => v === null)).toBe(true)
    const linha = { ...linhaBase(), ...cols } as unknown as LinhaSessao
    expect(protetorDaLinha(linha)).toBeNull()
  })

  it('linha sem protetor (boss_uid nulo) => null, mesmo com sala em quota fechada', () => {
    expect(protetorDaLinha(linhaBase())).toBeNull()
  })

  it('PostgREST devolvendo numeric como string: Number() normaliza', () => {
    const linha = { ...linhaBase(), ...colunasDoProtetor(PROTETOR) } as Record<string, unknown>
    for (const k of ['boss_level', 'boss_iv_hp', 'boss_iv_speed', 'boss_hp_atual']) {
      linha[k] = String(linha[k])
    }
    const lido = protetorDaLinha(linha as unknown as LinhaSessao)!
    expect(lido.level).toBe(PROTETOR.level)
    expect(lido.ivs.hp).toBe(PROTETOR.ivs.hp)
    expect(lido.ivs.speed).toBe(PROTETOR.ivs.speed)
    expect(lido.hpAtual).toBe(PROTETOR.hpAtual)
    expect(typeof lido.level).toBe('number')
  })

  it('isShiny false sobrevive ao round-trip (nao vira null)', () => {
    const semShiny: ProtetorPendente = { ...PROTETOR, isShiny: false }
    const linha = { ...linhaBase(), ...colunasDoProtetor(semShiny) } as unknown as LinhaSessao
    expect(protetorDaLinha(linha)!.isShiny).toBe(false)
  })

  it('protetor sem trait (especie sem habilidade) sobrevive como undefined', () => {
    const semTrait: ProtetorPendente = { ...PROTETOR, trait: undefined }
    const linha = { ...linhaBase(), ...colunasDoProtetor(semTrait) } as unknown as LinhaSessao
    const lido = protetorDaLinha(linha)!
    expect(lido.trait).toBeUndefined()
    expect(colunasDoProtetor(semTrait).boss_trait).toBeNull()
  })
})
