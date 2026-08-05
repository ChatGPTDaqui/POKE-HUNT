import { resolveBattleAnim } from '../data/battleSprites.js';

// How long an attack pose (Shoot/Charge) stays on screen after firing — not
// tied to the sprite's own frame count, just a simple fixed flourish. Also
// used by CombatSystem as the hit-land delay, so damage/effects/defeat only
// happen once the attack pose has actually finished playing.
export const ATTACK_ANIM_DURATION = 0.5;

// 8 compass directions in the standard PMD sheet row order: Down, DownRight,
// Right, UpRight, Up, UpLeft, Left, DownLeft (clockwise from south).
const SECTOR_TO_ROW = [2, 1, 0, 7, 6, 5, 4, 3]; // sector 0=Right,1=DownRight,2=Down,3=DownLeft,4=Left,5=UpLeft,6=Up,7=UpRight

export function directionRowFromFacing(facing) {
  const angle = Math.atan2(facing.y, facing.x);
  const sector = (Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8;
  return SECTOR_TO_ROW[sector];
}

function desiredAnimName(entity) {
  if (entity.isDead) return 'Faint';
  if (entity.attackAnimTimer > 0) return entity.attackAnim;
  if (entity.state === 'wander' || entity.state === 'chase') return 'Walk';
  return 'Idle';
}

// Decrements attackAnimTimer for every entity — split out from
// updateAnimations below (which is skipped in silent/headless mode, see
// main.js#stepWorld) because MovementSystem.js also reads this same timer to
// LOCK movement while an attack pose plays (`todo POKE trava no lugar
// enquanto usa um golpe`). Real bug found live: since only updateAnimations
// ever ticked it down, a silent simulation (Farm Offline / background
// catch-up) permanently froze the acting entity in place the instant its
// very first attack fired — nothing left running would ever bring the timer
// back to 0, so movement stayed locked into 'engaged' for the rest of the
// simulation regardless of what was actually nearby. Must run every tick,
// silent or not.
export function tickAttackAnimTimers(world, dt) {
  for (const entity of [world.player, ...world.enemies]) {
    if (entity && entity.attackAnimTimer > 0) {
      entity.attackAnimTimer = Math.max(0, entity.attackAnimTimer - dt);
    }
  }
}

// Advances each entity's battle-sprite animation frame — sprite/frame
// selection only now (see tickAttackAnimTimers above for the timer itself,
// which movement also depends on and so can't be skipped when silent).
// Entities whose species has no battle sprites (resolveBattleAnim returns
// null) are left untouched and fall back to the geometric placeholder shape
// in render/Sprites.js.
export function updateAnimations(world, dt) {
  const entities = [world.player, ...world.enemies].filter(Boolean);

  for (const entity of entities) {
    const wantedName = desiredAnimName(entity);
    const resolved = resolveBattleAnim(entity.species.id, wantedName, entity.poke.isShiny);
    if (!resolved) {
      entity.battleAnim = null;
      continue;
    }

    if (!entity.battleAnim || entity.battleAnim.name !== resolved.name) {
      entity.battleAnim = resolved;
      entity.animFrame = 0;
      entity.animElapsed = 0;
    }

    const frameOnLastFrame = entity.animFrame >= resolved.durations.length - 1;
    const holdOnLastFrame = wantedName === 'Faint' && frameOnLastFrame;
    if (holdOnLastFrame) continue; // freeze on the fainted pose

    entity.animElapsed += dt;
    const frameDuration = resolved.durations[entity.animFrame] / 60;
    if (entity.animElapsed >= frameDuration) {
      entity.animElapsed -= frameDuration;
      entity.animFrame = frameOnLastFrame ? 0 : entity.animFrame + 1;
    }
  }
}

// Called by CombatSystem right when an attack fires, so the attacker briefly
// shows a Shoot (single-target) or Charge (AOE) pose instead of Walk/Idle.
export function triggerAttackAnim(entity, isAoe) {
  entity.attackAnim = isAoe ? 'Charge' : 'Shoot';
  entity.attackAnimTimer = ATTACK_ANIM_DURATION;
}
