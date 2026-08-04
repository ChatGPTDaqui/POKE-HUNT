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
