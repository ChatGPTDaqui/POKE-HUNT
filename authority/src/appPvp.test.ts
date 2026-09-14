// PH-535 Fase 2: PvP ranqueado/amistoso passa a usar o MESMO motor real
// headless do Modo Duelo (`confrontoHeadless.ts`), em vez de
// `pvpSimulator.ts`. Prova que uma LINHA CRUA de `pvp_time`/
// `pvp_sessao.*_time` vira um time que o motor real aceita e resolve
// corretamente, e que a traducao de eventos usa o vocabulario certo
// (anfitriao/convidado) pros dois lados.
import { describe, expect, it } from 'vitest'
import { eventosParaCliente, rodarConfronto } from './confrontoHeadless.js'
import { montarTime } from './appPvp.js'
import type { LinhaTimePvp } from './pvpRow.js'

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

  it('golpe de TM que a linha nao tem continua caindo', () => {
    const [poke] = montarTime([linha({
      species_id: 'ludicolo',
      active_abilities: ['scald', 'mega_drain'],
    })])
    expect(poke.activeAbilities).not.toContain('scald')
  })
})

describe('PvP via motor compartilhado — anfitriao (A) vs convidado (B)', () => {
  it('anfitriao muito mais forte vence, eventos traduzidos pro vocabulario do client', () => {
    const anfitriao = montarTime([linha({ id: 'anf-1', stat_atk_fis: 500, stat_atk_esp: 500 })])
    const convidado = montarTime([linha({ id: 'conv-1', species_id: 'rattata', level: 5, stat_hp: 1, stat_def: 1, stat_def_esp: 1, stat_speed: 1 })])

    const resultado = rodarConfronto(anfitriao, convidado)
    expect(resultado.vencedor).toBe('A')

    const eventos = eventosParaCliente(resultado.eventos)
    expect(eventos.length).toBeGreaterThan(0)
    // Nao "o primeiro evento e do anfitriao": Rattata Nv5 tem Quick Attack
    // (prioridade) e abre a luta em ~40% das sementes.
    expect(eventos.some((e) => e.atacanteLado === 'anfitriao')).toBe(true)
    expect(eventos.every((e) => e.atacanteLado === 'anfitriao' || e.defensorLado === 'convidado' || e.atacanteLado === 'convidado')).toBe(true)
  })

  it('convidado com time completo (6) troca normalmente ao perder o ativo', () => {
    const anfitriao = montarTime([linha({ id: 'anf-1', stat_atk_fis: 60, stat_atk_esp: 60 })]) // forte, nao esmagador
    const convidado = montarTime([
      linha({ id: 'c1', species_id: 'rattata', level: 5, stat_hp: 1, stat_def: 1, stat_def_esp: 1, stat_speed: 1 }),
      linha({ id: 'c2', species_id: 'gyarados', stat_hp: 300, stat_def: 200, stat_def_esp: 200 }),
    ])

    const resultado = rodarConfronto(anfitriao, convidado)
    const gyaradosParticipou = resultado.eventos.some(
      (e) => e.atacanteSpeciesId === 'gyarados' || e.defensorSpeciesId === 'gyarados',
    )
    expect(gyaradosParticipou).toBe(true)
  })

  // PH-539: o convidado e `world.enemies[0]`, e o motor escolhia golpe de
  // inimigo pelo kit de selvagem — o time montado na Build era ignorado.
  it('convidado luta com os golpes que escolheu, nao com o kit de selvagem', () => {
    const anfitriao = montarTime([linha({ id: 'anf-1', species_id: 'snorlax', stat_hp: 5000, stat_def: 400, stat_def_esp: 400, stat_atk_fis: 10, stat_atk_esp: 10, stat_speed: 1 })])
    const convidado = montarTime([linha({
      id: 'conv-1', species_id: 'ludicolo', stat_speed: 300,
      golpes_de_maquina: ['scald', 'ice_beam', 'energy_ball', 'focus_blast'],
      active_abilities: ['scald', 'ice_beam', 'energy_ball', 'focus_blast'],
    })])

    const resultado = rodarConfronto(anfitriao, convidado, { ladoBGolpesProprios: true })
    const golpesDoConvidado = new Set(resultado.eventos.filter((e) => e.atacanteLado !== 'player').map((e) => e.golpe))
    expect(golpesDoConvidado.size).toBeGreaterThan(0)
    for (const g of golpesDoConvidado) expect(['Scald', 'Ice Beam', 'Energy Ball', 'Focus Blast']).toContain(g)
  })
})
