// Hand-picked spawn-pool edits layered on top of the spreadsheet sync's
// automatic type-per-biome roster (scripts/sync-planilha.js#buildTypeRoster)
// — same "patch after the fact" pattern as nightmareMaps.js/legendaries.js/
// stones.js. These are one-off, explicit user requests that don't fit the
// generic "every species falls into its own type's hunt" rule, so they're
// applied here at merge time instead of touching sync-planilha.js's generic
// logic (which would risk breaking the "every type covered, nothing
// orphaned" invariant it guarantees for the other ~220 species) — and,
// since this runs after the sync instead of inside it, it's also safe
// against the next `npm run planilha:aplicar` silently regenerating these
// exact pools back to the generic roster and undoing the override.
//
// This is the ONE place both a hunt's `enemyPool` (data/maps.js) and its
// encounters (data/enemies.js) are merged (generated + Modo Pesadelo/BOSS/
// Lance) — both files need the post-override result, so the merge+patch
// happens once here and each just re-exports its half.
import { MAPS_DATA } from './maps.generated.js';
import { ENCOUNTERS_DATA } from './enemies.generated.js';
import { NIGHTMARE_MAPS_DATA, NIGHTMARE_ENCOUNTERS_DATA } from './nightmareMaps.js';
import { SPECIES } from './pokes.js';

const ROUTE_46_ID = 'route_46';
const COSTA_11_20_ID = 'lv_11_20_costa';
const DESERTO_21_30_ID = 'lv_21_30_deserto';
const RUINAS_ANCESTRAIS_ID = 'kanto_lv_36_55_ruinas_ancestrais';

// Own copy of every map's enemyPool array — the overrides below push/filter
// it in place, and MAPS_DATA/NIGHTMARE_MAPS_DATA's arrays must never be
// mutated directly (they're the actual generated/hand-authored module
// exports, shared by reference with anything else that might import them).
function cloneMapsWithOwnPools(mapsData) {
  const out = {};
  for (const [id, map] of Object.entries(mapsData)) {
    out[id] = { ...map, enemyPool: [...map.enemyPool] };
  }
  return out;
}

const maps = { ...cloneMapsWithOwnPools(MAPS_DATA), ...cloneMapsWithOwnPools(NIGHTMARE_MAPS_DATA) };
const encounters = { ...ENCOUNTERS_DATA, ...NIGHTMARE_ENCOUNTERS_DATA };

function removeEncounterFromMap(mapId, speciesId) {
  const map = maps[mapId];
  if (!map) return;
  const encId = map.enemyPool.find((id) => encounters[id] && encounters[id].speciesId === speciesId);
  if (!encId) return;
  map.enemyPool = map.enemyPool.filter((id) => id !== encId);
  delete encounters[encId];
}

// Mirrors the shape/conventions every real generated encounter already uses
// (aggroRadius/wanderRadius fixed at 175/60, weight = the species' real Gen2
// catch rate, level range = the destination hunt's own levelRange — see
// scripts/sync-planilha.js#syncMapsAndEncounters).
function addEncounterToMap(mapId, speciesId) {
  const map = maps[mapId];
  const species = SPECIES[speciesId];
  if (!map || !species) return;
  const encId = `${mapId}_${speciesId}`;
  if (encounters[encId]) return;
  encounters[encId] = {
    id: encId, speciesId,
    minLevel: map.levelRange[0], maxLevel: map.levelRange[1],
    aggroRadius: 175, wanderRadius: 60,
    weight: species.catchRate,
  };
  map.enemyPool.push(encId);
}

// 1) Hunt Inicial: explicit user request — Geodude out, Sentret in.
removeEncounterFromMap(ROUTE_46_ID, 'geodude');
addEncounterToMap(ROUTE_46_ID, 'sentret');

// 2) Wooper/Quagsire move from the Water hunt (Zona Nivel 11-20 Costa) to
// the Ground hunt (Zona Nivel 21-30 Deserto) — both are real WATER/GROUND
// dual-types, so this is exactly the "dual-typed species can spawn in
// either type's hunt" rule this game already uses elsewhere (see
// scripts/sync-planilha.js's MIN_TYPE_POOL fallback), just picked by hand
// for these two instead of the generic algorithm.
for (const speciesId of ['wooper', 'quagsire']) {
  removeEncounterFromMap(COSTA_11_20_ID, speciesId);
  addEncounterToMap(DESERTO_21_30_ID, speciesId);
}

// 3) Dragonite's spawn chance in Ruinas Ancestrais set to EXACTLY 1% of that
// hunt's pool. weightedPick's odds are `weight / sum(all weights in the
// pool)` (main.js#spawnEnemyAt) — deriving the target weight from whatever
// the OTHER species' weights currently sum to (instead of hardcoding some
// number that happens to work today) keeps this exactly 1% even if a future
// `npm run planilha:aplicar` changes that hunt's roster/weights.
const ruinsMap = maps[RUINAS_ANCESTRAIS_ID];
if (ruinsMap) {
  const dragoniteEncId = ruinsMap.enemyPool.find((id) => encounters[id] && encounters[id].speciesId === 'dragonite');
  if (dragoniteEncId) {
    const othersWeight = ruinsMap.enemyPool
      .filter((id) => id !== dragoniteEncId)
      .reduce((sum, id) => sum + (encounters[id] ? encounters[id].weight : 0), 0);
    // dragonite / (others + dragonite) = 0.01  =>  dragonite = others / 99
    encounters[dragoniteEncId].weight = othersWeight / 99;
  }
}

export const MAPS = maps;
export const ENCOUNTERS = encounters;
