// Prova que uma LINHA CRUA de `pvp_time`/`pvp_sessao.*_time` vira um time
// que o motor aceita, e que a arena (PH-540) resolve o PvP de forma
// deterministica pela semente da sessao.
import { describe, expect, it } from 'vitest'
import { LIVE_SIM_STEP_SECONDS, rodarArena, sementeDaSessao } from '#engine'
import { montarTime } from './appPvp.js'
import type { LinhaTimePvp } from '#engine'

function linha(overrides: Partial<LinhaTimePvp> = {}): LinhaTimePvp {
  return {
    id: 'poke-1', species_id: 'tyranitar', level: 80, is_shiny: false, rarity: 'legendary',
    stat_hp: 300, stat_atk_fis: 400, stat_atk_esp: 400, stat_def: 200, stat_def_esp: 200, stat_speed: 200,
    active_abilities: null,
    ...overrides,
  }
}

describe('montarTime (PH-535/536)', () => {
  it('linha valida vira PokeInstance com HP cheio e sem status', () => {
    const time = montarTime([linha()])
    expect(time).toHaveLength(1)
    expect(time[0].hp).toBe(300)
    expect(time[0].status).toBeNull()
  })

  it('especie desconhecida e descartada em silencio (nao quebra o time inteiro)', () => {
    const time = montarTime([linha({ id: 'a', species_id: 'especie-que-nao-existe' }), linha({ id: 'b' })])
    expect(time).toHaveLength(1)
    expect(time[0].uid).toBe('b')
  })

  it('null vira time vazio', () => {
    expect(montarTime(null)).toEqual([])
  })

  // PH-539: golpe de TM escolhido pelo jogador era descartado no PvP porque o
  // snapshot so contava o learnset de nivel.
  it('golpe de TM em golpes_de_maquina sobrevive como golpe ativo', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      golpes_de_maquina: ['scald', 'ice_beam'],
      active_abilities: ['scald', 'ice_beam', 'mega_drain', 'nature_power'],
    })])
    expect(poke.activeAbilities).toEqual(['scald', 'ice_beam', 'mega_drain', 'nature_power'])
    expect(poke.unlockedAbilities).toContain('scald')
  })

  // PH-563: o slot do preset pode ter kit proprio, diferente do kit do modo livre.
  it('golpes_escolhidos do preset vencem active_abilities', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      golpes_de_maquina: ['scald', 'ice_beam'],
      active_abilities: ['mega_drain', 'nature_power'],
      golpes_escolhidos: ['ice_beam', 'scald'],
    })])
    expect(poke.activeAbilities).toEqual(['ice_beam', 'scald'])
  })

  it('golpes_escolhidos vazio cai em active_abilities', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      active_abilities: ['mega_drain', 'nature_power'],
      golpes_escolhidos: [],
    })])
    expect(poke.activeAbilities).toEqual(['mega_drain', 'nature_power'])
  })

  it('golpe escolhido que o POKE nao conhece e saneado, nao passa', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      active_abilities: ['mega_drain'],
      golpes_escolhidos: ['scald', 'mega_drain'],
    })])
    expect(poke.activeAbilities).not.toContain('scald')
    expect(poke.activeAbilities).toContain('mega_drain')
  })

  it('golpe de TM que a linha nao tem continua caindo', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      active_abilities: ['scald', 'mega_drain'],
    })])
    expect(poke.activeAbilities).not.toContain('scald')
  })
})

describe('PvP via arena (PH-540) — anfitriao (meu lado) vs convidado (rival)', () => {
  it('anfitriao muito mais forte vence; mesma semente da o mesmo veredito', () => {
    const anfitriao = montarTime([linha({ id: 'anf-1', stat_atk_fis: 500, stat_atk_esp: 500 })])
    const convidado = montarTime([linha({ id: 'conv-1', species_id: 'rattata', level: 5, stat_hp: 1, stat_def: 1, stat_def_esp: 1, stat_speed: 1 })])
    const semente = sementeDaSessao('00000000-0000-4000-8000-000000000001')
    const a = rodarArena({ semente, meuTime: anfitriao, rivalTime: convidado, nomeDoRival: '' }, LIVE_SIM_STEP_SECONDS)
    const b = rodarArena({ semente, meuTime: montarTime([linha({ id: 'anf-1', stat_atk_fis: 500, stat_atk_esp: 500 })]), rivalTime: montarTime([linha({ id: 'conv-1', species_id: 'rattata', level: 5, stat_hp: 1, stat_def: 1, stat_def_esp: 1, stat_speed: 1 })]), nomeDoRival: '' }, LIVE_SIM_STEP_SECONDS)
    expect(a.resultado).toBe('vitoria')
    expect(b.resultado).toBe(a.resultado)
    expect(b.ticks).toBe(a.ticks)
  })

  it('convidado com time completo troca ao perder o ativo e luta com o kit que escolheu', () => {
    const anfitriao = montarTime([linha({ id: 'anf-1', species_id: 'snorlax', stat_hp: 5000, stat_def: 400, stat_def_esp: 400, stat_atk_fis: 10, stat_atk_esp: 10, stat_speed: 1 })])
    const convidado = montarTime([
      linha({ id: 'c1', species_id: 'rattata', level: 5, stat_hp: 1, stat_def: 1, stat_def_esp: 1, stat_speed: 1 }),
      linha({ id: 'c2', species_id: 'ludicolo', stat_speed: 300, golpes_de_maquina: ['scald', 'ice_beam', 'energy_ball', 'focus_blast'], active_abilities: ['scald', 'ice_beam', 'energy_ball', 'focus_blast'] }),
    ])
    const { world } = rodarArena({ semente: 3, meuTime: anfitriao, rivalTime: convidado, nomeDoRival: '' }, LIVE_SIM_STEP_SECONDS)
    expect(world.arena!.indiceRival).toBe(1)
    const ludicolo = world.enemies.find((e) => e.poke.speciesId === 'ludicolo')!
    expect(ludicolo.golpesProprios).toBe(true)
    expect(ludicolo.poke.activeAbilities).toEqual(['scald', 'ice_beam', 'energy_ball', 'focus_blast'])
  })

  it('sementeDaSessao e estavel e distingue sessoes', () => {
    expect(sementeDaSessao('a')).toBe(sementeDaSessao('a'))
    expect(sementeDaSessao('a')).not.toBe(sementeDaSessao('b'))
  })
})
