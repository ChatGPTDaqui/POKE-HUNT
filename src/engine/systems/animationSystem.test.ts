// O atacante tem que estar virado pro alvo no frame em que a pose de ataque
// comeca.
//
// `facing` so era escrito por quem MOVIA a entidade, e o combate acontece
// parado — entao o POKE atacava virado pra onde estava andando quando parou.
// O teste prende o contrato em `triggerAttackAnim` (e nao numa chamada solta
// de `faceToward`) porque foi justamente um caminho de ataque sem a virada que
// produziu o bug.
import { describe, expect, it } from 'vitest'

import { triggerAttackAnim, directionRowFromFacing, desiredAnimName } from './animationSystem'
import type { EnemyEntity, PlayerEntity } from '../types'

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

// 'wander' cobre duas fases (movementSystem.ts#wanderStep/wanderFreely):
// perseguindo um wanderTarget de verdade, e pausado entre alvos
// (wanderTarget null, wanderPause contando). So o state nao distingue as
// duas — sem checar o alvo, o POKE parado na pausa ficava preso no frame de
// "Walk" (bug real, so aparecia em hunt: no Hospital o state nunca sai de
// 'idle', entao nunca reproduzia la).
describe('animacao parada durante a pausa do wander', () => {
  function inimigo(overrides: { hp?: number } & Partial<Omit<EnemyEntity, 'poke'>>): EnemyEntity {
    const { hp, ...rest } = overrides
    return {
      state: 'wander',
      wanderTarget: null,
      attackAnimTimer: 0,
      poke: { hp: hp ?? 10 } as EnemyEntity['poke'],
      ...rest,
    } as EnemyEntity
  }

  it('Idle quando pausado entre alvos (wanderTarget null)', () => {
    expect(desiredAnimName(inimigo({ wanderTarget: null }))).toBe('Idle')
  })

  it('Walk enquanto anda de verdade rumo a um wanderTarget', () => {
    expect(desiredAnimName(inimigo({ wanderTarget: { x: 10, y: 10 } }))).toBe('Walk')
  })

  it('chase sempre Walk, independente de wanderTarget', () => {
    expect(desiredAnimName(inimigo({ state: 'chase', wanderTarget: null }))).toBe('Walk')
  })

  it('morto sempre Faint, mesmo com wanderTarget setado', () => {
    expect(desiredAnimName(inimigo({ hp: 0, wanderTarget: { x: 1, y: 1 } }))).toBe('Faint')
  })
})
