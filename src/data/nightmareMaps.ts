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
import { SPECIES } from './pokes'
import { GEOMETRIA, GRUPOS_DO_LANCE } from './biomas'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import type { ElementType, SpeciesDataEntry } from './generated/types'
import type { HuntMapDef, HuntEncounter, StatBlock } from './huntTypes'
import type { RarityKey } from './rarity'

// Same all-18-types real per-type background art as the regular hunts (see
// scripts/sync-planilha.js#TYPE_BACKGROUND_IMAGE — only 7 real images exist
// on disk, the other 10 types reuse the closest-fitting one so no hunt is
// ever left on the procedural checkerboard) — duplicated here rather than
// shared, since this file runs as an ES module at runtime while the sync
// script is a plain Node/CJS build script (no clean way to import one from
// the other).
const TYPE_BACKGROUND_IMAGE: Partial<Record<ElementType, string>> = {
  FIRE: 'assets/hunt-backgrounds/fire.png',
  WATER: 'assets/hunt-backgrounds/water.png',
  GRASS: 'assets/hunt-backgrounds/forest.png',
  ROCK: 'assets/hunt-backgrounds/cave.png',
  FIGHTING: 'assets/hunt-backgrounds/dojo.png',
  ELECTRIC: 'assets/hunt-backgrounds/eletric.png',
  DRAGON: 'assets/hunt-backgrounds/dragon.png',
  BUG: 'assets/hunt-backgrounds/forest.png',
  NORMAL: 'assets/hunt-backgrounds/forest.png',
  POISON: 'assets/hunt-backgrounds/water.png',
  FLYING: 'assets/hunt-backgrounds/water.png',
  GROUND: 'assets/hunt-backgrounds/cave.png',
  ICE: 'assets/hunt-backgrounds/cave.png',
  STEEL: 'assets/hunt-backgrounds/cave.png',
  PSYCHIC: 'assets/hunt-backgrounds/dojo.png',
  GHOST: 'assets/hunt-backgrounds/cave.png',
  DARK: 'assets/hunt-backgrounds/cave.png',
  FAIRY: 'assets/hunt-backgrounds/forest.png',
}

// BOSS hunts have no "bracket" of mixed types to average like regular hunts
// do — just the one legendary's own typing. Every real type now has an
// entry in TYPE_BACKGROUND_IMAGE, so this always resolves to a real image;
// the secondary-type fallback stays as a defensive backstop only.
function bossBackgroundImage(species: SpeciesDataEntry): string | null {
  return TYPE_BACKGROUND_IMAGE[species.type] || (species.type2 ? TYPE_BACKGROUND_IMAGE[species.type2] : undefined) || null
}

const LEVEL_OFFSET = 100
const BOSS_LEVEL = 300
// Floor applied on top of the +100 offset (explicit user request: "os
// pokemons do modo pesadelo mais fracos agora possuem o lvl 150") — the
// weakest base hunt (Route 46 Inicial, ~Lv1-2) would only reach ~101-102
// with a flat +100, so every mirrored level is clamped up to this floor
// instead. Kanto's mirrored zones already clear 150 on their own (their base
// levels got their own +50 bump, see sync-planilha.js#KANTO_BANDS), so the
// floor only ever kicks in for the low Johto zones.
const NIGHTMARE_MIN_LEVEL = 150
const shiftLevel = (level: number) => Math.max(level + LEVEL_OFFSET, NIGHTMARE_MIN_LEVEL)

// Recebe as hunts normais em vez de ler `MAPS_DATA` direto: o espelho tem
// que ser tirado do resultado FINAL (depois do recorte por regiao e das
// hunts-irmas criadas em huntSpawnOverrides.ts), senao o Modo Pesadelo
// congelaria a composicao antiga — POKE de Kanto numa hunt de Johto — e as
// hunts novas nao teriam espelho nenhum.
export function buildNightmareMirror(
  sourceMaps: Record<string, HuntMapDef>,
  sourceEncounters: Record<string, HuntEncounter>,
): { maps: Record<string, HuntMapDef>; encounters: Record<string, HuntEncounter> } {
  const maps: Record<string, HuntMapDef> = {}
  const encounters: Record<string, HuntEncounter> = {}

  for (const map of Object.values(sourceMaps)) {
    const newId = `nightmare_${map.id}`
    const enemyPool: string[] = []
    for (const encId of map.enemyPool) {
      const enc = sourceEncounters[encId]
      if (!enc) continue
      const newEncId = `nightmare_${encId}`
      encounters[newEncId] = {
        ...enc,
        id: newEncId,
        minLevel: shiftLevel(enc.minLevel),
        maxLevel: shiftLevel(enc.maxLevel),
        // BUG REAL: o espelho deslocava `minLevel`/`maxLevel` mas nao os
        // `levelWeights`, que sao o sorteio de nivel de FATO quando existem
        // (`spawnEnemyAt` prefere eles ao `randInt`). Efeito: o Modo Pesadelo da
        // hunt inicial anunciava Lv150 e spawnava POKE de nivel 1 e 2 — a hunt
        // mais dificil do inicio do jogo era a mais facil dele. Achado pelo
        // teste de faixa (`hunts.test.ts`), nao por leitura.
        ...(enc.levelWeights
          ? { levelWeights: enc.levelWeights.map((lw) => ({ ...lw, level: shiftLevel(lw.level) })) }
          : {}),
      }
      enemyPool.push(newEncId)
    }
    maps[newId] = {
      ...map,
      id: newId,
      name: `${map.name} (Pesadelo)`,
      continent: 'nightmare',
      levelRange: [shiftLevel(map.levelRange[0]), shiftLevel(map.levelRange[1])],
      unlockCost: null,
      // Lotacao PADRAO, mesmo espelhando uma hunt que tenha menos. A unica com
      // menos hoje e a inicial, que poe dois inimigos em campo porque um POKE
      // Lv1 nao sobrevive a seis — protecao de iniciante que nao faz sentido
      // nenhum num espelho de Lv150+. Herdar sem querer deixaria a versao
      // Pesadelo dela mais lenta que todas as irmas, sem ninguem ter escolhido
      // isso.
      maxEnemies: GEOMETRIA.maxEnemies,
      enemyPool,
    }
  }

  return { maps, encounters }
}

function buildBossHunts(): { maps: Record<string, HuntMapDef>; encounters: Record<string, HuntEncounter> } {
  const maps: Record<string, HuntMapDef> = {}
  const encounters: Record<string, HuntEncounter> = {}

  for (const speciesId of LEGENDARY_SPECIES_IDS) {
    const species = SPECIES[speciesId]
    if (!species) continue
    const mapId = `boss_${speciesId}`
    const encId = `${mapId}_encounter`
    encounters[encId] = {
      id: encId, speciesId, minLevel: BOSS_LEVEL, maxLevel: BOSS_LEVEL,
      aggroRadius: 175, wanderRadius: 60, weight: 1,
    }
    maps[mapId] = {
      id: mapId,
      name: `BOSS ${species.name}`,
      description: `Covil do lendario ${species.name} (nivel ${BOSS_LEVEL}) — aparece uma unica vez, sem respawn.`,
      levelRange: [BOSS_LEVEL, BOSS_LEVEL],
      unlockCost: null,
      continent: 'nightmare',
      bounds: { width: 1400, height: 900 },
      playerSpawn: { x: 700, y: 450 },
      bg: { primary: '#3e2f23', secondary: '#4a3829', image: bossBackgroundImage(species) },
      maxEnemies: 1,
      noRespawn: true,
      respawnDelay: 6,
      spawnPoints: [{ x: 700, y: 450 }],
      enemyPool: [encId],
      itemDrops: [],
    }
  }

  return { maps, encounters }
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
export const LANCE_MAP_ID = 'boss_lance'
// Per explicit user request: every Lance POKE is raridade Lendario with a
// FIXED (not rolled) IV of 23 on all 6 stats — deliberately not the 31 max,
// and not random like a normal wild encounter.
const LANCE_RARITY: RarityKey = 'legendary'
const LANCE_IVS: StatBlock = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 }
// Exact composition and order from the user's spec — index 0 fights first.
const LANCE_TEAM: { speciesId: string; level: number }[] = [
  { speciesId: 'gyarados', level: 60 },
  { speciesId: 'dragonite', level: 55 },
  { speciesId: 'charizard', level: 60 },
  { speciesId: 'dragonite', level: 56 },
  { speciesId: 'aerodactyl', level: 60 },
  { speciesId: 'dragonite', level: 65 },
]

function buildLanceHunt(): { map: HuntMapDef; encounters: Record<string, HuntEncounter> } {
  const encounters: Record<string, HuntEncounter> = {}
  const enemyPool = LANCE_TEAM.map((entry, i) => {
    const encId = `${LANCE_MAP_ID}_${i}`
    encounters[encId] = {
      id: encId, speciesId: entry.speciesId, minLevel: entry.level, maxLevel: entry.level,
      aggroRadius: 175, wanderRadius: 60, weight: 1,
      rarity: LANCE_RARITY, ivs: LANCE_IVS,
    }
    return encId
  })

  const map: HuntMapDef = {
    id: LANCE_MAP_ID,
    name: 'BOSS Campeao Lance',
    description: 'Batalha contra o Campeao Lance — 6 POKEs Lendarios em sequencia (Gyarados, Dragonite, Charizard, Dragonite, Aerodactyl, Dragonite). Sem auto-pot/revive; ao desmaiar, o proximo POKE da equipe entra automaticamente. Captura desabilitada. Derrota-lo libera a Faixa III e o Modo Pesadelo.',
    levelRange: [55, 65],
    unlockCost: null,
    // Fica na faixa2 (Lv31-60), que e exatamente onde o time dele cai
    // (Lv55-65): o jogador chega nele terminando a faixa2, e derrota-lo abre
    // a faixa3 e o Modo Pesadelo (ver unlocksContinentOnClear abaixo).
    continent: 'faixa2',
    bounds: { width: 1400, height: 900 },
    playerSpawn: { x: 700, y: 450 },
    bg: { primary: '#3e2f23', secondary: '#4a3829', image: TYPE_BACKGROUND_IMAGE.DRAGON ?? null },
    maxEnemies: 1,
    noRespawn: true,
    noCatch: true, // explicit user request — no capturing Lance's team
    autoSwitchTeamOnFaint: true,
    sequence: enemyPool, // ordered encounter ids — main.js walks through them one at a time instead of picking randomly
    // Consumido genericamente por engine/simulation.ts#stepWorld quando a
    // sequencia inteira cai. Virou LISTA porque o Lance passou a abrir duas
    // coisas: a faixa de nivel seguinte e o Modo Pesadelo (com as 11 hunts
    // BOSS dentro dele).
    unlocksContinentOnClear: GRUPOS_DO_LANCE,
    startCountdown: 5, // explicit user request — 5..0 countdown before Lance's first POKE spawns (main.js#buildMapWorld/stepWorld)
    keepCorpses: true, // explicit user request — defeated POKEs here stay on the field as "bodies" instead of despawning after DEATH_ANIM_GRACE_PERIOD
    respawnDelay: 3,
    spawnPoints: [{ x: 700, y: 450 }],
    enemyPool,
    itemDrops: [],
  }

  return { map, encounters }
}

const bosses = buildBossHunts()
const lance = buildLanceHunt()

// BOSS e Lance nao dependem das hunts normais (time/nivel proprios), entao
// continuam prontos aqui. O espelho do Modo Pesadelo e montado depois, em
// huntSpawnOverrides.ts, sobre as hunts ja recortadas por regiao.
export const BOSS_MAPS_DATA: Record<string, HuntMapDef> = { ...bosses.maps, [LANCE_MAP_ID]: lance.map }
export const BOSS_ENCOUNTERS_DATA: Record<string, HuntEncounter> = { ...bosses.encounters, ...lance.encounters }
