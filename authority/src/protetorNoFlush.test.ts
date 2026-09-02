// PH-217/236/241: o protetor da sala (Guardian/Lord do bioma piloto) tem que
// ATRAVESSAR a janela de flush. `world.protetorPendente` vive so em memoria;
// desde o PH-241 ele mora em `sala_protetor` (tabela dedicada, nao mais
// colunas `boss_*` em `game_sessions`) — NINGUEM lia ou gravava antes do
// PH-217, o servidor re-sorteava o protetor a cada reconstrucao de mundo
// (~30s), o RNG dele saia de sincronia com o do cliente e a sala do bioma
// piloto podia nunca fechar.
//
// `payloadDoProtetor` (monta o `p_protetor` jsonb pra `gravar_flush_de_sessao`)
// e `protetorDaLinha` (reconstroi de volta a partir do `sala_protetor`
// embutido) NAO sao mais round-trip simetrico como o par antigo
// (`colunasDoProtetor`/`protetorDaLinha`) era — uma monta jsonb camelCase de
// ENTRADA pra RPC, a outra le colunas relacionais snake_case de SAIDA de um
// SELECT. Testados separados, cada um pelo seu proprio contrato.
import { describe, expect, it } from 'vitest'
import type { ProtetorPendente } from '#engine'
import { payloadDoProtetor, protetorDaLinha, type LinhaSessao, type LinhaSalaProtetor } from './progresso.js'

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
    id: 's1', user_id: 'u1', map_id: 'igneo_e1', poke_uid: 'p1',
    seed: 1, rng_state: 0, rng_draws: 0, last_flush_at: '', simulated_seconds: 0,
    closed_at: null, flushing_since: null, sequence_index: 0, sequence_cleared: false,
    sala_indice: 0, sala_chave: 'volcano', sala_abates: 30, ciclos: 0,
    sala_protetor: null,
  }
}

function linhaSalaProtetor(): LinhaSalaProtetor {
  return {
    session_id: 's1',
    uid: PROTETOR.uid,
    species_id: PROTETOR.speciesId,
    encounter_id: PROTETOR.encounterId,
    level: PROTETOR.level,
    iv_hp: PROTETOR.ivs.hp, iv_atk_fis: PROTETOR.ivs.atkFis, iv_atk_esp: PROTETOR.ivs.atkEsp,
    iv_def: PROTETOR.ivs.def, iv_def_esp: PROTETOR.ivs.defEsp, iv_speed: PROTETOR.ivs.speed,
    rarity: PROTETOR.rarity,
    is_shiny: PROTETOR.isShiny,
    nature: PROTETOR.nature ?? null,
    trait: PROTETOR.trait ?? null,
    hp_atual: PROTETOR.hpAtual,
    tipo: 'lord',
  }
}

describe('payloadDoProtetor — monta o jsonb de entrada da RPC', () => {
  it('protetor presente vira objeto com todos os campos + tipo', () => {
    expect(payloadDoProtetor(PROTETOR, 'guardian')).toEqual({
      uid: PROTETOR.uid, speciesId: PROTETOR.speciesId, encounterId: PROTETOR.encounterId,
      level: PROTETOR.level, ivs: PROTETOR.ivs, rarity: PROTETOR.rarity, isShiny: PROTETOR.isShiny,
      nature: PROTETOR.nature, trait: PROTETOR.trait, hpAtual: PROTETOR.hpAtual, tipo: 'guardian',
    })
  })

  it('protetor null vira null (a RPC deleta a linha de sala_protetor)', () => {
    expect(payloadDoProtetor(null, null)).toBeNull()
  })

  it('isShiny false sobrevive (nao vira null/undefined no jsonb)', () => {
    const semShiny: ProtetorPendente = { ...PROTETOR, isShiny: false }
    expect(payloadDoProtetor(semShiny, 'lord')?.isShiny).toBe(false)
  })

  it('trait/nature ausentes viram null explicito, nao undefined', () => {
    const semTraitNature: ProtetorPendente = { ...PROTETOR, trait: undefined, nature: undefined }
    const payload = payloadDoProtetor(semTraitNature, 'lord')!
    expect(payload.trait).toBeNull()
    expect(payload.nature).toBeNull()
  })
})

describe('protetorDaLinha — reconstroi a partir do sala_protetor embutido', () => {
  it('sala_protetor presente reconstroi o ProtetorPendente', () => {
    const linha = { ...linhaBase(), sala_protetor: linhaSalaProtetor() }
    expect(protetorDaLinha(linha)).toEqual(PROTETOR)
  })

  it('sala_protetor null (protetor resolvido, ou sala nao pede) => null', () => {
    expect(protetorDaLinha(linhaBase())).toBeNull()
  })

  it('sala_protetor ausente (undefined — insert sem embed) => null, mesmo tratamento de null', () => {
    const linha = { ...linhaBase() }
    delete (linha as Partial<LinhaSessao>).sala_protetor
    expect(protetorDaLinha(linha)).toBeNull()
  })

  it('PostgREST devolvendo numeric/smallint como string: Number() normaliza', () => {
    const p = linhaSalaProtetor()
    const comStrings: LinhaSalaProtetor = {
      ...p,
      level: String(p.level), iv_hp: String(p.iv_hp), iv_speed: String(p.iv_speed), hp_atual: String(p.hp_atual),
    }
    const lido = protetorDaLinha({ ...linhaBase(), sala_protetor: comStrings })!
    expect(lido.level).toBe(PROTETOR.level)
    expect(lido.ivs.hp).toBe(PROTETOR.ivs.hp)
    expect(lido.ivs.speed).toBe(PROTETOR.ivs.speed)
    expect(lido.hpAtual).toBe(PROTETOR.hpAtual)
    expect(typeof lido.level).toBe('number')
  })

  it('isShiny false sobrevive ao round-trip (nao vira null)', () => {
    const semShiny = { ...linhaSalaProtetor(), is_shiny: false }
    const linha = { ...linhaBase(), sala_protetor: semShiny }
    expect(protetorDaLinha(linha)!.isShiny).toBe(false)
  })

  it('trait/nature null na coluna viram undefined no ProtetorPendente (nao null)', () => {
    const semTraitNature = { ...linhaSalaProtetor(), trait: null, nature: null }
    const linha = { ...linhaBase(), sala_protetor: semTraitNature }
    const lido = protetorDaLinha(linha)!
    expect(lido.trait).toBeUndefined()
    expect(lido.nature).toBeUndefined()
  })
})
