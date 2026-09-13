import { updateAnimations, tickAttackAnimTimers } from './animationSystem'
import { updateCombat } from './combatSystem'
import { updateMovement } from './movementSystem'
import { stepPvpReplay } from './pvpReplaySystem'
import { isDead } from '../entity'
import type { WorldState } from '../types'

export function stepPvpVisual(world: WorldState, dt: number): void {
  if (!world.pvp) return

  // PH-532: resultado ja decidido pelo servidor, so tocando os eventos —
  // nao passa por movementSystem/combatSystem (que decidiriam de novo).
  if (world.pvp.estado === 'replay') {
    tickAttackAnimTimers(world, dt)
    stepPvpReplay(world, dt)
    updateAnimations(world, dt)
    return
  }

  if (world.countdownRemaining != null) {
    world.countdownRemaining -= dt
    if (world.countdownRemaining <= 0) world.countdownRemaining = null
    updateAnimations(world, dt)
    return
  }

  updateMovement(world, dt)
  updateCombat(world, dt, { silent: false })
  tickAttackAnimTimers(world, dt)
  updateAnimations(world, dt)

  const player = world.player
  if (!player) return

  const algumRivalVivo = world.enemies.some((enemy) => !isDead(enemy))
  if (!algumRivalVivo) {
    world.pvp.estado = 'vitoria'
    player.state = 'idle'
    player.targetId = null
    return
  }

  if (player.fainted || isDead(player)) {
    world.pvp.estado = 'derrota'
    player.state = 'dead'
  }
}
