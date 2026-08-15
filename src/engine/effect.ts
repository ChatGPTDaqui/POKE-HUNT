// Port de js/entities/Effect.js — efeito visual de curta duracao (numero de
// dano, nome de golpe, texto de recompensa, anel/burst de golpe, animacao de
// captura). Puramente cosmetico — a resolucao de combate ja aconteceu antes
// do Effect ser criado (ver combatSystem.ts#resolveHit).
import type { BaseEntity } from './types'
import type { EffectType, WorldCounters, WorldEffect } from './types'
import { claimEffectLane } from './entity'

// Contador no WorldState, nao em modulo — ver a nota em types.ts#WorldCounters.

export interface CreateWorldEffectParams {
  type: EffectType
  x: number
  y: number
  targetX?: number
  targetY?: number
  radius?: number
  color?: string
  duration?: number
  delay?: number
  value?: number
  effectiveness?: string
  effectivenessLabel?: string | null
  text?: string
  unit?: string
  isAoe?: boolean
  worldSize?: number
  elementType?: WorldEffect['elementType']
  ballItemId?: string
  success?: boolean
  statusDirection?: WorldEffect['statusDirection']
  // Dono que este efeito de texto flutuante segue (le owner.x/y todo frame
  // em vez de congelar targetX/targetY na criacao — ver Sprites.ts). Reserva
  // uma "raia" (claimEffectLane) nele pra nao sobrepor outro efeito
  // simultaneo. `laneSize` > 1 reserva mais espaco (ex: dano + rotulo de
  // efetividade empilhados).
  owner?: BaseEntity | null
  laneSize?: number
}

export function createWorldEffect(counters: WorldCounters, params: CreateWorldEffectParams): WorldEffect {
  const {
    type, x, y, targetX, targetY, radius = 10, color = '#fff', duration = 0.25, delay = 0,
    value, effectiveness, effectivenessLabel, text, unit, isAoe, owner = null, laneSize = 1,
    worldSize, elementType, ballItemId, success, statusDirection,
  } = params

  const id = `effect-${counters.effect++}`
  const lane = owner ? claimEffectLane(owner, id, laneSize) : 0

  return {
    id,
    type,
    x, y, targetX, targetY,
    radius, color, duration, delay,
    age: 0,
    value,
    effectiveness,
    effectivenessLabel: effectivenessLabel ?? undefined,
    text, unit, isAoe, worldSize, elementType, ballItemId, success, statusDirection,
    laneSize,
    ownerId: owner ? owner.id : null,
    lane,
  }
}

export function effectProgress(effect: WorldEffect): number {
  return Math.min(1, Math.max(0, (effect.age - effect.delay) / effect.duration))
}

export function effectDone(effect: WorldEffect): boolean {
  return effect.age >= effect.delay + effect.duration
}

export function tickEffect(effect: WorldEffect, dt: number): void {
  effect.age += dt
}
