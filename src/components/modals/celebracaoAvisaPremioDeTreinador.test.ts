import { describe, expect, it } from 'vitest'
import { marcosNoIntervalo } from './CamadaDeCelebracao'

describe('comemoração de nível de treinador avisa o prêmio liberado', () => {
  it('conta os marcos no intervalo (de, ate]', () => {
    expect(marcosNoIntervalo(4, 5)).toBe(1)
    expect(marcosNoIntervalo(5, 6)).toBe(0)
    expect(marcosNoIntervalo(3, 16)).toBe(3)
    expect(marcosNoIntervalo(100, 124)).toBe(0)
    expect(marcosNoIntervalo(124, 125)).toBe(1)
  })
})
