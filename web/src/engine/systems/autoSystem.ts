// Port de js/systems/AutoSystem.js.
import { getItem, ITEMS, type GeneratedItem } from '@/data/items'
import type { GameStateStore } from '@/stores/gameStateStore'
import { attemptCapture, type CaptureResult } from './captureSystem'
import { heal } from '../entity'
import type { PokeInstance } from '@/data/pokes'
import type { WorldState } from '../types'

const AUTO_ACTION_COOLDOWN = 1.0
export const BEST_POTION_OPTION = 'best'
export const AUTO_REVIVE_DELAY = 5.0 // segundos que um POKE desmaiado espera antes do Auto-Revive disparar de verdade

// Resolve a pocao escolhida numa regra pro itemId concreto. `best` escolhe
// a pocao de maior healAmount que o jogador possui agora.
function resolveRulePotionId(gameState: GameStateStore, rule: { itemId: string }): string | null {
  if (rule.itemId !== BEST_POTION_OPTION) return rule.itemId
  const owned = Object.values(ITEMS)
    .filter((item): item is GeneratedItem & { kind: 'potion' } => item.kind === 'potion' && gameState.hasItem(item.id, 1))
    .sort((a, b) => (b.healAmount ?? 0) - (a.healAmount ?? 0))
  return owned[0]?.id || null
}

export type AutoHealEvent = { type: 'auto_pot' | 'auto_revive'; itemId: string }

// Cuida de autoPot e autoRevive. Chamado uma vez por tick fixo.
// `world.autoTimers` throttla uso repetido de item.
// Hunts BOSS (world.mapDef.noRespawn) desligam os dois toggles
// explicitamente, nao importa a config do jogador — morrer la e definitivo
// (pedido explicito do usuario).
export function updateAutoHeal(world: WorldState, gameState: GameStateStore, dt: number): AutoHealEvent[] {
  const player = world.player
  const events: AutoHealEvent[] = []
  if (!player) return events

  const timers = world.autoTimers
  timers.pot = Math.max(0, timers.pot - dt)
  timers.revive = Math.max(0, timers.revive - dt)

  const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn)

  // Desmaiar comeca uma contagem regressiva fresca de AUTO_REVIVE_DELAY
  // segundos (mostrada como modal por UIManager) — Auto-Revive so dispara
  // de verdade quando chega a 0, nao no instante em que o POKE cai.
  if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted) {
    world.reviveCountdown = world.reviveCountdown == null
      ? AUTO_REVIVE_DELAY
      : Math.max(0, world.reviveCountdown - dt)
  } else {
    world.reviveCountdown = null
  }

  if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted && (world.reviveCountdown ?? 0) <= 0 && timers.revive <= 0) {
    const revive = getItem('revive')
    if (revive && 'reviveHpPercent' in revive && revive.reviveHpPercent != null && gameState.hasItem('revive', 1)) {
      gameState.removeItem('revive', 1)
      player.poke.hp = Math.round(player.poke.stats.hp * revive.reviveHpPercent)
      player.fainted = false
      player.state = 'wander'
      timers.revive = AUTO_ACTION_COOLDOWN
      world.reviveCountdown = null
      events.push({ type: 'auto_revive', itemId: 'revive' })
    }
  }

  if (!isBossHunt && !player.fainted && gameState.autoToggles.autoPot && timers.pot <= 0) {
    const hpPct = (player.poke.hp / player.poke.stats.hp) * 100
    for (const rule of gameState.autoPotRules) {
      if (hpPct > rule.hpPercent) continue
      const resolvedId = resolveRulePotionId(gameState, rule)
      const item = resolvedId && getItem(resolvedId)
      if (!item || !('healAmount' in item) || item.healAmount == null || !gameState.hasItem(resolvedId, 1)) continue
      gameState.removeItem(resolvedId, 1)
      heal(player, item.healAmount)
      timers.pot = AUTO_ACTION_COOLDOWN
      events.push({ type: 'auto_pot', itemId: resolvedId })
      break // so a primeira regra que bate dispara por tick
    }
  }

  return events
}

// Chamado logo depois de uma derrota quando gameState.autoToggles.autoCatch
// esta ligado. Precedencia: uma regra por-especie (gameState.autoCatchRules)
// ganha da config de bola shiny, que ganha da bola padrao. Uma regra
// combinada NAO tem fallback pra outra bola quando a sua propria acaba.
export function maybeAutoCatch(gameState: GameStateStore, defeatedPoke: PokeInstance): CaptureResult | null {
  if (!gameState.autoToggles.autoCatch) return null

  const rule = gameState.autoCatchRules.find((r) => r.speciesId === defeatedPoke.speciesId)
  if (rule) {
    if (!rule.ballItemId || !gameState.hasItem(rule.ballItemId, 1)) return null
    return attemptCapture(gameState, defeatedPoke, rule.ballItemId)
  }

  const config = gameState.autoCatchConfig
  const isShiny = Boolean(defeatedPoke.isShiny)
  const ballId = isShiny && config.catchShinyEnabled ? config.shinyBallId : config.ballId
  if (!ballId || !gameState.hasItem(ballId, 1)) return null
  return attemptCapture(gameState, defeatedPoke, ballId)
}
