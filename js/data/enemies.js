// Wild encounter templates, one per (hunt map, species) pair — keyed
// `${mapId}_${speciesId}` — with the real per-location level range from the
// spreadsheet's Encontros sheet. Enemies are instances of the same POKE
// species the player can capture.
import { ENCOUNTERS_DATA } from './enemies.generated.js';
import { NIGHTMARE_ENCOUNTERS_DATA } from './nightmareMaps.js';

// Modo Pesadelo encounters (see nightmareMaps.js) merged in at runtime.
export const ENCOUNTERS = { ...ENCOUNTERS_DATA, ...NIGHTMARE_ENCOUNTERS_DATA };

export function getEncounter(id) {
  return ENCOUNTERS[id] || null;
}
