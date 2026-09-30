import { describe, expect, it } from 'vitest'
import { retanguloDoEfeito } from './desenharVfx'

describe('retanguloDoEfeito em area', () => {
  const alvo = { x: 100, y: 200 }, R = 175
  const bordaDeTras = alvo.y + 12 - R * 0.45

  it('cobre a borda de tras da elipse mesmo com alcance baixo', () => {
    // alcance 30 (Bubble, Charge): antes o topo era alvo.y - 30 e cortava a metade de tras.
    const r = retanguloDoEfeito(alvo, alvo, 30, R)
    expect(r.y).toBeLessThan(bordaDeTras)
    expect(r.y + r.h).toBeGreaterThan(alvo.y + 12 + R * 0.45)
  })

  it('efeito que sobe mais que a borda de tras mantem o proprio alcance', () => {
    expect(retanguloDoEfeito(alvo, alvo, 200, R).y).toBe(alvo.y - 200)
  })
})
