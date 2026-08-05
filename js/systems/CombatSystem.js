import { getAbility, BASIC_ATTACK, isDamagingAbility, resolveAbilityCategory } from '../data/abilities.js';
import { SPECIES } from '../data/pokes.js';
import { colorForType } from '../data/typeColors.js';
import { Effect } from '../entities/Effect.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from '../data/formulas.generated.js';
import { getEffectiveness } from '../data/typeChart.generated.js';
import { rollChance, randRange } from '../core/Random.js';
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

// Real Gen1/2 self-KO moves — explicit user-reported bug: these dealt damage
// to the TARGET only, with no recoil at all on the user, unlike the real
// games. Fixed per explicit spec: using either one costs the user 50% of
// their OWN current HP (not a full faint like the real games — a lighter,
// spreadsheet-independent debuff), applied once per cast regardless of how
// many enemies the AOE actually hits (see the isAoeVisual branch of
// resolveHit below, which already fires exactly once per cast).
const SELF_DESTRUCT_ABILITY_KEYS = new Set(['explosion', 'selfdestruct']);
const SELF_DESTRUCT_HP_LOSS_PERCENT = 0.5;

// Both spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia"
// section) with fallbacks matching the old hardcoded values.
const SPEED_REFERENCE = formulaEngine.evalOrDefault('ATTACK_SPEED_REFERENCE', 100); // speed stat value that maps to an ability's listed cooldown as-is
const BASE_ATTACK_INTERVAL = formulaEngine.evalOrDefault('BASIC_ATTACK_COOLDOWN', 2); // BASIC_ATTACK's cooldown, fixed — every POKE's baseline move (was 1.5s)
const MIN_ACTION_GAP = 2; // global cooldown: no two attacks from the same entity land closer than this (was 1s) — the real minimum time between any two actions
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

// Moves the spreadsheet marks with a `power: 1` placeholder (Magnitude,
// Seismic Toss, Counter, ...) don't use a flat base power in the real games —
// each has its own particular mechanic. Two shapes, both looked up by
// ability id:
//  - DYNAMIC_POWER_ABILITIES: computes a real power value for this hit, which
//    then still runs through the normal ATK/DEF/STAB/effectiveness/crit/
//    variance pipeline exactly like any other move (Magnitude/Reversal/
//    Flail/Present/Hidden Power all work this way in the real games).
//  - FIXED_DAMAGE_ABILITIES: computes the FINAL raw HP amount directly,
//    bypassing ATK/DEF/STAB — matches how these moves actually behave
//    (Seismic Toss/Night Shade/Dragon Rage/Super Fang/Horn Drill/Fissure/
//    Psywave/Counter/Mirror Coat). Still zeroed out by full type immunity,
//    but skips crit and the 85-100% random roll, since the real moves don't
//    apply those either.
function averageIv(ivs) {
  const vals = ivs ? Object.values(ivs) : [];
  if (!vals.length) return 0;
  return vals.reduce((sum, v) => sum + v, 0) / vals.length;
}

// Real Gen2 Magnitude roll: 7 possible magnitudes (4-10), each its own
// probability and fixed power.
const MAGNITUDE_TABLE = [
  { chance: 5, power: 10 }, { chance: 10, power: 30 }, { chance: 20, power: 50 },
  { chance: 30, power: 70 }, { chance: 20, power: 90 }, { chance: 10, power: 110 },
  { chance: 5, power: 150 },
];
function rollMagnitudePower() {
  let roll = Math.random() * 100;
  for (const tier of MAGNITUDE_TABLE) {
    if (roll < tier.chance) return tier.power;
    roll -= tier.chance;
  }
  return MAGNITUDE_TABLE[MAGNITUDE_TABLE.length - 1].power;
}

// Reversal/Flail: power climbs as the user's own remaining HP% drops.
function hpRatioPower(attackerPoke) {
  const ratio = Math.max(0, attackerPoke.hp) / attackerPoke.stats.hp;
  if (ratio <= 0.04) return 200;
  if (ratio <= 0.09) return 150;
  if (ratio <= 0.16) return 100;
  if (ratio <= 0.32) return 80;
  if (ratio <= 0.48) return 40;
  return 20;
}

// Present's real 4th outcome (heal the target) has no equivalent in this
// engine (no heal-the-opponent mechanic exists), so its odds are folded
// proportionally into the 3 damage tiers instead.
function rollPresentPower() {
  const roll = Math.random();
  if (roll < 0.4) return 40;
  if (roll < 0.7) return 80;
  return 120;
}

// This roster's IVs are on a 0-31 scale (Gen3+ convention), not the 0-15 DVs
// Gen2's real Hidden Power type/power formula reads from — with no DV data to
// derive a "real" type from, this keeps the spreadsheet's NORMAL-type
// placeholder and only makes the power dynamic (30-70 range, scaled by how
// close to max the POKE's average IV is), documented as a deliberate
// simplification rather than a faithful port of the Gen2 formula.
function hiddenPowerPower(attackerPoke) {
  return 30 + Math.round((averageIv(attackerPoke.ivs) / 31) * 40);
}

// Real Gen1/2 Psywave: random damage roughly 0.5x-1.5x the user's level,
// bypassing ATK/DEF entirely.
function psywaveDamage(attackerPoke) {
  return Math.max(1, Math.round(attackerPoke.level * randRange(0.5, 1.5)));
}

const DYNAMIC_POWER_ABILITIES = {
  magnitude: () => rollMagnitudePower(),
  reversal: (attackerPoke) => hpRatioPower(attackerPoke),
  flail: (attackerPoke) => hpRatioPower(attackerPoke),
  present: () => rollPresentPower(),
  hidden_power: (attackerPoke) => hiddenPowerPower(attackerPoke),
};

// Counter/Mirror Coat reflect 2x the last hit of the matching category the
// user itself took — real Gen2 only remembers "this turn"; approximated here
// as a short recent window since combat isn't strictly turn-based. With
// nothing recent to reflect, real Counter just fails (0 damage), but a
// hard-0 move an idle auto-battler's AI might rank highly would just look
// broken, so the caller (specialDamageFor) falls back to a plain hit instead.
const COUNTER_MEMORY_WINDOW = 3; // seconds
function counterDamage(attackerEntity, category) {
  const memory = attackerEntity.lastDamageTaken[category];
  if (memory.amount > 0 && memory.age <= COUNTER_MEMORY_WINDOW) return memory.amount * 2;
  return null;
}

const FIXED_DAMAGE_ABILITIES = {
  seismic_toss: (attackerPoke) => attackerPoke.level,
  night_shade: (attackerPoke) => attackerPoke.level,
  dragon_rage: () => 40,
  super_fang: (attackerPoke, defenderPoke) => Math.max(1, Math.floor(defenderPoke.hp / 2)),
  horn_drill: (attackerPoke, defenderPoke) => defenderPoke.hp,
  fissure: (attackerPoke, defenderPoke) => defenderPoke.hp,
  psywave: (attackerPoke) => psywaveDamage(attackerPoke),
  counter: (attackerPoke, defenderPoke, attackerEntity) => counterDamage(attackerEntity, 'physical'),
  mirror_coat: (attackerPoke, defenderPoke, attackerEntity) => counterDamage(attackerEntity, 'special'),
};

// Returns null (use the ability's own flat `power` through the normal
// pipeline) or one of:
//  { mode: 'dynamicPower', power }
//  { mode: 'fixed', amount }
function specialDamageFor(ability, attackerEntity, defenderEntity) {
  const attackerPoke = attackerEntity.poke;
  const defenderPoke = defenderEntity.poke;

  const dynamic = DYNAMIC_POWER_ABILITIES[ability.id];
  if (dynamic) return { mode: 'dynamicPower', power: dynamic(attackerPoke, defenderPoke, attackerEntity, defenderEntity) };

  const fixed = FIXED_DAMAGE_ABILITIES[ability.id];
  if (fixed) {
    const amount = fixed(attackerPoke, defenderPoke, attackerEntity, defenderEntity);
    if (amount === null) return { mode: 'dynamicPower', power: 40 }; // Counter/Mirror Coat with nothing to reflect
    return { mode: 'fixed', amount };
  }

  return null;
}

// Rough damage estimate (no crit, no roll variation) used only to rank
// candidate abilities against a specific target — mirrors computeDamage's
// pipeline minus the two random steps.
function estimateDamage(attackerEntity, defenderEntity, ability) {
  const attackerPoke = attackerEntity.poke;
  const defenderPoke = defenderEntity.poke;
  const attackerSpecies = SPECIES[attackerPoke.speciesId];
  const defenderSpecies = SPECIES[defenderPoke.speciesId];
  const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
  if (effectivenessMultiplier === 0) return 0;

  const special = specialDamageFor(ability, attackerEntity, defenderEntity);
  if (special && special.mode === 'fixed') return special.amount;

  const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical';
  const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
  const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;
  const power = special && special.mode === 'dynamicPower' ? special.power : ability.power;

  let dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def });

  const isStab = ability.type && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2);
  if (isStab) dmg *= STAB_MULTIPLIER;

  dmg *= effectivenessMultiplier;
  return dmg;
}

// Real Gen2 damage pipeline: DAMAGE_BASE -> STAB -> type effectiveness ->
// crit -> 85-100% variation. Returns the final amount plus enough info for
// the floating combat-text popup (effectiveness label, crit). Fixed-damage
// moves (see specialDamageFor) skip straight to a raw amount and bypass
// STAB/crit/variance, matching how they actually work — but are still
// zeroed out by full type immunity.
function computeDamage(attackerEntity, defenderEntity, ability) {
  const attackerPoke = attackerEntity.poke;
  const defenderPoke = defenderEntity.poke;
  const attackerSpecies = SPECIES[attackerPoke.speciesId];
  const defenderSpecies = SPECIES[defenderPoke.speciesId];
  const effectivenessMultiplier = getEffectiveness(ability.type, defenderSpecies.type, defenderSpecies.type2);
  const special = specialDamageFor(ability, attackerEntity, defenderEntity);

  let dmg;
  let isCrit = false;

  if (special && special.mode === 'fixed') {
    dmg = effectivenessMultiplier === 0 ? 0 : special.amount;
  } else {
    const isPhysical = resolveAbilityCategory(ability, attackerPoke) === 'physical';
    const atk = isPhysical ? attackerPoke.stats.atkFis : attackerPoke.stats.atkEsp;
    const def = isPhysical ? defenderPoke.stats.def : defenderPoke.stats.defEsp;
    const power = special && special.mode === 'dynamicPower' ? special.power : ability.power;

    dmg = formulaEngine.eval('DAMAGE_BASE', { level: attackerPoke.level, power, atk, def });

    const isStab = ability.type && (ability.type === attackerSpecies.type || ability.type === attackerSpecies.type2);
    if (isStab) dmg *= STAB_MULTIPLIER;

    dmg *= effectivenessMultiplier;

    isCrit = rollChance(CRIT_CHANCE);
    if (isCrit) dmg *= CRIT_MULTIPLIER;

    dmg *= formulaEngine.eval('DAMAGE_VARIATION');
  }

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
    amount: effectivenessMultiplier === 0 ? 0 : Math.max(1, Math.round(dmg)),
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
// Moves the player double-clicked off in AbilityHUD.js (`poke.disabledAbilities`,
// explicit user request) are excluded from auto-selection the same way — most
// useful for opting a POKE out of ever self-destructing (see
// SELF_DESTRUCT_ABILITY_KEYS below), but works as a general per-move on/off
// switch. Wild enemies never have this field set, so the filter is a no-op
// for them.
// `aoeTargetCounter` is a function (ability) => number of targets an AOE cast
// would hit, used to prefer AOE when it would strike multiple enemies.
function pickAbility(entity, defenderEntity, aoeTargetCounter) {
  const attackerSpecies = SPECIES[entity.poke.speciesId];
  const disabled = entity.poke.disabledAbilities || {};
  const candidateIds = [...entity.poke.unlockedAbilities, BASIC_ATTACK.id].filter((id) => !disabled[id]);
  const ready = candidateIds
    .map((id) => (id === BASIC_ATTACK.id ? basicAttackFor(attackerSpecies) : getAbility(id)))
    .filter((ability) => isDamagingAbility(ability) && entity.isAbilityReady(ability.id));

  if (ready.length === 0) return null;

  const aoeReady = ready.filter((a) => a.target === 'aoe' && aoeTargetCounter(a) >= 2);
  const pool = aoeReady.length > 0 ? aoeReady : ready;
  return pool.reduce((best, a) => (
    estimateDamage(entity, defenderEntity, a) > estimateDamage(entity, defenderEntity, best) ? a : best
  ));
}

// Queues a hit to land HIT_LAND_DELAY seconds from now — resolveHit() applies
// the actual damage/effect/defeat once that timer runs out, in step with the
// Shoot/Charge pose finishing (see updateCombat).
function queueHit(world, attacker, target, ability) {
  world.pendingHits.push({ timer: HIT_LAND_DELAY, attacker, target, ability });
}

// AOE moves get exactly ONE visual ring, centered on the attacker (the POKE
// that cast it), landing at the same instant as the per-target damage hits.
// Previously each hit in resolveHit spawned its own ring at the TARGET's
// position, so a 3-enemy AOE would show 3 separate rings each originating
// from a different enemy instead of one ring expanding out from the caster —
// explicit user-reported bug ("a area de dano deve partir do Pokemon que
// utiliza a habilidade, e nao no Pokemon alvo"). Queued the same way as a
// real hit (no `target`) so it lands in sync with the attack pose finishing;
// resolveHit special-cases `isAoeVisual` and skips the per-target ring below.
function queueAoeVisual(world, attacker, ability) {
  world.pendingHits.push({ timer: HIT_LAND_DELAY, attacker, target: null, ability, isAoeVisual: true });
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
  const ability = pickAbility(player, primaryTarget, (a) =>
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

  if (ability.target === 'aoe') queueAoeVisual(world, player, ability);
  for (const target of targets) {
    queueHit(world, player, target, ability);
  }
}

function executeEnemyAction(world, enemy, player) {
  if (!enemy.canAct()) return;

  const ability = pickAbility(enemy, player, () => 1); // enemies only ever target the single player
  if (!ability) return;

  enemy.startCooldown(ability.id, scaledCooldown(ability, enemy.poke.stats.speed));
  enemy.startGlobalCooldown(MIN_ACTION_GAP);
  triggerAttackAnim(enemy, ability.target === 'aoe');
  announceAbility(world, enemy, ability);

  if (ability.target === 'aoe') queueAoeVisual(world, enemy, ability);
  queueHit(world, enemy, player, ability);
}

// Applies one queued hit's damage, floating combat text, attack-graphic
// effect and defeat/faint handling — called once its timer reaches 0, i.e.
// once the attacker's Shoot/Charge pose has finished playing.
function resolveHit(world, hit, defeatedEnemies, onPlayerFainted) {
  const { attacker, target, ability } = hit;

  if (hit.isAoeVisual) {
    // The one ring for this AOE cast, centered on the attacker — see
    // queueAoeVisual. Individual target hits below skip drawing their own.
    world.effects.push(new Effect({
      type: 'abilityEffect',
      x: attacker.x, y: attacker.y,
      targetX: attacker.x, targetY: attacker.y - attacker.radius * 0.6,
      color: colorForType(ability.type),
      isAoe: true,
      duration: AOE_EFFECT_DURATION,
      worldSize: ability.radius * 2,
      elementType: ability.type,
    }));

    if (SELF_DESTRUCT_ABILITY_KEYS.has(ability.id) && !attacker.isDead) {
      const recoil = Math.round(attacker.poke.hp * SELF_DESTRUCT_HP_LOSS_PERCENT);
      attacker.takeDamage(recoil);
      spawnDamageNumber(world, attacker, { amount: recoil, effectiveness: 'normal', effectivenessLabel: null, isCrit: false });
      if (attacker.isDead) {
        if (attacker === world.player) {
          if (!attacker.fainted) {
            attacker.fainted = true;
            onPlayerFainted();
          }
        } else if (!attacker.deathHandled) {
          attacker.deathHandled = true;
          defeatedEnemies.push(attacker);
        }
      }
    }
    return;
  }

  if (target.isDead) return; // e.g. an AOE ally already finished it off first

  const result = computeDamage(attacker, target, ability);
  target.takeDamage(result.amount, resolveAbilityCategory(ability, attacker.poke));
  spawnDamageNumber(world, target, result);

  const isPlayerAttacker = attacker === world.player;
  const isAoe = ability.target === 'aoe';
  if (!isAoe) {
    world.effects.push(new Effect({
      type: 'abilityEffect',
      x: target.x, y: target.y,
      targetX: target.x, targetY: target.y - target.radius * 0.6,
      color: colorForType(ability.type),
      isAoe: false,
      duration: IMPACT_EFFECT_DURATION,
      elementType: ability.type,
    }));
  }

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
