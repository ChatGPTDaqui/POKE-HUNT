// POKE species. All data (stats, type, catch rate, EXP, growth curve, real
// moveset) comes straight from the spreadsheet sync — see pokes.generated.js
// and `npm run planilha:aplicar`. This file only adds runtime logic: the
// stat-at-level formula, IV rolling, and a deterministic placeholder
// shape/color per species (real spritesheets can replace this later without
// touching any other file — see render/Sprites.js).
import { getAbility } from './abilities.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from './formulas.generated.js';
import { SPECIES_DATA } from './pokes.generated.js';
import { colorForType } from './typeColors.js';
import { randInt, rollChance } from '../core/Random.js';
import { RARITIES, rollRarity } from './rarity.js';

// Shiny odds scale with how easy the species is to catch in the first place —
// a common 255-catch-rate species is the real Gen2 1/8192, rarer species are
// rarer still.
const SHINY_CHANCE_AT_MAX_CATCH_RATE = (1 / 8192) * 200; // 200x boosted shiny rate
const MAX_CATCH_RATE = 255;

const formulaEngine = createFormulaEngine(FORMULAS);
const SHAPES = ['triangle', 'circle', 'square', 'diamond'];

const GROWTH_FORMULA_BY_CURVE = {
  MEDIUM_FAST: 'GROWTH_MEDIUM_FAST',
  SLIGHTLY_FAST: 'GROWTH_SLIGHTLY_FAST',
  SLIGHTLY_SLOW: 'GROWTH_SLIGHTLY_SLOW',
  MEDIUM_SLOW: 'GROWTH_MEDIUM_SLOW',
  FAST: 'GROWTH_FAST',
  SLOW: 'GROWTH_SLOW',
};

// Total cumulative EXP required to BE at `level` (Gen2 growth-group curves
// are cumulative-from-level-1 formulas, not per-level deltas). Clamped at 0
// since some curves' raw formulas dip negative at very low levels.
export function totalExpForLevel(level, growthCurve) {
  const formulaKey = GROWTH_FORMULA_BY_CURVE[growthCurve] || GROWTH_FORMULA_BY_CURVE.MEDIUM_SLOW;
  return Math.max(0, Math.round(formulaEngine.eval(formulaKey, { n: level })));
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function withVisuals(species) {
  return {
    ...species,
    shape: SHAPES[hashString(species.id) % SHAPES.length],
    color: colorForType(species.type),
  };
}

export const SPECIES = Object.fromEntries(
  Object.entries(SPECIES_DATA).map(([key, species]) => [key, withVisuals(species)])
);

// Hand-authored patch, same "layer on top of the synced data" pattern as
// nightmareMaps.js/legendaries.js: species whose real Gen1/2 evolution
// required a trade (with or without a held item) come out of the sync with
// evolvesTo=null — scripts/sync-planilha.js's "Evolui no Nivel" column has no
// trade/hold-item trigger at all, so today these are permanently stuck at
// their un-evolved stage. Per explicit user request, that dead end is
// replaced with a Level 80 + Stones-of-the-primary-type gate instead (see
// data/stones.js, systems/ProgressionSystem.js#evolvePokeInstance). Only
// species whose real evolved form is actually present in this project's
// curated roster are listed — Graveler->Golem, Poliwhirl->Politoed,
// Slowpoke->Slowking, Seadra->Kingdra, Scyther->Scizor and Porygon->Porygon2
// were never curated into the roster at all (their target species doesn't
// exist here), so there's no evolvesTo to point them at.
export const SPECIAL_EVOLUTION_LEVEL = 80;
export const SPECIAL_EVOLUTION_STONE_COUNT = 20;
const SPECIAL_EVOLUTIONS = { kadabra: 'alakazam', machoke: 'machamp', haunter: 'gengar' };
for (const [fromId, toId] of Object.entries(SPECIAL_EVOLUTIONS)) {
  const from = SPECIES[fromId];
  if (from && SPECIES[toId] && !from.evolvesTo) {
    from.evolvesTo = toId;
    from.evolvesAtLevel = SPECIAL_EVOLUTION_LEVEL;
    from.isSpecialEvolution = true;
  }
}

// Real Gen2 stat formulas: floor((2*base+iv)*level/100)+5 (and the HP variant).
// `rarityKey` is an optional multiplier on top of the real formula (see
// data/rarity.js) — omitted/unrecognized keys default to Comum's 1x, so
// every pre-existing call site keeps working unchanged.
export function computeStatsAtLevel(species, level, ivs, rarityKey) {
  const lvl = Math.max(1, level);
  const multiplier = (RARITIES[rarityKey] || RARITIES.comum).statMultiplier;
  const stats = {};
  for (const key of Object.keys(species.base)) {
    const formulaKey = key === 'hp' ? 'HP_FORMULA' : 'STAT_FORMULA';
    const base = formulaEngine.eval(formulaKey, { base: species.base[key], level: lvl, iv: ivs[key] });
    stats[key] = Math.max(1, Math.round(base * multiplier));
  }
  return stats;
}

const IV_MAX = 31;
const IV_STAT_COUNT = 6;

function rollIvs() {
  return {
    hp: randInt(0, IV_MAX),
    atkFis: randInt(0, IV_MAX),
    atkEsp: randInt(0, IV_MAX),
    def: randInt(0, IV_MAX),
    defEsp: randInt(0, IV_MAX),
    speed: randInt(0, IV_MAX),
  };
}

// Overall IV quality as a 0-100% average across all 6 stats — used for the
// shop's IV filter/sort.
export function averageIvPercent(ivs) {
  const sum = Object.values(ivs).reduce((total, v) => total + v, 0);
  return (sum / (IV_MAX * IV_STAT_COUNT)) * 100;
}

let nextInstanceId = 1;

export function createPokeInstance(speciesId, level = 1, { ivs: fixedIvs, rarity: fixedRarity } = {}) {
  const species = SPECIES[speciesId];
  if (!species) throw new Error(`Especie desconhecida: ${speciesId}`);
  const ivs = fixedIvs || rollIvs();
  const rarity = fixedRarity || rollRarity();
  const stats = computeStatsAtLevel(species, level, ivs, rarity);
  const shinyChance = (species.catchRate / MAX_CATCH_RATE) * SHINY_CHANCE_AT_MAX_CATCH_RATE;
  return {
    uid: `poke-${nextInstanceId++}`,
    speciesId,
    level,
    isShiny: rollChance(shinyChance),
    rarity,
    // Baseline EXP for starting AT `level` (not 0) — otherwise a poke created
    // above level 1 needs to earn the full cumulative EXP of a low-level curve
    // before its progress bar (and grantExp's level-up check) show any movement.
    exp: totalExpForLevel(level, species.growthCurve),
    ivs,
    stats,
    hp: stats.hp,
    unlockedAbilities: species.abilities
      .filter((entry) => entry.levelReq <= level)
      .map((entry) => entry.key)
      .filter((key) => getAbility(key)),
  };
}
