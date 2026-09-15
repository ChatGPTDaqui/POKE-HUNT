// O atacante tem que estar virado pro alvo no frame em que a pose de ataque
// comeca.
//
// `facing` so era escrito por quem MOVIA a entidade, e o combate acontece
// parado — entao o POKE atacava virado pra onde estava andando quando parou.
// O teste prende o contrato em `triggerAttackAnim` (e nao numa chamada solta
// de `faceToward`) porque foi justamente um caminho de ataque sem a virada que
// produziu o bug.
import { describe, expect, it } from 'vitest'

import {
  triggerAttackAnim, directionRowFromFacing, desiredAnimName,
  registrarDanoParaHurt, tickAttackAnimTimers, HURT_ANIM_DURATION,
} from './animationSystem'
import type { EnemyEntity, PlayerEntity, WorldState } from '../types'

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

// PH-542: flinch de levar dano so no combate DUELO e so em acerto pesado.
describe('pose Hurt no duelo (PH-542)', () => {
  function alvo(hp = 100): PlayerEntity {
    return {
      state: 'engaged', facing: { x: 1, y: 0 }, attackAnim: null, attackAnimTimer: 0, fainted: false,
      poke: { hp, stats: { hp: 100 }, status: null },
    } as unknown as PlayerEntity
  }
  const duelo = { mapDef: { encarada: true } } as unknown as WorldState
  const livre = { mapDef: { encarada: false } } as unknown as WorldState

  it('acerto de 20%+ do HP maximo no duelo arma a pose', () => {
    const e = alvo()
    registrarDanoParaHurt(duelo, e, 20)
    expect(e.hurtAnimTimer).toBe(HURT_ANIM_DURATION)
    expect(desiredAnimName(e)).toBe('Hurt')
  })

  it('acerto abaixo de 20% nao arma; combate livre nunca arma', () => {
    const fraco = alvo()
    registrarDanoParaHurt(duelo, fraco, 19)
    expect(fraco.hurtAnimTimer).toBeUndefined()
    const mundo = alvo()
    registrarDanoParaHurt(livre, mundo, 100)
    expect(mundo.hurtAnimTimer).toBeUndefined()
    expect(desiredAnimName(mundo)).toBe('Idle')
  })

  it('a pose de ataque propria vence o Hurt, e o timer desce em tickAttackAnimTimers', () => {
    const e = alvo()
    registrarDanoParaHurt(duelo, e, 50)
    triggerAttackAnim(e, false)
    expect(desiredAnimName(e)).toBe('Shoot')
    e.attackAnimTimer = 0
    const world = { player: e, enemies: [] } as unknown as WorldState
    tickAttackAnimTimers(world, HURT_ANIM_DURATION / 2)
    expect(desiredAnimName(e)).toBe('Hurt')
    tickAttackAnimTimers(world, HURT_ANIM_DURATION)
    expect(e.hurtAnimTimer).toBeUndefined()
    expect(desiredAnimName(e)).toBe('Idle')
  })

  it('morto nao flincha: a pose de desmaio vence', () => {
    const e = alvo(0)
    registrarDanoParaHurt(duelo, e, 50)
    expect(e.hurtAnimTimer).toBeUndefined()
    expect(desiredAnimName(e)).toBe('Faint')
  })
})

// PH-543: a pose de golpe depende do TIPO de combate, nao do alcance.
describe('pose de golpe por tipo de combate (PH-543)', () => {
  it('combate livre: Shoot pra alvo unico, Charge pra area', () => {
    const a = atacante(); triggerAttackAnim(a, false); expect(a.attackAnim).toBe('Shoot')
    const b = atacante(); triggerAttackAnim(b, true); expect(b.attackAnim).toBe('Charge')
  })
  it('combate duelo: Attack sempre, alvo unico ou area', () => {
    const a = atacante(); triggerAttackAnim(a, false, undefined, true); expect(a.attackAnim).toBe('Attack')
    const b = atacante(); triggerAttackAnim(b, true, undefined, true); expect(b.attackAnim).toBe('Attack')
    expect(desiredAnimName({ ...b, attackAnimTimer: 0.2, poke: { status: null, hp: 1 } } as unknown as PlayerEntity)).toBe('Attack')
  })
})
