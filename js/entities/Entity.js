import { SPECIES } from '../data/pokes.js';
import { footOffsetFraction } from '../data/spriteFootOffsets.js';

let nextEntityId = 1;

// Shared behaviour for anything that stands on the map and can fight:
// the player's active POKE and wild enemy POKEs.
export class Entity {
  constructor({ poke, x, y }) {
    this.id = `entity-${nextEntityId++}`;
    this.poke = poke; // plain data object from data/pokes.js#createPokeInstance
    this.x = x;
    this.y = y;
    this.facing = { x: 0, y: 1 };
    this.radius = 16;
    this.state = 'idle'; // idle | wander | chase | engaged | dead
    this.cooldowns = {}; // abilityId -> seconds remaining
    this.globalCooldown = 0; // minimum gap between any two ability uses, regardless of which move
    this.target = null; // opposing Entity when engaged
    this.deathHandled = false;
    this.flashTimer = 0; // brief white flash when taking damage, purely visual

    // Last hit taken per category, read by Counter (physical) / Mirror Coat
    // (special) to reflect 2x that amount — see CombatSystem.js#counterDamage.
    // `age` grows every tickCooldowns(dt) call and gates how "recent" a hit
    // has to be to still count as reflectable.
    this.lastDamageTaken = {
      physical: { amount: 0, age: Infinity },
      special: { amount: 0, age: Infinity },
    };

    // Battle sprite animation state (see systems/AnimationSystem.js). Attack
    // animations (Shoot/Charge) briefly override the movement-driven one.
    this.battleAnim = null; // resolved {name, url, frameWidth, frameHeight, durations}
    this.animFrame = 0;
    this.animElapsed = 0;
    this.attackAnim = null; // 'Shoot' | 'Charge', set by CombatSystem
    this.attackAnimTimer = 0;

    // Which vertical "lanes" of floating combat text (damage/ability-name/
    // reward numbers, see entities/Effect.js) are currently claimed above
    // this entity — lets several simultaneous texts stack without
    // overlapping instead of each guessing its own fixed offset.
    this.effectLanes = [];

    // A* route state (see core/Pathfinding.js + systems/MovementSystem.js).
    // null = undecided (next moveToward call must check line-of-sight or
    // compute a route); [] = "line of sight is clear, walk straight" (a
    // deliberately distinct state from null so a clear line doesn't get
    // re-checked every single frame); non-empty = actively following these
    // waypoints. pathTargetX/Y + pathRecalcTimer throttle how often a moving
    // target (e.g. a chased player) triggers a full recompute.
    this.pathWaypoints = null;
    this.pathIndex = 0;
    this.pathRecalcTimer = 0;
    this.pathTargetX = null;
    this.pathTargetY = null;
  }

  // Lowest unclaimed run of `size` consecutive lane slots above this entity —
  // claimed by an Effect at creation (see CombatSystem.js/main.js spawn
  // sites) and released once that effect finishes (see
  // CombatSystem.js#updateCombat's cleanup). `size` > 1 reserves extra room
  // for effects taller than one line (e.g. a damage number with an
  // effectiveness label stacked above it) so nothing else gets placed inside
  // that space.
  claimEffectLane(effectId, size = 1) {
    let lane = 0;
    for (;;) {
      const overlaps = this.effectLanes.some((e) => lane < e.lane + e.size && e.lane < lane + size);
      if (!overlaps) break;
      lane++;
    }
    this.effectLanes.push({ id: effectId, lane, size });
    return lane;
  }

  releaseEffectLane(effectId) {
    this.effectLanes = this.effectLanes.filter((e) => e.id !== effectId);
  }

  get species() {
    return SPECIES[this.poke.speciesId];
  }

  get maxHp() {
    return this.poke.stats.hp;
  }

  get isDead() {
    return this.poke.hp <= 0;
  }

  // Distance from this.y down to the actual visible "feet" in the current
  // battle-sprite frame (data/spriteFootOffsets.js — PMD frames carry a lot
  // of empty bounce/motion padding, so this is NOT just frameHeight/2, the
  // frame's bottom edge). Constant regardless of the battle sprite's
  // Bulbapedia-height scale (see data/pokeHeights.js), so shadows/floating
  // text/the scaled sprite itself all anchor to the same ground line instead
  // of drifting as an entity's scale changes.
  get groundOffset() {
    if (!this.battleAnim) return this.radius;
    return this.battleAnim.frameHeight * footOffsetFraction(this.species.id);
  }

  distanceTo(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  tickCooldowns(dt) {
    for (const key of Object.keys(this.cooldowns)) {
      this.cooldowns[key] = Math.max(0, this.cooldowns[key] - dt);
    }
    if (this.globalCooldown > 0) this.globalCooldown = Math.max(0, this.globalCooldown - dt);
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
    this.lastDamageTaken.physical.age += dt;
    this.lastDamageTaken.special.age += dt;
  }

  isAbilityReady(abilityId) {
    return !this.cooldowns[abilityId];
  }

  startCooldown(abilityId, seconds) {
    this.cooldowns[abilityId] = seconds;
  }

  // Whether enough time has passed since the last ability use at all, on top
  // of each move's own individual cooldown — stops two different low-cooldown
  // moves from firing back-to-back a frame apart.
  canAct() {
    return this.globalCooldown <= 0;
  }

  startGlobalCooldown(seconds) {
    this.globalCooldown = seconds;
  }

  takeDamage(amount, category) {
    this.poke.hp = Math.max(0, this.poke.hp - amount);
    this.flashTimer = 0.15;
    if (category === 'physical' || category === 'special') {
      this.lastDamageTaken[category] = { amount, age: 0 };
    }
  }

  heal(amount) {
    this.poke.hp = Math.min(this.maxHp, this.poke.hp + amount);
  }
}
