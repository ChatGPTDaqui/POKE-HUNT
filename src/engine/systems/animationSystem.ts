// Port de js/systems/AnimationSystem.js.
import { resolveBattleAnim } from '@/data/battleSprites'
import type { AnimName } from '@/data/battleSpriteAnims'
import type { AttackAnimKind, PlayerEntity, EnemyEntity, Point, WorldState } from '../types'
import { getSpecies, isDead } from '../entity'

// Quanto tempo a pose de ataque (Shoot/Charge) fica na tela apos disparar —
// nao ligado ao numero de frames do sprite, so um flourish fixo. Tambem
// usado por CombatSystem como o delay de "o golpe realmente acerta", entao
// dano/efeitos/derrota so acontecem quando a pose termina de tocar.
export const ATTACK_ANIM_DURATION = 0.5

// 8 direcoes de bussola na ordem padrao do sheet PMD: Down, DownRight,
// Right, UpRight, Up, UpLeft, Left, DownLeft (sentido horario a partir do sul).
const SECTOR_TO_ROW = [2, 1, 0, 7, 6, 5, 4, 3]

export function directionRowFromFacing(facing: Point): number {
  const angle = Math.atan2(facing.y, facing.x)
  const sector = (((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8)
  return SECTOR_TO_ROW[sector]
}

function desiredAnimName(entity: PlayerEntity | EnemyEntity): AnimName {
  if (isDead(entity)) return 'Faint'
  if (entity.attackAnimTimer > 0) return entity.attackAnim as AnimName
  if (entity.state === 'wander' || entity.state === 'chase') return 'Walk'
  return 'Idle'
}

// Decrementa attackAnimTimer de toda entidade — separado de updateAnimations
// abaixo (que e pulado em modo silent/headless) porque MovementSystem.ts
// tambem le esse mesmo timer pra TRAVAR o movimento enquanto uma pose de
// ataque toca. Bug real encontrado ao vivo: como so updateAnimations
// decrementava isso, uma simulacao silenciosa (Farm Offline/catch-up de
// segundo plano) travava a entidade atacante no lugar pra sempre assim que
// o primeiro golpe disparava — nada mais restante rodando nunca trazia o
// timer de volta a 0, entao o movimento ficava preso em 'engaged' pelo
// resto da simulacao. Precisa rodar todo tick, silent ou nao.
export function tickAttackAnimTimers(world: WorldState, dt: number): void {
  const entities: (PlayerEntity | EnemyEntity | null)[] = [world.player, ...world.enemies]
  for (const entity of entities) {
    if (entity && entity.attackAnimTimer > 0) {
      entity.attackAnimTimer = Math.max(0, entity.attackAnimTimer - dt)
    }
  }
}

// Avanca o frame de animacao do battle sprite de cada entidade — so selecao
// de sprite/frame agora (ver tickAttackAnimTimers acima pro proprio timer,
// que o movimento tambem depende e por isso nao pode ser pulado quando
// silent). Entidades cuja especie nao tem battle sprite (resolveBattleAnim
// devolve null) ficam intocadas e caem no placeholder geometrico.
export function updateAnimations(world: WorldState, dt: number): void {
  const entities = [world.player, ...world.enemies].filter((e): e is PlayerEntity | EnemyEntity => Boolean(e))

  for (const entity of entities) {
    const wantedName = desiredAnimName(entity)
    const resolved = resolveBattleAnim(getSpecies(entity).id, wantedName, entity.poke.isShiny)
    if (!resolved) {
      entity.battleAnim = null
      continue
    }

    if (!entity.battleAnim || entity.battleAnim.name !== resolved.name) {
      entity.battleAnim = resolved
      entity.animFrame = 0
      entity.animElapsed = 0
    }

    const frameOnLastFrame = entity.animFrame >= resolved.durations.length - 1
    const holdOnLastFrame = wantedName === 'Faint' && frameOnLastFrame
    if (holdOnLastFrame) continue // congela na pose de desmaiado

    entity.animElapsed += dt
    const frameDuration = resolved.durations[entity.animFrame] / 60
    if (entity.animElapsed >= frameDuration) {
      entity.animElapsed -= frameDuration
      entity.animFrame = frameOnLastFrame ? 0 : entity.animFrame + 1
    }
  }
}

// Chamado por CombatSystem no instante em que um golpe dispara, pra o
// atacante mostrar brevemente uma pose Shoot (single-target) ou Charge (AOE)
// em vez de Walk/Idle.
export function triggerAttackAnim(entity: PlayerEntity | EnemyEntity, isAoe: boolean): void {
  const kind: AttackAnimKind = isAoe ? 'Charge' : 'Shoot'
  entity.attackAnim = kind
  entity.attackAnimTimer = ATTACK_ANIM_DURATION
}
