// Hunt map definitions: the 5 lowest-average-level wild locations from the
// spreadsheet (see scripts/sync-planilha.js#pickTopHunts), with world
// bounds/spawn points/background that are our own idle-game concept (the
// spreadsheet has no equivalent for those).
import { MAPS_DATA } from './maps.generated.js';
import { NIGHTMARE_MAPS_DATA } from './nightmareMaps.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from './formulas.generated.js';

// Modo Pesadelo hunts (see nightmareMaps.js) are hand-authored clones merged
// in at runtime, not part of the spreadsheet sync.
export const MAPS = { ...MAPS_DATA, ...NIGHTMARE_MAPS_DATA };

const formulaEngine = createFormulaEngine(FORMULAS);
// Spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia" section),
// fallback matches the old hardcoded value — enemies spawn 75% faster than
// the spreadsheet's raw respawnDelay by default.
const RESPAWN_DELAY_MULTIPLIER = formulaEngine.evalOrDefault('MOB_RESPAWN_DELAY_MULTIPLIER', 0.25);

export function getMap(id) {
  const map = MAPS[id];
  if (!map) return null;
  return { ...map, respawnDelay: map.respawnDelay * RESPAWN_DELAY_MULTIPLIER };
}

// The walkable area is a circle (not the full rectangular bounds — those
// just size the background tiling/camera math) inscribed in the shorter of
// the two dimensions, centered on the map. Shared by movement clamping
// (MovementSystem.js) and enemy/wander spawn placement (main.js) so both
// always agree on exactly where the invisible edge is.
export function mapWalkRadius(mapDef) {
  return Math.min(mapDef.bounds.width, mapDef.bounds.height) / 2;
}
