// Modo Pesadelo: every regular hunt (Johto zones + Kanto bands) mirrored with
// every spawn level +100, plus one hunt per legendary where it spawns alone
// at level 300 and doesn't respawn (see `noRespawn`, consumed by
// main.js#stepWorld's respawn check) — the only way to encounter a legendary
// at all now that the "Camara dos Lendarios" farmable hunt is gone.
//
// Hand-authored at runtime rather than routed through
// scripts/sync-planilha.js: this is a mechanical transform of data that's
// already been synced (level-shift a clone), not new spreadsheet content, so
// extending the codegen pipeline for it would be overkill and would risk the
// next `npm run planilha:aplicar` clobbering it. Confirmed with the user:
// totally free, no unlockCost anywhere in here.
import { MAPS_DATA } from './maps.generated.js';
import { ENCOUNTERS_DATA } from './enemies.generated.js';
import { SPECIES } from './pokes.js';
import { LEGENDARY_SPECIES_IDS } from './legendaries.js';

const LEVEL_OFFSET = 100;
const BOSS_LEVEL = 300;
// Floor applied on top of the +100 offset (explicit user request: "os
// pokemons do modo pesadelo mais fracos agora possuem o lvl 150") — the
// weakest base hunt (Route 46 Inicial, ~Lv1-2) would only reach ~101-102
// with a flat +100, so every mirrored level is clamped up to this floor
// instead. Kanto's mirrored zones already clear 150 on their own (their base
// levels got their own +50 bump, see sync-planilha.js#KANTO_BANDS), so the
// floor only ever kicks in for the low Johto zones.
const NIGHTMARE_MIN_LEVEL = 150;
const shiftLevel = (level) => Math.max(level + LEVEL_OFFSET, NIGHTMARE_MIN_LEVEL);

function buildNightmareMirror() {
  const maps = {};
  const encounters = {};

  for (const map of Object.values(MAPS_DATA)) {
    const newId = `nightmare_${map.id}`;
    const enemyPool = [];
    for (const encId of map.enemyPool) {
      const enc = ENCOUNTERS_DATA[encId];
      if (!enc) continue;
      const newEncId = `nightmare_${encId}`;
      encounters[newEncId] = {
        ...enc,
        id: newEncId,
        minLevel: shiftLevel(enc.minLevel),
        maxLevel: shiftLevel(enc.maxLevel),
      };
      enemyPool.push(newEncId);
    }
    maps[newId] = {
      ...map,
      id: newId,
      name: `${map.name} (Pesadelo)`,
      continent: 'nightmare',
      levelRange: [shiftLevel(map.levelRange[0]), shiftLevel(map.levelRange[1])],
      unlockCost: null,
      enemyPool,
    };
  }

  return { maps, encounters };
}

function buildBossHunts() {
  const maps = {};
  const encounters = {};

  for (const speciesId of LEGENDARY_SPECIES_IDS) {
    const species = SPECIES[speciesId];
    if (!species) continue;
    const mapId = `boss_${speciesId}`;
    const encId = `${mapId}_encounter`;
    encounters[encId] = {
      id: encId, speciesId, minLevel: BOSS_LEVEL, maxLevel: BOSS_LEVEL,
      aggroRadius: 175, wanderRadius: 60, weight: 1,
    };
    maps[mapId] = {
      id: mapId,
      name: `BOSS ${species.name}`,
      description: `Covil do lendario ${species.name} (nivel ${BOSS_LEVEL}) — aparece uma unica vez, sem respawn.`,
      levelRange: [BOSS_LEVEL, BOSS_LEVEL],
      unlockCost: null,
      continent: 'nightmare',
      bounds: { width: 2800, height: 1800 },
      playerSpawn: { x: 1400, y: 900 },
      bg: { primary: '#3e2f23', secondary: '#4a3829', image: 'assets/Hunt background.png' },
      maxEnemies: 1,
      noRespawn: true,
      respawnDelay: 6,
      spawnPoints: [{ x: 1400, y: 900 }],
      enemyPool: [encId],
      itemDrops: [],
    };
  }

  return { maps, encounters };
}

const nightmare = buildNightmareMirror();
const bosses = buildBossHunts();

export const NIGHTMARE_MAPS_DATA = { ...nightmare.maps, ...bosses.maps };
export const NIGHTMARE_ENCOUNTERS_DATA = { ...nightmare.encounters, ...bosses.encounters };
