import { SPECIES, computeStatsAtLevel, totalExpForLevel } from '../data/pokes.js';
import { getAbility } from '../data/abilities.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from '../data/formulas.generated.js';

const formulaEngine = createFormulaEngine(FORMULAS);
// Spreadsheet-editable global lever on top of the EXP_GAIN curve itself (see
// CLAUDE.md's "Balanceamento de economia" section) — lets the whole game's
// XP rate be rebalanced with one number instead of reshaping the curve.
// 0.4 = explicit user request to cut all XP gain by 60%.
const XP_GLOBAL_MULTIPLIER = formulaEngine.evalOrDefault('XP_GLOBAL_MULTIPLIER', 0.4);
// 0.05 = explicit user request: dying costs 5% of the EXP needed for the
// CURRENT level (expProgressForInstance's `needed`, i.e. one level's worth of
// span), not 5% of total cumulative EXP — the cumulative curve grows fast
// enough that 5% of a high-level poke's total would be a wildly
// disproportionate, possibly multi-level loss from a single death.
const DEATH_EXP_LOSS_PERCENT = formulaEngine.evalOrDefault('DEATH_EXP_LOSS_PERCENT', 0.05);

export function expRewardForEnemy(enemyPoke) {
  const species = SPECIES[enemyPoke.speciesId];
  const base = formulaEngine.eval('EXP_GAIN', { baseExp: species.baseExp, level: enemyPoke.level });
  return Math.max(1, Math.round(base * XP_GLOBAL_MULTIPLIER));
}

// How far into the current level a poke instance is, for progress bars.
export function expProgressForInstance(pokeInstance, species) {
  const currentBase = totalExpForLevel(pokeInstance.level, species.growthCurve);
  const nextTotal = totalExpForLevel(pokeInstance.level + 1, species.growthCurve);
  return { into: pokeInstance.exp - currentBase, needed: Math.max(1, nextTotal - currentBase) };
}

// Whether this poke has reached its evolution level.
export function canEvolve(pokeInstance, species) {
  return species.evolvesTo != null && pokeInstance.level >= species.evolvesAtLevel;
}

// Swaps the poke to its evolved species (stats recomputed from the new
// species' base stats at the same level/IVs, HP kept at the same %). The new
// species can teach different moves at different levels than the old one —
// any move it would have already learned by the current level (levelReq <=
// level) gets unlocked immediately, not just moves gained from here on;
// otherwise a poke evolving past a level it already outleveled would
// permanently miss that move. Returns the new species, or null if not
// eligible.
export function evolvePokeInstance(pokeInstance) {
  const species = SPECIES[pokeInstance.speciesId];
  if (!canEvolve(pokeInstance, species)) return null;

  const newSpecies = SPECIES[species.evolvesTo];
  const hpRatio = pokeInstance.hp / pokeInstance.stats.hp;
  // Floor for applyDeathExpPenalty below — an evolved POKE must never
  // de-evolve, even after a death-penalty level-down. Uses the OLD species'
  // evolvesAtLevel (the threshold that just fired), maxed against any prior
  // value so a multi-stage chain keeps the latest (highest) evolution's
  // requirement, not an earlier stage's lower one.
  pokeInstance.minLevel = Math.max(pokeInstance.minLevel || 1, species.evolvesAtLevel);
  pokeInstance.speciesId = newSpecies.id;
  pokeInstance.stats = computeStatsAtLevel(newSpecies, pokeInstance.level, pokeInstance.ivs, pokeInstance.rarity);
  pokeInstance.hp = Math.max(1, Math.round(pokeInstance.stats.hp * hpRatio));

  const newAbilities = [];
  for (const entry of newSpecies.abilities) {
    if (entry.levelReq > pokeInstance.level || pokeInstance.unlockedAbilities.includes(entry.key)) continue;
    const ability = getAbility(entry.key);
    if (!ability) continue;
    pokeInstance.unlockedAbilities.push(entry.key);
    newAbilities.push(ability);
  }

  return { species: newSpecies, newAbilities };
}

// Trainer leveling reuses the exact same cumulative-EXP curve machinery as a
// POKE (totalExpForLevel) instead of a separate formula — MEDIUM_SLOW is
// just a fixed reference curve since the Trainer has no species/growthCurve
// of its own.
const TRAINER_GROWTH_CURVE = 'MEDIUM_SLOW';

export function trainerExpProgress(trainer) {
  const currentBase = totalExpForLevel(trainer.level, TRAINER_GROWTH_CURVE);
  const nextTotal = totalExpForLevel(trainer.level + 1, TRAINER_GROWTH_CURVE);
  return { into: trainer.exp - currentBase, needed: Math.max(1, nextTotal - currentBase) };
}

// Same cumulative-EXP/level-up loop as grantExp below, applied to the
// Trainer's own level/exp fields instead of a poke instance.
export function grantTrainerExp(trainer, amount) {
  trainer.exp += amount;
  let leveledUp = false;
  while (trainer.exp >= totalExpForLevel(trainer.level + 1, TRAINER_GROWTH_CURVE)) {
    trainer.level += 1;
    leveledUp = true;
  }
  return { leveledUp, level: trainer.level };
}

// Applies EXP to a poke instance, handling (possibly multiple) level-ups and
// newly unlocked abilities. `exp` is cumulative total EXP. Mutates in place.
export function grantExp(pokeInstance, amount) {
  pokeInstance.exp += amount;
  const species = SPECIES[pokeInstance.speciesId];
  let leveledUp = false;
  const newAbilities = [];

  while (pokeInstance.exp >= totalExpForLevel(pokeInstance.level + 1, species.growthCurve)) {
    const previousMaxHp = pokeInstance.stats.hp;
    pokeInstance.level += 1;
    leveledUp = true;

    pokeInstance.stats = computeStatsAtLevel(species, pokeInstance.level, pokeInstance.ivs, pokeInstance.rarity);
    const hpGain = pokeInstance.stats.hp - previousMaxHp;
    pokeInstance.hp = Math.min(pokeInstance.stats.hp, pokeInstance.hp + hpGain);

    for (const entry of species.abilities) {
      if (entry.levelReq !== pokeInstance.level || pokeInstance.unlockedAbilities.includes(entry.key)) continue;
      const ability = getAbility(entry.key);
      if (!ability) continue;
      pokeInstance.unlockedAbilities.push(entry.key);
      newAbilities.push(ability);
    }
  }

  return { leveledUp, newAbilities, level: pokeInstance.level };
}

// Death penalty: loses DEATH_EXP_LOSS_PERCENT of the current level's EXP
// span, which can cascade into a level-down (mirrors grantExp's ascending
// loop, just descending). Floored at `pokeInstance.minLevel` (set by
// evolvePokeInstance below at the level it last evolved, absent = 1 via
// `|| 1` — same no-migration-needed pattern as poke.rarity/poke.locked) so an
// evolved POKE can never de-evolve. Never touches unlockedAbilities/
// speciesId — nothing in the game ever removes a learned move, so a level
// dropping back below a move's levelReq doesn't desync anything (leveling
// back up past it later is a no-op, same as re-evolving already does).
export function applyDeathExpPenalty(pokeInstance) {
  const species = SPECIES[pokeInstance.speciesId];
  const { needed } = expProgressForInstance(pokeInstance, species);
  pokeInstance.exp = Math.max(0, pokeInstance.exp - Math.round(needed * DEATH_EXP_LOSS_PERCENT));

  const floor = pokeInstance.minLevel || 1;
  let leveledDown = false;
  while (pokeInstance.level > floor && pokeInstance.exp < totalExpForLevel(pokeInstance.level, species.growthCurve)) {
    pokeInstance.level -= 1;
    leveledDown = true;
    pokeInstance.stats = computeStatsAtLevel(species, pokeInstance.level, pokeInstance.ivs, pokeInstance.rarity);
    pokeInstance.hp = Math.min(pokeInstance.hp, pokeInstance.stats.hp);
  }

  return { leveledDown, level: pokeInstance.level };
}
