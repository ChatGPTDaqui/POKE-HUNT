// Hunt map definitions: the 5 lowest-average-level wild locations from the
// spreadsheet (see scripts/sync-planilha.js#pickTopHunts), with world
// bounds/spawn points/background that are our own idle-game concept (the
// spreadsheet has no equivalent for those).
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { COLLISION_GRIDS, COLLISION_GRID_CELL_SIZE } from './generated/collisionGrids.generated'
import { WATER_COLLISION_GRID, WATER_SPAWN_POINT } from './generated/waterCollisionMask.generated'
import { FAIXAS, huntId } from './biomas'
import type { HuntMapDef } from './huntTypes'

// Modo Pesadelo hunts (see nightmareMaps.js) and the hand-picked spawn-pool
// edits (see huntSpawnOverrides.js) are merged in at runtime, not part of
// the spreadsheet sync — huntSpawnOverrides.js is the one place that does
// this merge, since it needs to patch both this file's enemyPools AND
// data/enemies.js's encounters together.
import { MAPS } from './huntSpawnOverrides'
export { MAPS }

export interface MapDef extends HuntMapDef {
  collisionGrid: string[] | null
}

const formulaEngine = createFormulaEngine(FORMULAS)
// Spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia" section),
// fallback matches the old hardcoded value — enemies spawn 75% faster than
// the spreadsheet's raw respawnDelay by default.
const RESPAWN_DELAY_MULTIPLIER = formulaEngine.evalOrDefault('MOB_RESPAWN_DELAY_MULTIPLIER', 0.25)

// Explicit user request: temporarily pause the wall/obstacle collision
// system (the per-background grid baked by scripts/build-collision-grids.js
// — water banks, cave walls, cliffs) so every POKE can walk freely across
// the whole map with nothing blocking them, while leaving the rest of the
// system in place to flip back on later (just set this back to true).
// Doesn't touch the separate circular map-edge clamp (mapWalkRadius below /
// MovementSystem.js), which is what actually keeps POKEs inside the hunt at
// all and isn't part of "wall block".
const WALL_BLOCK_ENABLED = false

// Explicit user request: reactivate wall-block EXCLUSIVELY for the real
// Water hunts, using a hand-painted mask
// (scripts/build-water-collision-mask.js) instead of the pixel-heuristic
// grid above.
//
// Keyed by BIOME, not by `bg.image`: art is shared between themes (see
// data/biomas.ts#ARTE), so keying by image would leak the water collision
// onto whatever else happens to reuse water.png. Derived from the biome list
// rather than a hand-typed id list so a new level band never silently misses
// the mask.
const WATER_BIOMAS = ['marinho', 'aguas_interiores']
const WATER_HUNT_IDS = new Set(
  WATER_BIOMAS.flatMap((bioma) => FAIXAS.map((faixa) => huntId(bioma, faixa.id))),
)

// Only the 7 hunt themes with real background art (see
// scripts/build-collision-grids.js) have a grid — every other hunt gets
// `collisionGrid: null` and keeps the old fully-open walkable circle
// (js/systems/MovementSystem.js treats a null grid as "no extra blocking").
export function getMap(id: string): MapDef | null {
  const map = MAPS[id]
  if (!map) return null
  if (WATER_HUNT_IDS.has(id)) {
    return {
      ...map,
      respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER,
      collisionGrid: WATER_COLLISION_GRID,
      playerSpawn: WATER_SPAWN_POINT,
    }
  }
  const collisionGrid = WALL_BLOCK_ENABLED
    ? (map.bg && map.bg.image && COLLISION_GRIDS[map.bg.image]) || null
    : null
  return { ...map, respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER, collisionGrid }
}

export function isCellBlocked(mapDef: MapDef, x: number, y: number): boolean {
  const grid = mapDef.collisionGrid
  if (!grid) return false
  const col = Math.floor(x / COLLISION_GRID_CELL_SIZE)
  const row = Math.floor(y / COLLISION_GRID_CELL_SIZE)
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return false
  return grid[row][col] === '1'
}

// The walkable area is a circle (not the full rectangular bounds — those
// just size the background tiling/camera math) inscribed in the shorter of
// the two dimensions, centered on the map. Shared by movement clamping
// (MovementSystem.js) and enemy/wander spawn placement (main.js) so both
// always agree on exactly where the invisible edge is.
export function mapWalkRadius(mapDef: { bounds: { width: number; height: number } }): number {
  return Math.min(mapDef.bounds.width, mapDef.bounds.height) / 2
}
