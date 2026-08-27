// PH-217: o boss da sala (mini/ultimate do bioma piloto) tem que ATRAVESSAR a
// janela de flush. `world.bossPendente` vive so em memoria; as 15 colunas
// `game_sessions.boss_*` (migrations PH-201 + boss_aparencia) existiam mas
// NINGUEM lia ou gravava — o servidor re-sorteava o boss a cada reconstrucao
// de mundo (~30s), o RNG dele saia de sincronia com o do cliente e a sala do
// bioma piloto podia nunca fechar.
//
// `bossDaLinha` e `colunasDoBoss` sao o par leitura/escrita. Este arquivo
// tranca a invariante: o que uma grava, a outra le de volta IGUAL.
import { describe, expect, it } from 'vitest'
import type { BossPendente } from '#engine'
import { bossDaLinha, colunasDoBoss, type LinhaSessao } from './progresso.js'

const BOSS: BossPendente = {
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

describe('bossDaLinha / colunasDoBoss — round-trip pelo flush (PH-217)', () => {
  it('grava e le de volta o mesmo boss', () => {
    const linha = { ...linhaBase(), ...colunasDoBoss(BOSS) } as unknown as LinhaSessao
    expect(bossDaLinha(linha)).toEqual(BOSS)
  })

  it('boss resolvido: colunasDoBoss(null) zera as 15 colunas e bossDaLinha volta null', () => {
    const cols = colunasDoBoss(null)
    expect(Object.values(cols).every((v) => v === null)).toBe(true)
    const linha = { ...linhaBase(), ...cols } as unknown as LinhaSessao
    expect(bossDaLinha(linha)).toBeNull()
  })

  it('linha sem boss (boss_uid nulo) => null, mesmo com sala em quota fechada', () => {
    expect(bossDaLinha(linhaBase())).toBeNull()
  })

  it('PostgREST devolvendo numeric como string: Number() normaliza', () => {
    const linha = { ...linhaBase(), ...colunasDoBoss(BOSS) } as Record<string, unknown>
    for (const k of ['boss_level', 'boss_iv_hp', 'boss_iv_speed', 'boss_hp_atual']) {
      linha[k] = String(linha[k])
    }
    const lido = bossDaLinha(linha as unknown as LinhaSessao)!
    expect(lido.level).toBe(BOSS.level)
    expect(lido.ivs.hp).toBe(BOSS.ivs.hp)
    expect(lido.ivs.speed).toBe(BOSS.ivs.speed)
    expect(lido.hpAtual).toBe(BOSS.hpAtual)
    expect(typeof lido.level).toBe('number')
  })

  it('isShiny false sobrevive ao round-trip (nao vira null)', () => {
    const semShiny: BossPendente = { ...BOSS, isShiny: false }
    const linha = { ...linhaBase(), ...colunasDoBoss(semShiny) } as unknown as LinhaSessao
    expect(bossDaLinha(linha)!.isShiny).toBe(false)
  })

  it('boss sem trait (especie sem habilidade) sobrevive como undefined', () => {
    const semTrait: BossPendente = { ...BOSS, trait: undefined }
    const linha = { ...linhaBase(), ...colunasDoBoss(semTrait) } as unknown as LinhaSessao
    const lido = bossDaLinha(linha)!
    expect(lido.trait).toBeUndefined()
    expect(colunasDoBoss(semTrait).boss_trait).toBeNull()
  })
})
