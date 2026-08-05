import { randRange } from '../core/Random.js';
import { engageRangeFor } from './CombatSystem.js';
import { mapWalkRadius, isCellBlocked } from '../data/maps.js';

const WANDER_MARGIN = 40;
const ARRIVE_THRESHOLD = 4;
const WANDER_PAUSE_MIN = 1;
const WANDER_PAUSE_MAX = 3;

// A POKE's collision footprint is exactly 1 grid box (COLLISION_GRID_CELL_SIZE,
// see data/collisionGrids.generated.js) per explicit user request — checking
// just the entity's own center point against the grid is equivalent to that,
// since each cell already IS one box.
function canOccupy(mapDef, x, y) {
  return !isCellBlocked(mapDef, x, y);
}

// Moves toward (tx,ty), refusing to step into a blocked cell (walls/black
// void areas, see data/collisionGrids.generated.js) instead of ignoring
// collision entirely. Tries the full diagonal step first, then falls back to
// sliding along just the X or just the Y axis — simple axis-separated
// collision so a POKE grazing a wall at an angle slides along it instead of
// stopping dead, without needing real pathfinding for what's still a
// straight-line "walk toward a point" mover. `mapDef` is optional-safe: maps
// with no collision grid (10 of 17 hunt themes, see getMap) behave exactly
// as before this feature existed.
function moveToward(entity, tx, ty, speed, dt, mapDef) {
  const dx = tx - entity.x;
  const dy = ty - entity.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= ARRIVE_THRESHOLD) return true; // arrived
  const step = speed * dt;
  const ratio = Math.min(1, step / dist);
  const stepX = dx * ratio;
  const stepY = dy * ratio;
  entity.facing = { x: dx / dist, y: dy / dist };

  if (!mapDef || !mapDef.collisionGrid) {
    entity.x += stepX;
    entity.y += stepY;
    return false;
  }

  const fullX = entity.x + stepX, fullY = entity.y + stepY;
  if (canOccupy(mapDef, fullX, fullY)) {
    entity.x = fullX;
    entity.y = fullY;
  } else if (canOccupy(mapDef, fullX, entity.y)) {
    entity.x = fullX; // slide along the wall on the X axis
  } else if (canOccupy(mapDef, entity.x, fullY)) {
    entity.y = fullY; // slide along the wall on the Y axis
  } // else: fully blocked this step, hold position
  return false;
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
  } else {
    // A shiny anywhere in the hunt overrides everything else — the player
    // switches focus to it immediately, even mid-fight with something else.
    // Otherwise, whichever enemy is already coming for the player takes
    // priority as the walk-to target, so both sides close the distance at
    // the same time instead of the player standing still waiting to be
    // approached.
    const shinyEnemy = findNearestAliveShiny(player, enemies);
    const chasingEnemy = enemies.find(
      (e) => !e.isDead && (e.state === 'chase' || e.state === 'engaged') && e.target === player
    );
    const targetEnemy = shinyEnemy || chasingEnemy || findNearestAliveEnemy(player, enemies);

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
