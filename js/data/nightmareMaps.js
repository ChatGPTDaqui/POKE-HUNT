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

// Same 7-of-17 real per-type background art as the regular hunts (see
// scripts/sync-planilha.js#TYPE_BACKGROUND_IMAGE) — duplicated here rather
// than shared, since this file runs as an ES module at runtime while the
// sync script is a plain Node/CJS build script (no clean way to import one
// from the other, and it's only 7 lines).
const TYPE_BACKGROUND_IMAGE = {
  FIRE: 'assets/hunt-backgrounds/fire.png',
  WATER: 'assets/hunt-backgrounds/water.png',
  GRASS: 'assets/hunt-backgrounds/forest.png',
  ROCK: 'assets/hunt-backgrounds/cave.png',
  FIGHTING: 'assets/hunt-backgrounds/dojo.png',
  ELECTRIC: 'assets/hunt-backgrounds/eletric.png',
  DRAGON: 'assets/hunt-backgrounds/dragon.png',
};

// BOSS hunts have no "bracket" of mixed types to average like regular hunts
// do — just the one legendary's own typing. Falls back from primary to
// secondary type (matching the same primary->secondary reinforcement logic
// World Building v2 already uses for thin type pools), then to the
// procedural checkerboard (null) if neither has dedicated art.
function bossBackgroundImage(species) {
  return TYPE_BACKGROUND_IMAGE[species.type] || TYPE_BACKGROUND_IMAGE[species.type2] || null;
}

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
      bg: { primary: '#3e2f23', secondary: '#4a3829', image: bossBackgroundImage(species) },
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

// Champion Lance: a single hunt with an ORDERED 6-POKE team fought one at a
// time (real trainer-battle style), not the single-legendary-no-respawn
// shape every other BOSS hunt uses — see main.js#spawnSequenceEnemy/
// stepWorld's respawn block (`mapDef.sequence`, generic enough for any
// future sequence-boss, not hardcoded to Lance by name there) and
// `autoSwitchTeamOnFaint` (main.js's playerJustFainted handling): the next
// team member fields automatically on a faint instead of the usual BOSS
// "you're done, walk back to the Hospital" modal — only when the WHOLE team
// is down does that modal show. `noRespawn: true` (shared with every other
// BOSS hunt) already disables auto-pot/auto-revive via AutoSystem.js, which
// covers "proibido auto-pot e revive" for free.
export const LANCE_MAP_ID = 'boss_lance';
// Per explicit user request: every Lance POKE is raridade Lendario with a
// FIXED (not rolled) IV of 23 on all 6 stats — deliberately not the 31 max,
// and not random like a normal wild encounter.
const LANCE_RARITY = 'legendary';
const LANCE_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 };
// Exact composition and order from the user's spec — index 0 fights first.
const LANCE_TEAM = [
  { speciesId: 'gyarados', level: 60 },
  { speciesId: 'dragonite', level: 55 },
  { speciesId: 'charizard', level: 60 },
  { speciesId: 'dragonite', level: 56 },
  { speciesId: 'aerodactyl', level: 60 },
  { speciesId: 'dragonite', level: 65 },
];

function buildLanceHunt() {
  const encounters = {};
  const enemyPool = LANCE_TEAM.map((entry, i) => {
    const encId = `${LANCE_MAP_ID}_${i}`;
    encounters[encId] = {
      id: encId, speciesId: entry.speciesId, minLevel: entry.level, maxLevel: entry.level,
      aggroRadius: 175, wanderRadius: 60, weight: 1,
      rarity: LANCE_RARITY, ivs: LANCE_IVS,
    };
    return encId;
  });

  const map = {
    id: LANCE_MAP_ID,
    name: 'BOSS Campeao Lance',
    description: 'Batalha final contra o Campeao Lance — 6 POKEs Lendarios em sequencia (Gyarados, Dragonite, Charizard, Dragonite, Aerodactyl, Dragonite). Sem auto-pot/revive; ao desmaiar, o proximo POKE da equipe entra automaticamente.',
    levelRange: [55, 65],
    unlockCost: null,
    continent: 'nightmare',
    bounds: { width: 2800, height: 1800 },
    playerSpawn: { x: 1400, y: 900 },
    bg: { primary: '#3e2f23', secondary: '#4a3829', image: TYPE_BACKGROUND_IMAGE.DRAGON },
    maxEnemies: 1,
    noRespawn: true,
    autoSwitchTeamOnFaint: true,
    sequence: enemyPool, // ordered encounter ids — main.js walks through them one at a time instead of picking randomly
    respawnDelay: 3,
    spawnPoints: [{ x: 1400, y: 900 }],
    enemyPool,
    itemDrops: [],
  };

  return { map, encounters };
}

const nightmare = buildNightmareMirror();
const bosses = buildBossHunts();
const lance = buildLanceHunt();

export const NIGHTMARE_MAPS_DATA = { ...nightmare.maps, ...bosses.maps, [LANCE_MAP_ID]: lance.map };
export const NIGHTMARE_ENCOUNTERS_DATA = { ...nightmare.encounters, ...bosses.encounters, ...lance.encounters };
