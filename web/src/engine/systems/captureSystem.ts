// Port de js/systems/CaptureSystem.js.
import { SPECIES, computeStatsAtLevel, totalExpForLevel, type PokeInstance } from '@/data/pokes'
import { getItem } from '@/data/items'
import { getAbility } from '@/data/abilities'
import { rollChance, clamp } from '@/core/random'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import type { GameStateStore } from '@/stores/gameStateStore'

const CAPTURE_LEVEL = 1 // POKEs capturados sempre entram na mochila resetados pro Nivel 1

const formulaEngine = createFormulaEngine(FORMULAS)
const GLOBAL_CATCH_MULTIPLIER = formulaEngine.eval('GLOBAL_CATCH_MULTIPLIER')

export type CaptureResult =
  | { success: false; reason: 'invalid_ball' | 'no_ball' }
  | { success: false; reason: 'roll_failed'; chance: number; ballItemId: string }
  | { success: true; location: 'bag'; chance: number; poke: PokeInstance; ballItemId: string }

export function attemptCapture(gameState: GameStateStore, defeatedPoke: PokeInstance, ballItemId: string): CaptureResult {
  const ball = getItem(ballItemId)
  if (!ball || ball.kind !== 'ball' || ball.captureRate == null) return { success: false, reason: 'invalid_ball' }
  if (!gameState.removeItem(ballItemId, 1)) return { success: false, reason: 'no_ball' }

  const species = SPECIES[defeatedPoke.speciesId]
  const chance = clamp(formulaEngine.eval('CATCH_CHANCE', {
    catchRate: species.catchRate,
    ballMultiplier: ball.captureRate,
    catchMultiplier: GLOBAL_CATCH_MULTIPLIER,
  }), 0, 1)
  const captured = rollChance(chance)

  if (!captured) return { success: false, reason: 'roll_failed', chance, ballItemId }

  const stats = computeStatsAtLevel(species, CAPTURE_LEVEL, defeatedPoke.ivs, defeatedPoke.rarity, defeatedPoke.isShiny)
  const newPoke: PokeInstance = {
    ...defeatedPoke,
    uid: `poke-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    level: CAPTURE_LEVEL,
    exp: totalExpForLevel(CAPTURE_LEVEL, species.growthCurve),
    stats,
    hp: stats.hp,
    unlockedAbilities: species.abilities
      .filter((entry) => entry.levelReq <= CAPTURE_LEVEL)
      .map((entry) => entry.key)
      .filter((key) => getAbility(key)),
  }
  gameState.addCapturedPoke(newPoke)
  return { success: true, location: 'bag', chance, poke: newPoke, ballItemId }
}
