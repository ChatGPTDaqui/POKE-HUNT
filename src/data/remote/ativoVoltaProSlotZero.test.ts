// PH-382: save gravado com `active_team_index != 0` se conserta na carga.
//
// O invariante do modelo e `team[0]` = POKE em campo, e o banco o impoe:
// `definir_ativo` grava `active_team_index = 0` sempre. Mas a troca automatica
// por desmaio apontava o indice sem rotacionar a equipe, e o flush levou o
// estado torto pro banco — medido numa conta real em 01/09
// (`active_team_index = 1`, com o POKE de campo no `team_slot 1`).
//
// Consertar na carga vale mais que uma migration de dado: `snapshotToGameState`
// e a MESMA funcao que o servidor usa pra montar o estado (ver
// authority/src/progresso.ts), entao os dois lados passam a ver a equipe
// normalizada sem nenhum passo manual, e um save que volte a torcer por outro
// caminho tambem sai consertado.
//
// A rotacao preserva quem esta em campo. Zerar o indice sem rotacionar seria
// mais simples e ERRADO: trocaria o POKE de campo debaixo do jogador.
import { describe, expect, it } from 'vitest'

import { defaultGameStateData } from '@/stores/gameStateDefaults'
import { snapshotToGameState, type PlayerSnapshot } from './playerMapper'

function linhaDePoke(id: string, speciesId: string, teamSlot: number, level = 10) {
  return {
    id,
    user_id: 'user-1',
    species_id: speciesId,
    location: 'team',
    team_slot: teamSlot,
    level,
    exp: 0,
    hp: 20,
    is_shiny: false,
    rarity: 'comum',
    locked: false,
    iv_hp: 10, iv_atk_fis: 10, iv_atk_esp: 10, iv_def: 10, iv_def_esp: 10, iv_speed: 10,
    stat_hp: 20, stat_atk_fis: 10, stat_atk_esp: 10, stat_def: 5, stat_def_esp: 5, stat_speed: 10,
    unlocked_abilities: null,
    disabled_abilities: null,
    active_abilities: null,
    status: null,
    status_turns: null,
    nature: null,
    trait: null,
    original_trainer: null,
    created_at: '2026-09-01T00:00:00Z',
  }
}

function snapshot(activeTeamIndex: number, pokemon: ReturnType<typeof linhaDePoke>[]): PlayerSnapshot {
  return {
    player: {
      user_id: 'user-1',
      active_team_index: activeTeamIndex,
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
      auto_lure_config: null,
      perf_stats: null,
      trainer_name: 'Treinador',
      trainer_level: 1,
      trainer_exp: 0,
      bioma_progress: null,
      updated_at: '',
    },
    pokemon,
    items: [],
    pokedex: [],
    autoCatchRules: [],
    missoesReivindicadas: [],
    especialidades: [],
  } as unknown as PlayerSnapshot
}

describe('o ativo volta pro slot 0 na carga (PH-382)', () => {
  it('rotaciona a equipe e zera o indice, mantendo em campo quem estava em campo', () => {
    // A forma exata do save torto medido em producao: Eevee Lv1 no slot 0,
    // Quagsire (o que estava lutando) no slot 1, indice ativo em 1.
    const estado = snapshotToGameState(
      snapshot(1, [
        linhaDePoke('a', 'eevee', 0, 1),
        linhaDePoke('b', 'quagsire', 1, 64),
        linhaDePoke('c', 'entei', 2, 128),
      ]),
      defaultGameStateData(),
    )

    expect(estado.activeIndex).toBe(0)
    expect(estado.team.map((p) => p.uid)).toEqual(['b', 'a', 'c'])
    // O que o jogador ve em campo nao muda: continua o Quagsire.
    expect(estado.team[estado.activeIndex].speciesId).toBe('quagsire')
  })

  it('save ja correto passa intacto', () => {
    const estado = snapshotToGameState(
      snapshot(0, [linhaDePoke('a', 'eevee', 0), linhaDePoke('b', 'quagsire', 1)]),
      defaultGameStateData(),
    )
    expect(estado.activeIndex).toBe(0)
    expect(estado.team.map((p) => p.uid)).toEqual(['a', 'b'])
  })

  it('indice apontando pra fora da equipe cai no slot 0 em vez de estourar', () => {
    // O caso que o clamp antigo tratava (POKE removido noutro device).
    const estado = snapshotToGameState(
      snapshot(5, [linhaDePoke('a', 'eevee', 0), linhaDePoke('b', 'quagsire', 1)]),
      defaultGameStateData(),
    )
    expect(estado.activeIndex).toBe(0)
    expect(estado.team.map((p) => p.uid)).toEqual(['b', 'a'])
  })

  it('equipe vazia nao estoura', () => {
    const estado = snapshotToGameState(snapshot(0, []), defaultGameStateData())
    expect(estado.team).toEqual([])
    expect(estado.activeIndex).toBe(0)
  })
})
