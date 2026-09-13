import { describe, expect, it } from 'vitest'
import { criarMundoPvpReplay } from '@/features/pvp/pvpWorld'
import { stepPvpVisual } from './pvpSystem'
import type { PvpEventoRemoto } from '@/data/remote/servidor'

function evento(overrides: Partial<PvpEventoRemoto>): PvpEventoRemoto {
  return {
    atacante: 'Charmander',
    defensor: 'Squirtle',
    golpe: 'Ataque Básico',
    dano: 5,
    hpRestante: 95,
    efetividade: 1,
    nocaute: false,
    atacanteLado: 'anfitriao',
    atacanteSpeciesId: 'charmander',
    atacanteShiny: false,
    defensorLado: 'convidado',
    defensorSpeciesId: 'squirtle',
    defensorShiny: false,
    hpMaximoDefensor: 100,
    ...overrides,
  }
}

// dt bem maior que qualquer espera do stepper: cada chamada ou zera uma
// espera pendente ou processa um evento — nunca as duas coisas juntas (ver
// pvpReplaySystem.ts#stepPvpReplay). N chamadas com folga cobre N eventos.
function avancarReplay(world: ReturnType<typeof criarMundoPvpReplay>, vezes: number): void {
  for (let i = 0; i < vezes; i++) stepPvpVisual(world, 10)
}

describe('replay do PvP (PH-532)', () => {
  it('monta o mundo a partir do primeiro evento e comeca em replay', () => {
    const eventos = [evento({})]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    expect(world.pvp?.estado).toBe('replay')
    expect(world.player?.poke.speciesId).toBe('charmander')
    expect(world.enemies[0]?.poke.speciesId).toBe('squirtle')
  })

  it('dano >= 30% do hp maximo dispara o flinch (hurtAnimTimer) no defensor', () => {
    const eventos = [evento({ dano: 40, hpRestante: 60, hpMaximoDefensor: 100 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    avancarReplay(world, 2)
    const defensor = world.enemies[0]
    expect(defensor?.poke.hp).toBe(60)
    expect(defensor?.hurtAnimTimer).toBeGreaterThan(0)
  })

  it('dano abaixo de 30% NAO dispara o flinch', () => {
    const eventos = [evento({ dano: 10, hpRestante: 90, hpMaximoDefensor: 100 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'vitoria', 'Rival')
    avancarReplay(world, 2)
    expect(world.enemies[0]?.hurtAnimTimer ?? 0).toBe(0)
  })

  it('esgotar os eventos aplica o resultadoFinal no estado do pvp', () => {
    const eventos = [evento({ nocaute: true, dano: 100, hpRestante: 0 })]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'derrota', 'Rival')
    avancarReplay(world, 4)
    expect(world.pvp?.estado).toBe('derrota')
  })

  it('troca de especie no meio do replay quando o evento seguinte muda quem esta lutando', () => {
    const eventos = [
      evento({ atacanteSpeciesId: 'charmander', defensorSpeciesId: 'squirtle', nocaute: true, dano: 100, hpRestante: 0 }),
      evento({
        atacanteLado: 'convidado', atacanteSpeciesId: 'wartortle',
        defensorLado: 'anfitriao', defensorSpeciesId: 'charmander',
        dano: 5, hpRestante: 95, hpMaximoDefensor: 100,
      }),
    ]
    const world = criarMundoPvpReplay(eventos, 'anfitriao', 'derrota', 'Rival')
    avancarReplay(world, 4)
    expect(world.enemies[0]?.poke.speciesId).toBe('wartortle')
  })
})
