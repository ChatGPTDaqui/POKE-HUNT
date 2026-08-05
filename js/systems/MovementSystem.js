import { randRange } from '../core/Random.js';
import { engageRangeFor } from './CombatSystem.js';
import { mapWalkRadius, isCellBlocked } from '../data/maps.js';
import { COLLISION_GRID_CELL_SIZE } from '../data/collisionGrids.generated.js';
import { findPath } from '../core/Pathfinding.js';

const WANDER_MARGIN = 40;
const ARRIVE_THRESHOLD = 4;
const WANDER_PAUSE_MIN = 1;
const WANDER_PAUSE_MAX = 3;

// How often (seconds) a moving target (e.g. the player, while an enemy
// chases it) forces a full route recompute — cheap enough on this grid size
// to run this often without a frame hitch, but not so often it recomputes
// every single tick for no reason.
const PATH_RECALC_INTERVAL = 1;
// A tracked target has to drift this many world units from where the current
// route/line-of-sight check was last computed against before that alone
// forces an early recompute (on top of the timer above).
const PATH_TARGET_DRIFT = 60;
// A much bigger jump (e.g. an entity switching from a wander target to
// chasing the player, or vice-versa) bypasses the recalc timer entirely —
// otherwise a state switch could keep an entity walking toward its old,
// now-irrelevant target for up to PATH_RECALC_INTERVAL seconds.
const PATH_TARGET_BIG_JUMP = 150;

// A POKE's collision footprint is exactly 1 grid box (COLLISION_GRID_CELL_SIZE,
// see data/collisionGrids.generated.js) per explicit user request — checking
// just the entity's own center point against the grid is equivalent to that,
// since each cell already IS one box.
function canOccupy(mapDef, x, y) {
  return !isCellBlocked(mapDef, x, y);
}

// Straight-line step with no collision awareness — safe to use either when
// there's no grid at all, or along a segment already verified walkable
// (a clear line-of-sight check, or a leg of an A* route).
function stepDirect(entity, tx, ty, speed, dt) {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE_THRESHOLD) return true;
  const step = Math.min(1, (speed * dt) / dist);
  entity.x += dx * step;
  entity.y += dy * step;
  entity.facing = { x: dx / dist, y: dy / dist };
  return false;
}

// Old axis-separated collision fallback: tries the full diagonal step, then
// slides along just the X or just the Y axis. Used only when A* itself
// couldn't find a route (goal cell blocked/unreachable) — better than
// freezing solid, even though it can still get stuck against a concave wall.
function slideToward(entity, tx, ty, speed, dt, mapDef) {
  const dx = tx - entity.x, dy = ty - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= ARRIVE_THRESHOLD) return true;
  const step = speed * dt;
  const ratio = Math.min(1, step / dist);
  const stepX = dx * ratio, stepY = dy * ratio;
  entity.facing = { x: dx / dist, y: dy / dist };
  const fullX = entity.x + stepX, fullY = entity.y + stepY;
  if (canOccupy(mapDef, fullX, fullY)) {
    entity.x = fullX;
    entity.y = fullY;
  } else if (canOccupy(mapDef, fullX, entity.y)) {
    entity.x = fullX;
  } else if (canOccupy(mapDef, entity.x, fullY)) {
    entity.y = fullY;
  }
  return false;
}

// Samples points along the straight segment from (x0,y0) to (x1,y1) at
// roughly half a grid cell apart, checking each against the collision grid —
// cheap "can I just walk there directly" probe, run only when a route needs
// (re)deciding, never every frame.
function hasLineOfSight(mapDef, x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / (COLLISION_GRID_CELL_SIZE / 2)));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (isCellBlocked(mapDef, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// Moves an entity toward (tx,ty), routing around obstacles (walls/void/water,
// see data/collisionGrids.generated.js) via real A* pathfinding
// (core/Pathfinding.js) instead of just sliding along whatever it grazes —
// a POKE now actually walks around a wall to reach a target on the other
// side instead of getting stuck against it. `mapDef` is optional-safe: maps
// with no collision grid (10 of 17 hunt themes, see getMap) skip all of this
// and always move in a straight line, exactly as before this feature existed.
function moveToward(entity, tx, ty, speed, dt, mapDef) {
  if (!mapDef || !mapDef.collisionGrid) {
    return stepDirect(entity, tx, ty, speed, dt);
  }

  const dist = Math.hypot(tx - entity.x, ty - entity.y);
  if (dist <= ARRIVE_THRESHOLD) {
    entity.pathWaypoints = null;
    return true;
  }

  entity.pathRecalcTimer -= dt;
  const targetJump = Math.hypot(tx - (entity.pathTargetX ?? tx), ty - (entity.pathTargetY ?? ty));
  const drifted = targetJump > PATH_TARGET_DRIFT;
  const bigJump = targetJump > PATH_TARGET_BIG_JUMP;
  if (entity.pathWaypoints == null || bigJump || (drifted && entity.pathRecalcTimer <= 0)) {
    if (hasLineOfSight(mapDef, entity.x, entity.y, tx, ty)) {
      entity.pathWaypoints = []; // clear line — walk straight, no route needed
    } else {
      const route = findPath(mapDef, entity.x, entity.y, tx, ty);
      entity.pathWaypoints = route || []; // null (unreachable) falls back to the direct/slide branch below
      entity.pathIndex = 0;
    }
    entity.pathTargetX = tx;
    entity.pathTargetY = ty;
    entity.pathRecalcTimer = PATH_RECALC_INTERVAL;
  }

  if (entity.pathWaypoints.length > 0) {
    const wp = entity.pathWaypoints[entity.pathIndex];
    const arrivedAtWaypoint = stepDirect(entity, wp.x, wp.y, speed, dt);
    if (arrivedAtWaypoint) {
      entity.pathIndex += 1;
      if (entity.pathIndex >= entity.pathWaypoints.length) entity.pathWaypoints = null;
    }
    return false;
  }

  // No route needed (clear line) or none found (goal unreachable) — walk
  // straight, still sliding off anything it grazes rather than freezing.
  return slideToward(entity, tx, ty, speed, dt, mapDef);
}

// Pulls (x, y) back onto the map's circular walkable edge if it landed
// outside it — the hunt map has no rectangular corners anymore, just this
// invisible circle (see data/maps.js#mapWalkRadius).
function clampToMapCircle(x, y, mapCx, mapCy, mapRadius) {
  const dx = x - mapCx;
  const dy = y - mapCy;
  const dist = Math.hypot(dx, dy);
  if (dist <= mapRadius || dist === 0) return { x, y };
  const ratio = mapRadius / dist;
  return { x: mapCx + dx * ratio, y: mapCy + dy * ratio };
}

function wanderStep(entity, dt, centerX, centerY, radius, mapCx, mapCy, mapRadius, mapDef) {
  if (entity.wanderTarget) {
    const prevX = entity.x, prevY = entity.y;
    const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef);
    // A wander target that turned out to be behind a wall would otherwise
    // freeze this entity forever (moveToward's collision holds position, so
    // `arrived` never becomes true) — treat "didn't move at all this frame"
    // the same as arriving: give up on it and roll a fresh target.
    const stuck = !arrived && entity.x === prevX && entity.y === prevY;
    if (arrived || stuck) {
      entity.wanderTarget = null;
      entity.wanderPause = randRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
    }
    return;
  }
  if (entity.wanderPause > 0) {
    entity.wanderPause -= dt;
    return;
  }
  const angle = randRange(0, Math.PI * 2);
  const dist = randRange(radius * 0.3, radius);
  const tx = centerX + Math.cos(angle) * dist;
  const ty = centerY + Math.sin(angle) * dist;
  entity.wanderTarget = clampToMapCircle(tx, ty, mapCx, mapCy, mapRadius);
}

function findNearestAliveEnemy(player, enemies) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const enemy of enemies) {
    if (enemy.isDead) continue;
    const dist = player.distanceTo(enemy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

// A shiny anywhere in the hunt always wins the player's attention — nearest
// shiny if there's more than one alive at once, overriding whatever it was
// chasing/fighting before (see updateMovement's target selection below).
function findNearestAliveShiny(player, enemies) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const enemy of enemies) {
    if (enemy.isDead || !enemy.poke.isShiny) continue;
    const dist = player.distanceTo(enemy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = enemy;
    }
  }
  return nearest;
}

function wanderFreely(entity, dt, cx, cy, radius, mapDef) {
  if (entity.wanderTarget) {
    const prevX = entity.x, prevY = entity.y;
    const arrived = moveToward(entity, entity.wanderTarget.x, entity.wanderTarget.y, entity.moveSpeed, dt, mapDef);
    // See wanderStep's identical comment — a target behind a wall must not
    // freeze the entity forever.
    const stuck = !arrived && entity.x === prevX && entity.y === prevY;
    if (arrived || stuck) {
      entity.wanderTarget = null;
      entity.wanderPause = randRange(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
    }
    return;
  }
  if (entity.wanderPause > 0) {
    entity.wanderPause -= dt;
    return;
  }
  // Uniform-over-area sampling within the circle (sqrt of a uniform [0,1]
  // radius fraction) rather than uniform-over-radius, which would bunch
  // points too densely near the center.
  const angle = randRange(0, Math.PI * 2);
  const dist = Math.sqrt(randRange(0, 1)) * radius;
  entity.wanderTarget = { x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist };
}

export function updateMovement(world, dt) {
  const { player, enemies, mapDef } = world;
  const mapCx = mapDef.bounds.width / 2;
  const mapCy = mapDef.bounds.height / 2;
  const mapRadius = mapWalkRadius(mapDef) - WANDER_MARGIN;

  if (player.fainted) {
    player.state = 'dead';
  } else if (player.attackAnimTimer > 0) {
    // Mid Shoot/Charge pose: hold position — a POKE must never walk and use
    // an ability in the same instant (explicit user request). The pose plays
    // for ATTACK_ANIM_DURATION (AnimationSystem.js), which is also exactly
    // when the hit lands (CombatSystem.js#HIT_LAND_DELAY), so this window is
    // already the entity's "committed to this attack" period.
    player.state = 'engaged';
  } else {
    // A shiny anywhere in the hunt overrides everything else — the player
    // switches focus to it immediately, even mid-fight with something else.
    // Otherwise the player always walks toward whichever alive enemy is
    // currently CLOSEST (explicit user request: "focar no alvo mais proximo
    // e redefinir esse alvo toda vez que derrotar um inimigo") — recomputed
    // fresh every frame, so a just-defeated enemy (already filtered out of
    // `enemies` as dead by findNearestAliveEnemy) immediately hands the
    // target over to whichever one is nearest now, and the player actively
    // walks across the map to it instead of only ever fighting whatever
    // happens to already be approaching.
    const shinyEnemy = findNearestAliveShiny(player, enemies);
    const targetEnemy = shinyEnemy || findNearestAliveEnemy(player, enemies);

    if (targetEnemy) {
      const engageRange = engageRangeFor(player, targetEnemy);
      if (player.distanceTo(targetEnemy) <= engageRange) {
        player.state = 'engaged';
      } else {
        player.state = 'chase';
        moveToward(player, targetEnemy.x, targetEnemy.y, player.moveSpeed, dt, mapDef);
        player.wanderTarget = null;
      }
    } else {
      player.state = 'wander';
      wanderFreely(player, dt, mapCx, mapCy, mapRadius, mapDef);
    }
  }

  for (const enemy of enemies) {
    if (enemy.isDead) {
      enemy.state = 'dead';
      continue;
    }

    if (enemy.attackAnimTimer > 0) {
      // Same lock as the player above — never walk mid-attack.
      enemy.state = 'engaged';
      continue;
    }

    if (player.fainted) {
      enemy.state = 'wander';
      enemy.target = null;
      wanderStep(enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef);
      continue;
    }

    const dist = enemy.distanceTo(player);
    const engageRange = engageRangeFor(enemy, player);

    if (dist <= engageRange) {
      enemy.state = 'engaged';
      enemy.target = player;
      enemy.wanderTarget = null;
    } else if (dist <= enemy.aggroRadius || ((enemy.state === 'chase' || enemy.state === 'engaged') && dist <= enemy.leashRadius)) {
      enemy.state = 'chase';
      enemy.target = player;
      enemy.wanderTarget = null;
      moveToward(enemy, player.x, player.y, enemy.moveSpeed, dt, mapDef);
    } else {
      enemy.state = 'wander';
      enemy.target = null;
      const distToSpawn = Math.hypot(enemy.x - enemy.spawnPoint.x, enemy.y - enemy.spawnPoint.y);
      if (distToSpawn > enemy.wanderRadius) {
        moveToward(enemy, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.moveSpeed, dt, mapDef);
        enemy.wanderTarget = null;
      } else {
        wanderStep(enemy, dt, enemy.spawnPoint.x, enemy.spawnPoint.y, enemy.wanderRadius, mapCx, mapCy, mapRadius, mapDef);
      }
    }
  }
}
