// O atacante tem que estar virado pro alvo no frame em que a pose de ataque
// comeca.
//
// `facing` so era escrito por quem MOVIA a entidade, e o combate acontece
// parado — entao o POKE atacava virado pra onde estava andando quando parou.
// O teste prende o contrato em `triggerAttackAnim` (e nao numa chamada solta
// de `faceToward`) porque foi justamente um caminho de ataque sem a virada que
// produziu o bug.
import { describe, expect, it } from 'vitest'

import { triggerAttackAnim, directionRowFromFacing } from './animationSystem'
import type { PlayerEntity } from '../types'

function atacante(): PlayerEntity {
  return { x: 100, y: 100, facing: { x: 0, y: 1 }, attackAnim: 'Shoot', attackAnimTimer: 0 } as PlayerEntity
}

describe('orientacao no ataque', () => {
  it('vira pro alvo em cada uma das 4 direcoes cardinais', () => {
    const casos = [
      { alvo: { x: 300, y: 100 }, facing: { x: 1, y: 0 } },   // direita
      { alvo: { x: -100, y: 100 }, facing: { x: -1, y: 0 } }, // esquerda
      { alvo: { x: 100, y: -50 }, facing: { x: 0, y: -1 } },  // cima
      { alvo: { x: 100, y: 400 }, facing: { x: 0, y: 1 } },   // baixo
    ]
    for (const caso of casos) {
      const e = atacante()
      triggerAttackAnim(e, false, caso.alvo)
      expect(e.facing.x).toBeCloseTo(caso.facing.x)
      expect(e.facing.y).toBeCloseTo(caso.facing.y)
      // O row do spritesheet PMD e o que o jogador ve de fato.
      expect(directionRowFromFacing(e.facing)).toBe(directionRowFromFacing(caso.facing))
    }
  })

  it('alvo exatamente em cima do atacante mantem o facing anterior', () => {
    const e = atacante()
    e.facing = { x: 1, y: 0 }
    triggerAttackAnim(e, false, { x: e.x, y: e.y })
    expect(Number.isNaN(e.facing.x)).toBe(false)
    expect(e.facing).toEqual({ x: 1, y: 0 })
  })
})
