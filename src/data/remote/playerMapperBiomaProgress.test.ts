// PH-224: bioma_progress era coluna orfa — nada em GameStateData/playerMapper
// lia ou escrevia nela. Este teste tranca o round-trip (o que grava, o
// snapshot le de volta igual) e o merge-com-default (linha antiga, sem a
// coluna, cai no default em vez de undefined — quebraria o gate PH-227).
import { describe, expect, it } from 'vitest'

import { biomaProgressDefault } from '@/data/biomas'
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

describe('bioma_progress — round-trip pelo mapper (PH-224)', () => {
  it('linha sem a coluna (jogador antigo) cai no default, nao em undefined', () => {
    const snap = snapshotComPlayer({ bioma_progress: null })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual(biomaProgressDefault())
  })

  it('grava e le de volta o mesmo progresso', () => {
    const progresso = { faixa1: 4, faixa2: 0, faixa3: 0 }
    const snap = snapshotComPlayer({ bioma_progress: progresso })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual(progresso)

    const row = gameStateToPlayerRow(USER, estado)
    expect(row.bioma_progress).toEqual(progresso)
  })

  it('faixa ausente na linha (coluna existe mas so tem 1 faixa gravada) faz merge, nao substitui as outras por undefined', () => {
    const snap = snapshotComPlayer({ bioma_progress: { faixa2: 7 } })
    const estado = snapshotToGameState(snap, defaultGameStateData())
    expect(estado.biomaProgress).toEqual({ faixa1: 0, faixa2: 7, faixa3: 0 })
  })
})
