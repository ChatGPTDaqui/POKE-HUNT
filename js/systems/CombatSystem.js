import { getAbility, BASIC_ATTACK, isDamagingAbility } from '../data/abilities.js';
import { SPECIES } from '../data/pokes.js';
import { colorForType } from '../data/typeColors.js';
import { Effect } from '../entities/Effect.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from '../data/formulas.generated.js';
import { getEffectiveness } from '../data/typeChart.generated.js';
import { rollChance } from '../core/Random.js';
import { triggerAttackAnim, ATTACK_ANIM_DURATION } from './AnimationSystem.js';

// Damage/effects/defeat-handling land this long after an attack fires, so
// they show up in sync with the Shoot/Charge pose finishing instead of the
// instant the ability is used.
const HIT_LAND_DELAY = ATTACK_ANIM_DURATION;

// Procedural per-type ability effect durations (see Sprites.js#drawAbilityEffect):
// a single-target hit is a quick glowing "fluid" burst; an AOE hit is a ring
// that expands out to the move's real splash radius, so it needs more time to
// visibly finish growing before it fades.
const IMPACT_EFFECT_DURATION = 0.35;
const AOE_EFFECT_DURATION = 0.55;

const formulaEngine = createFormulaEngine(FORMULAS);
const STAB_MULTIPLIER = formulaEngine.eval('STAB_MULTIPLIER');
const CRIT_CHANCE = formulaEngine.eval('CRIT_CHANCE');
const CRIT_MULTIPLIER = formulaEngine.eval('CRIT_MULTIPLIER');

// Both spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia"
// section) with fallbacks matching the old hardcoded values.
const SPEED_REFERENCE = formulaEngine.evalOrDefault('ATTACK_SPEED_REFERENCE', 100); // speed stat value that maps to an ability's listed cooldown as-is
const BASE_ATTACK_INTERVAL = formulaEngine.evalOrDefault('BASIC_ATTACK_COOLDOWN', 1.5); // BASIC_ATTACK's cooldown, fixed — every POKE's baseline move
const MIN_ACTION_GAP = 1; // global cooldown: no two attacks from the same entity land closer than this
const MELEE_RANGE_PADDING = 10; // touch-distance buffer added on top of both radii

// How close `attacker` needs to be to `defender` to fight — always melee
// touch-distance, physical or special. Special moves used to reach 3x that
// (a ranged-casting mechanic), but that read as POKE attacking without
// actually closing in, so every attacker now has to arrive right next to its
// target first, whatever move it ends up using.
export function engageRangeFor(attacker, defender) {
  return attacker.radius + defender.radius + MELEE_RANGE_PADDING;
}

// BASIC_ATTACK's cooldown is a flat 1.5s for every POKE, no Speed scaling
// (it's the one move every POKE always has); every other ability keeps its
// own individual PP-derived cooldown, scaled by Speed.
function scaledCooldown(ability, speed) {
  if (ability.id === BASIC_ATTACK.id) return BASE_ATTACK_INTERVAL;
  return ability.cooldown * (SPEED_REFERENCE / Math.max(1, speed));
}

// Rough damage estimate (no crit, no roll variation) used only to rank
// candidate abilities against a specific target — mirrors computeDamage's
// pipeline minus the two random steps.
function estimateDamage(attackerPoke, defenderPoke, ability) {
  const attackerSpecies = SPECIES[attackerPoke.speciesId];
  const defenderSpecies = SPECIES[defenderPoke.speciesId];
  const isPhysical = ability.category === 'physical';
  const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
  const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;

  let dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power: ability.power, atk, def });

  const isStab = ability.type && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2);
  if (isStab) dmg *= STAB_MULTIPLIER;

  dmg *= getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
  return dmg;
}

// Real Gen2 damage pipeline: DAMAGE_BASE -> STAB -> type effectiveness ->
// crit -> 85-100% variation. Returns the final amount plus enough info for
// the floating combat-text popup (effectiveness label, crit).
function computeDamage(attackerPoke, defenderPoke, ability) {
  const attackerSpecies = SPECIES[attackerPoke.speciesId];
  const defenderSpecies = SPECIES[defenderPoke.speciesId];
  const isPhysical = ability.category === 'physical';
  const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
  const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;

  let dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power: ability.power, atk, def });

  const isStab = ability.type && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2);
  if (isStab) dmg *= STAB_MULTIPLIER;

  const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
  dmg *= effectivenessMultiplier;

  const isCrit = rollChance(CRIT_CHANCE);
  if (isCrit) dmg *= CRIT_MULTIPLIER;

  dmg *= formulaEngine.eval('DAMAGE_VARIATION');

  let effectiveness = 'normal';
  let effectivenessLabel = null;
  if (effectivenessMultiplier === 0) {
    effectiveness = 'immune';
    effectivenessLabel = 'Imune!';
  } else if (effectivenessMultiplier > 2) {
    effectiveness = 'super';
    effectivenessLabel = 'Super efetivo!';
  } else if (effectivenessMultiplier > 1) {
    effectiveness = 'effective';
    effectivenessLabel = 'Efetivo!';
  } else if (effectivenessMultiplier < 1) {
    effectiveness = 'weak';
    effectivenessLabel = 'Pouco efetivo';
  }

  return {
    amount: Math.max(1, Math.round(dmg)),
    effectiveness,
    effectivenessLabel,
    isCrit,
  };
}

// Damage number color follows type effectiveness, not crit.
const EFFECTIVENESS_COLORS = {
  super: '#ff8c1a', // Super-Efetivo! — laranja
  effective: '#ffe14d', // Efetivo — amarelo
  normal: '#ffffff', // Normal — branco
  weak: '#5a5a5a', // Pouco Efetivo — cinza escuro
  immune: '#000000', // Imune — preto
};

// Floating combat text above the target. Hits with an effectiveness label
// (e.g. "Super efetivo!") render as two stacked lines, so they claim 2 lane
// slots instead of 1 — otherwise the next effect up in the same owner's
// column could land right on top of the label (see Entity#claimEffectLane).
function spawnDamageNumber(world, target, result) {
  world.effects.push(new Effect({
    type: 'damageNumber',
    x: target.x, y: target.y,
    targetX: target.x, targetY: target.y - target.radius - 40,
    color: EFFECTIVENESS_COLORS[result.effectiveness],
    duration: 0.9,
    value: result.amount,
    effectiveness: result.effectiveness !== 'normal' ? result.effectiveness : undefined,
    effectivenessLabel: result.effectivenessLabel,
    owner: target,
    laneSize: result.effectivenessLabel ? 2 : 1,
  }));
}

// BASIC_ATTACK is one shared module-level object (see data/abilities.js) —
// mutating its `.type` directly would corrupt it for every other entity
// using it mid-fight. This builds a per-attack override typed to the
// attacker's own primary type instead (dual-typing ties always go primary,
// same field STAB already reads off `attackerSpecies.type`), threaded
// through pickAbility -> queueHit -> resolveHit by reference so damage/color
// end up consistent everywhere without touching the shared object.
function basicAttackFor(attackerSpecies) {
  return { ...BASIC_ATTACK, type: attackerSpecies.type };
}

// Picks the ready ability that deals the most damage to `defenderPoke`.
// Status/non-damage moves (power 0) are excluded from selection — they stay
// in the data files for possible future use but are inert in combat for now.
// `aoeTargetCounter` is a function (ability) => number of targets an AOE cast
// would hit, used to prefer AOE when it would strike multiple enemies.
function pickAbility(entity, defenderPoke, aoeTargetCounter) {
  const attackerSpecies = SPECIES[entity.poke.speciesId];
  const candidateIds = [...entity.poke.unlockedAbilities, BASIC_ATTACK.id];
  const ready = candidateIds
    .map((id) => (id === BASIC_ATTACK.id ? basicAttackFor(attackerSpecies) : getAbility(id)))
    .filter((ability) => isDamagingAbility(ability) && entity.isAbilityReady(ability.id));

  if (ready.length === 0) return null;

  const aoeReady = ready.filter((a) => a.target === 'aoe' && aoeTargetCounter(a) >= 2);
  const pool = aoeReady.length > 0 ? aoeReady : ready;
  return pool.reduce((best, a) => (
    estimateDamage(entity.poke, defenderPoke, a) > estimateDamage(entity.poke, defenderPoke, best) ? a : best
  ));
}

// Queues a hit to land HIT_LAND_DELAY seconds from now — resolveHit() applies
// the actual damage/effect/defeat once that timer runs out, in step with the
// Shoot/Charge pose finishing (see updateCombat).
function queueHit(world, attacker, target, ability) {
  world.pendingHits.push({ timer: HIT_LAND_DELAY, attacker, target, ability });
}

// Pops the move's name just below the caster the instant it's used — separate
// from queueHit's damage number, which only appears once the hit actually
// lands HIT_LAND_DELAY seconds later.
function announceAbility(world, attacker, ability) {
  world.effects.push(new Effect({
    type: 'abilityName',
    x: attacker.x, y: attacker.y,
    targetX: attacker.x, targetY: attacker.y + attacker.groundOffset + 14,
    text: ability.name,
    color: colorForType(ability.type),
    duration: 0.8,
    owner: attacker,
  }));
}

function executePlayerAction(world, player, engagedEnemies) {
  if (!player.canAct()) return;

  const primaryTarget = engagedEnemies[0];
  const ability = pickAbility(player, primaryTarget.poke, (a) =>
    engagedEnemies.filter((e) => !e.isDead && Math.hypot(e.x - player.x, e.y - player.y) <= a.radius).length
  );
  if (!ability) return;

  player.startCooldown(ability.id, scaledCooldown(ability, player.poke.stats.speed));
  player.startGlobalCooldown(MIN_ACTION_GAP);
  triggerAttackAnim(player, ability.target === 'aoe');
  announceAbility(world, player, ability);

  const targets = ability.target === 'aoe'
    ? engagedEnemies.filter((e) => !e.isDead && Math.hypot(e.x - player.x, e.y - player.y) <= ability.radius)
    : [engagedEnemies[0]].filter(Boolean);

  for (const target of targets) {
    queueHit(world, player, target, ability);
  }
}

function executeEnemyAction(world, enemy, player) {
  if (!enemy.canAct()) return;

  const ability = pickAbility(enemy, player.poke, () => 1); // enemies only ever target the single player
  if (!ability) return;

  enemy.startCooldown(ability.id, scaledCooldown(ability, enemy.poke.stats.speed));
  enemy.startGlobalCooldown(MIN_ACTION_GAP);
  triggerAttackAnim(enemy, ability.target === 'aoe');
  announceAbility(world, enemy, ability);

  queueHit(world, enemy, player, ability);
}

// Applies one queued hit's damage, floating combat text, attack-graphic
// effect and defeat/faint handling — called once its timer reaches 0, i.e.
// once the attacker's Shoot/Charge pose has finished playing.
function resolveHit(world, hit, defeatedEnemies, onPlayerFainted) {
  const { attacker, target, ability } = hit;
  if (target.isDead) return; // e.g. an AOE ally already finished it off first

  const result = computeDamage(attacker.poke, target.poke, ability);
  target.takeDamage(result.amount);
  spawnDamageNumber(world, target, result);

  const isPlayerAttacker = attacker === world.player;
  const isAoe = ability.target === 'aoe';
  world.effects.push(new Effect({
    type: 'abilityEffect',
    x: target.x, y: target.y,
    targetX: target.x, targetY: target.y - target.radius * 0.6,
    color: colorForType(ability.type),
    isAoe,
    duration: isAoe ? AOE_EFFECT_DURATION : IMPACT_EFFECT_DURATION,
    // AOE moves draw at their actual splash diameter instead of the flat
    // default size, so the ring visually matches the area it really hits.
    worldSize: isAoe ? ability.radius * 2 : undefined,
    elementType: ability.type,
  }));

  if (!target.isDead) return;
  if (isPlayerAttacker) {
    if (!target.deathHandled) {
      target.deathHandled = true;
      defeatedEnemies.push(target);
    }
  } else if (!target.fainted) {
    target.fainted = true;
    onPlayerFainted();
  }
}

// Returns { defeatedEnemies, playerJustFainted } so the caller (main.js) can
// hand out EXP/loot/capture rolls and trigger UI reactions.
export function updateCombat(world, dt) {
  const { player, enemies } = world;

  player.tickCooldowns(dt);
  for (const enemy of enemies) enemy.tickCooldowns(dt);
  for (const effect of world.effects) effect.tick(dt);
  for (const effect of world.effects) {
    if (effect.done && effect.owner) effect.owner.releaseEffectLane(effect.id);
  }
  world.effects = world.effects.filter((e) => !e.done);

  const defeatedEnemies = [];
  let playerJustFainted = false;

  for (const hit of world.pendingHits) hit.timer -= dt;
  const landed = world.pendingHits.filter((hit) => hit.timer <= 0);
  world.pendingHits = world.pendingHits.filter((hit) => hit.timer > 0);
  for (const hit of landed) {
    resolveHit(world, hit, defeatedEnemies, () => {
      playerJustFainted = true;
    });
  }

  if (player.fainted) {
    return { defeatedEnemies, playerJustFainted };
  }

  const engagedEnemies = enemies.filter((e) => !e.isDead && e.state === 'engaged' && e.target === player);

  if (engagedEnemies.length > 0) {
    executePlayerAction(world, player, engagedEnemies);

    for (const enemy of engagedEnemies) {
      if (enemy.isDead || player.fainted) continue;
      executeEnemyAction(world, enemy, player);
    }
  }

  return { defeatedEnemies, playerJustFainted };
}
