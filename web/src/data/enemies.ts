// Wild encounter templates, one per (hunt map, species) pair — keyed
// `${mapId}_${speciesId}` — with the real per-location level range from the
// spreadsheet's Encontros sheet. Enemies are instances of the same POKE
// species the player can capture.
// Modo Pesadelo encounters (see nightmareMaps.js) and the hand-picked
// spawn-pool edits (see huntSpawnOverrides.js) are merged in at runtime —
// huntSpawnOverrides.js is the one place that does this merge, since it
// needs to patch both this file's encounters AND data/maps.js's enemyPools
// together.
import { ENCOUNTERS } from './huntSpawnOverrides'
import type { HuntEncounter } from './huntTypes'

export { ENCOUNTERS }

export function getEncounter(id: string): HuntEncounter | null {
  return ENCOUNTERS[id] || null
}
