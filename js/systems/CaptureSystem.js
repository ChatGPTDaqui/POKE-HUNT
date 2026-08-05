import { SPECIES, computeStatsAtLevel, totalExpForLevel } from '../data/pokes.js';
import { getItem } from '../data/items.js';
import { getAbility } from '../data/abilities.js';
import { rollChance, clamp } from '../core/Random.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from '../data/formulas.generated.js';

const CAPTURE_LEVEL = 1; // captured wilds always join the bag reset to Lv1, regardless of their field level

const formulaEngine = createFormulaEngine(FORMULAS);
const GLOBAL_CATCH_MULTIPLIER = formulaEngine.eval('GLOBAL_CATCH_MULTIPLIER');

export function attemptCapture(gameState, defeatedPoke, ballItemId) {
  const ball = getItem(ballItemId);
  if (!ball || ball.kind !== 'ball') return { success: false, reason: 'invalid_ball' };
  if (!gameState.removeItem(ballItemId, 1)) return { success: false, reason: 'no_ball' };

  const species = SPECIES[defeatedPoke.speciesId];
  const chance = clamp(formulaEngine.eval('CATCH_CHANCE', {
    catchRate: species.catchRate,
    ballMultiplier: ball.captureRate,
    catchMultiplier: GLOBAL_CATCH_MULTIPLIER,
  }), 0, 1);
  const captured = rollChance(chance);

  if (!captured) return { success: false, reason: 'roll_failed', chance };

  const stats = computeStatsAtLevel(species, CAPTURE_LEVEL, defeatedPoke.ivs, defeatedPoke.rarity, defeatedPoke.isShiny);
  const newPoke = {
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
  };
  const location = gameState.addCapturedPoke(newPoke);
  return { success: true, location, chance, poke: newPoke };
}
