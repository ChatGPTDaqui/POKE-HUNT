import { describe, expect, it } from 'vitest'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { simularPvp } from './pvpSimulator'

describe('simularPvp', () => {
  it('usa o time do jogador contra o POKE desafiante e devolve vencedor/log', () => {
    const jogador = createPokeInstance(createRng(1), 'charizard', 70)
    const oponente = createPokeInstance(createRng(2), 'bulbasaur', 20)

    const resultado = simularPvp(
      { nome: 'Jogador', time: [jogador] },
      { nome: 'Rival', time: [oponente] },
    )

    expect(resultado.vencedor).toBe('jogador')
    expect(resultado.jogadorRestantes).toBe(1)
    expect(resultado.oponenteRestantes).toBe(0)
    expect(resultado.eventos.length).toBeGreaterThan(0)
    expect(resultado.eventos.some((e) => e.nocaute)).toBe(true)
  })

  it('cura clones para o duelo sem alterar os POKEs originais', () => {
    const ferido = createPokeInstance(createRng(3), 'squirtle', 40)
    const hpOriginal = 1
    ferido.hp = hpOriginal
    const oponente = createPokeInstance(createRng(4), 'charmander', 10)

    simularPvp(
      { nome: 'Jogador', time: [ferido] },
      { nome: 'Rival', time: [oponente] },
    )

    expect(ferido.hp).toBe(hpOriginal)
    expect(oponente.hp).toBe(oponente.stats.hp)
  })
})
