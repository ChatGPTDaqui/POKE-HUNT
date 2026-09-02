// PH-224: bioma_progress era coluna orfa — nada em GameStateData/playerMapper
// lia ou escrevia nela. Este teste tranca o round-trip (o que grava, o
// snapshot le de volta igual) e o default (linha antiga, sem a coluna, cai no
// default em vez de undefined — quebraria o gate).
//
// PH-429: e tranca tambem a TRADUCAO, que e o caminho pelo qual save antigo
// (tres inteiros por faixa, mapId `<bioma>_faixa<N>`) continua jogavel. Falha
// aqui e silenciosa das duas formas possiveis: progresso zerado (o jogador
// perde o mundo aberto) ou progresso inflado (ele ganha o que nao conquistou).
import { describe, expect, it } from 'vitest'

import { progressoPorBiomaDefault, HUNT_DE_REFUGIO } from '@/data/progressoDeBioma'
import { defaultGameStateData } from '@/stores/gameStateDefaults'
import { gameStateToPlayerRow, snapshotToGameState, type PlayerSnapshot } from './playerMapper'

const USER = 'user-1'

function snapshotComPlayer(overrides: Partial<PlayerSnapshot['player']>): PlayerSnapshot {
  return {
    player: {
      user_id: USER,
      active_team_index: 0,
      gold: 0,
      diamonds: 0,
      current_map_id: null,
      unlocked_maps: [],
      unlocked_continents: [],
      auto_toggles: null,
      auto_pot_rules: null,
      auto_catch_config: null,
      auto_sell_config: null,
      auto_status_config: null,
      perf_stats: null,
      trainer_name: 'Treinador',
      trainer_level: 1,
      trainer_exp: 0,
      bioma_progress: null,
      updated_at: '',
      ...overrides,
    } as unknown as PlayerSnapshot['player'],
    pokemon: [],
    items: [],
    pokedex: [],
    autoCatchRules: [],
    missoesReivindicadas: [],
    especialidades: [],
  }
}
describe('bioma_progress — round-trip e traducao pelo mapper (PH-224/429)', () => {
  it('linha sem a coluna (jogador antigo) cai no default, nao em undefined', () => {
    const snap = snapshotComPlayer({ bioma_progress: null })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual(progressoPorBiomaDefault())
    // 12 chaves, uma por bioma, todas em zero.
    expect(Object.keys(estado.biomaProgress).length).toBe(12)
  })

  it('grava e le de volta o mesmo progresso, no formato novo', () => {
    const progresso = { ...progressoPorBiomaDefault(), marinho: 7, igneo: 2 }
    const snap = snapshotComPlayer({ bioma_progress: progresso })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual(progresso)

    const row = gameStateToPlayerRow(USER, estado)
    expect(row.bioma_progress).toEqual(progresso)
  })

  it('bioma ausente na linha vira 0, e nao undefined', () => {
    const snap = snapshotComPlayer({ bioma_progress: { marinho: 7 } })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual({ ...progressoPorBiomaDefault(), marinho: 7 })
  })

  // PH-429: a traducao do formato de faixa acontece NA CARGA, e o mapper e onde
  // ela precisa estar — nao no gate nem na tela, que leem o estado ja pronto.
  it('save de faixa antiga chega traduzido em estagio', () => {
    // `faixa1: 3` = venceu os 3 primeiros biomas da ORDEM LEGADA
    // (campo_aberto, subterraneo, marinho) na faixa1, que cobria Lv 1-30 = os
    // estagios 1 a 3.
    const snap = snapshotComPlayer({ bioma_progress: { faixa1: 3, faixa2: 0, faixa3: 0 } })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual({
      ...progressoPorBiomaDefault(),
      campo_aberto: 3, subterraneo: 3, marinho: 3,
    })
  })

  it('o que o mapper grava de volta ja e o formato novo, nao o antigo', () => {
    // A ida-e-volta e o que impede o formato antigo de voltar pro banco: se o
    // mapper lesse a faixa e a regravasse, a traducao rodaria pra sempre e
    // nunca convergiria.
    const snap = snapshotComPlayer({ bioma_progress: { faixa1: 2, faixa2: 0, faixa3: 0 } })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    const row = gameStateToPlayerRow(USER, estado)
    expect(row.bioma_progress).not.toHaveProperty('faixa1')
    expect(row.bioma_progress).toMatchObject({ campo_aberto: 3, subterraneo: 3 })
  })

  it('mapId de faixa antiga chega traduzido, e mapId desconhecido cai na hunt inicial', () => {
    const daFaixa = snapshotToGameState(
      snapshotComPlayer({ current_map_id: 'marinho_faixa2' }), defaultGameStateData(),
    )
    expect(daFaixa.currentMapId).toBe('marinho_e4')

    const inventado = snapshotToGameState(
      snapshotComPlayer({ current_map_id: 'bioma_que_nunca_existiu_faixa1' }), defaultGameStateData(),
    )
    expect(inventado.currentMapId).toBe(HUNT_DE_REFUGIO)

    // Estagio novo e hunt sem bioma passam intactos.
    expect(snapshotToGameState(
      snapshotComPlayer({ current_map_id: 'marinho_e7' }), defaultGameStateData(),
    ).currentMapId).toBe('marinho_e7')
    expect(snapshotToGameState(
      snapshotComPlayer({ current_map_id: 'route_46' }), defaultGameStateData(),
    ).currentMapId).toBe('route_46')
  })
})
