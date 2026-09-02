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
  /** Ver types.ts#WorldEffect.isCrit — canal separado da efetividade (PH-131). */
  isCrit?: boolean
  text?: string
  unit?: string
  isAoe?: boolean
  worldSize?: number
  elementType?: WorldEffect['elementType']
  abilityId?: string
  // Direcao atacante -> alvo, so pra arte marcada `direcional` (data/moveVfx.ts).
  anguloDeAtaque?: number
  ballItemId?: string
  success?: boolean
  statusDirection?: WorldEffect['statusDirection']
  statusStat?: WorldEffect['statusStat']
  // Dono que este efeito de texto flutuante segue (le owner.x/y todo frame
  // em vez de congelar targetX/targetY na criacao — ver Sprites.ts). Reserva
  // uma "raia" (claimEffectLane) nele pra nao sobrepor outro efeito
  // simultaneo. `laneSize` > 1 reserva mais espaco (ex: dano + rotulo de
  // efetividade empilhados).
  owner?: BaseEntity | null
  laneSize?: number
  // Entidade que este efeito ACOMPANHA enquanto vive (a arte anda junto com o
  // POKE). Nao confundir com `owner`: aquele e a coluna de texto e reserva
  // raia; este so translada as coordenadas e nao reserva nada. Ver
  // types.ts#WorldEffect.seguirId.
  seguir?: BaseEntity | null
  /**
   * Entidade pra qual o rastro deve continuar APONTANDO enquanto o efeito vive
   * (o atacante). So arte DIRECIONAL passa isto — ver
   * `combatSystem` e types.ts#WorldEffect.apontarParaId.
   */
  apontarPara?: BaseEntity | null
}

export function createWorldEffect(counters: WorldCounters, params: CreateWorldEffectParams): WorldEffect {
  const {
    type, x, y, targetX, targetY, radius = 10, color = '#fff', duration = 0.25, delay = 0,
    value, effectiveness, effectivenessLabel, isCrit, text, unit, isAoe, owner = null, laneSize = 1,
    worldSize, elementType, abilityId, anguloDeAtaque, ballItemId, success, statusDirection,
    statusStat,
    seguir = null, apontarPara = null,
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
    isCrit,
    text, unit, isAoe, worldSize, elementType, abilityId, anguloDeAtaque, ballItemId, success, statusDirection,
    statusStat,
    laneSize,
    ownerId: owner ? owner.id : null,
    lane,
    seguirId: seguir ? seguir.id : undefined,
    seguirUltimoX: seguir ? seguir.x : undefined,
    seguirUltimoY: seguir ? seguir.y : undefined,
    apontarParaId: apontarPara ? apontarPara.id : undefined,
  }
}

/**
 * Reaponta o rastro pra entidade que disparou o golpe (PH-110).
 *
 * Arte DIRECIONAL e um risco que LIGA atacante e alvo: a faisca de impacto fica
 * em cima do alvo e o rastro se estende de volta pra quem bateu. Com o angulo
 * congelado no instante do hit, o atacante andar durante o ~1s de animacao
 * descola o rastro do punho dele — foi o que o Bullet Punch mostrou, que e o
 * pior caso do lote (rastro horizontal de 84px recortado pra 37px, exatamente a
 * distancia de combate).
 *
 * Congelar continua valendo pra arte NAO direcional: quem nao e direcional
 * nunca recebe `apontarParaId`, entao nem chega aqui. O gate e na criacao, e nao
 * neste laco, pra o resto do jogo ficar byte a byte igual.
 *
 * `atacante` nulo (morreu, saiu do mundo) deixa o ultimo angulo valido no lugar:
 * girar a arte pra um ponto que nao existe mais seria pior que nao girar.
 */
export function reapontarParaAtacante(effect: WorldEffect, atacante: BaseEntity | null): void {
  if (!effect.apontarParaId || !atacante) return
  const dx = effect.x - atacante.x
  const dy = effect.y - atacante.y
  // Mesma guarda do call-site: golpe em si mesmo nao tem direcao, e dx=dy=0
  // sairia como angulo 0 e apontaria a arte pra direita sem motivo.
  if (dx === 0 && dy === 0) return
  effect.anguloDeAtaque = Math.atan2(dy, dx)
}

/**
 * Arrasta o efeito pelo deslocamento da entidade que ele acompanha desde o tick
 * anterior. Chamado do laco de efeitos junto do `tickEffect`; `entidade` nula
 * (POKE morreu, inimigo saiu do mundo) deixa o efeito parado onde estava, que e
 * melhor do que sumir com ele ou joga-lo pra origem do mundo.
 */
export function seguirDono(effect: WorldEffect, entidade: BaseEntity | null): void {
  if (!effect.seguirId || !entidade) return
  const dx = entidade.x - (effect.seguirUltimoX ?? entidade.x)
  const dy = entidade.y - (effect.seguirUltimoY ?? entidade.y)
  effect.seguirUltimoX = entidade.x
  effect.seguirUltimoY = entidade.y
  if (dx === 0 && dy === 0) return
  effect.x += dx
  effect.y += dy
  if (effect.targetX !== undefined) effect.targetX += dx
  if (effect.targetY !== undefined) effect.targetY += dy
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
