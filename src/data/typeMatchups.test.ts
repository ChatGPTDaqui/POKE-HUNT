import { describe, expect, it } from 'vitest'
import { SPECIES } from './pokes'
import { bestOffensiveMultiplier } from './typeMatchups'

// Badge de efetividade na lista de hunts (item 7): mostra quanto o POKE
// ativo acerta cada especie que pode aparecer ali. Cobre o par real
// FIRE->GRASS (2x) e FIRE->WATER (0.5x) — os mesmos que o combate usa via
// getEffectiveness, so pelo lado "melhor dos 1-2 tipos do atacante".
describe('bestOffensiveMultiplier', () => {
  it('2x quando o atacante bate super efetivo', () => {
    expect(bestOffensiveMultiplier(SPECIES.charmander, SPECIES.bulbasaur)).toBe(2)
  })

  it('0.5x quando o defensor resiste', () => {
    expect(bestOffensiveMultiplier(SPECIES.charmander, SPECIES.squirtle)).toBe(0.5)
  })

  it('usa o melhor dos dois tipos do atacante (dual-type)', () => {
    // Gyarados e WATER/FLYING — contra GRASS, o lado WATER (2x) vence o lado
    // FLYING (1x): o melhor dos dois, nao a media nem so o tipo primario.
    const mult = bestOffensiveMultiplier(SPECIES.gyarados, SPECIES.bulbasaur)
    expect(mult).toBe(2)
  })
})
