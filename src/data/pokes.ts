// POKE species. All data (stats, type, catch rate, EXP, growth curve, real
// moveset) comes straight from the spreadsheet sync — see pokes.generated.js
// and `npm run planilha:aplicar`. This file only adds runtime logic: the
// stat-at-level formula, IV rolling, and a deterministic placeholder
// shape/color per species (real spritesheets can replace this later without
// touching any other file — see render/Sprites.js).
import { getAbility } from './abilities'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { SPECIES_DATA } from './generated/pokes.generated'
import { colorForType } from './typeColors'
import { randInt, rollChance } from '@/core/random'
import { RARITIES, rollRarity, type RarityKey } from './rarity'
import type { Rng } from '@/core/rng'
import { typedAoeMoveKey, TYPED_AOE_LEVEL } from './typedAoeMoves'
import type { GrowthCurve, SpeciesBaseStats, SpeciesDataEntry } from './generated/types'

export type StatKey = keyof SpeciesBaseStats
export type StatBlock = SpeciesBaseStats

export interface Species extends SpeciesDataEntry {
  shape: string
  color: string
  isSpecialEvolution?: boolean
}

export interface PokeInstance {
  uid: string
  speciesId: string
  level: number
  isShiny: boolean
  rarity: RarityKey
  exp: number
  ivs: StatBlock
  stats: StatBlock
  hp: number
  unlockedAbilities: string[]
  // Setados fora deste arquivo, em runtime (nao no momento da criacao) —
  // opcionais aqui pra todo call site existente continuar valido.
  locked?: boolean // BagMenu.js — trava contra venda (EconomySystem.js)
  disabledAbilities?: Record<string, boolean> // AbilityHUD.js — golpe desligado manualmente
  // ProgressionSystem.js#evolvePokeInstance — nivel minimo pos-evolucao, pra
  // applyDeathExpPenalty nunca conseguir de-evoluir o poke.
  minLevel?: number
  // Quando a linha entrou em `pokemon_instances` (o `created_at` do Postgres).
  // So de leitura: nunca e gravado de volta, e nao existe em POKE recem-criado
  // que ainda nao passou pelo banco. Alimenta o "Log de capturas" do Perfil do
  // Treinador — sem ele nao ha nenhuma ordem temporal no save (o array da
  // mochila e ordem de insercao do PostgREST, nao de captura).
  capturedAt?: string
  // Nome do treinador no momento da CAPTURA (coluna `original_trainer`).
  // Imutavel: nao acompanha renomeacao do jogador e nao seria derivavel do
  // dono se algum dia existir troca entre jogadores. Opcional porque POKE
  // recem-criado em memoria pode ainda nao ter passado pelo banco, e save
  // anterior a coluna nao tem valor real (ver a migration para o backfill).
  originalTrainer?: string
}

const MAX_CATCH_RATE = 255

const formulaEngine = createFormulaEngine(FORMULAS)

// A chance de shiny escala com a facilidade de captura da especie: uma
// especie comum (catchRate 255) sai na taxa real do Gen2 (1/8192) vezes o
// multiplicador abaixo; especies mais raras saem proporcionalmente mais
// raras. Esta E a formula original do projeto, inalterada.
//
// O multiplicador virou knob editavel (mesmo mecanismo do "Balanceamento de
// economia": basta colar a linha `SHINY_RATE_MULTIPLIER` na aba "Formulas" e
// rodar o sync) porque ele e o unico numero aqui que e decisao de
// balanceamento, nao formula. O fallback 200 e o valor que o projeto sempre
// usou — sem a linha na planilha, nada muda.
const REAL_GEN2_SHINY_RATE = 1 / 8192
const SHINY_RATE_MULTIPLIER = formulaEngine.evalOrDefault('SHINY_RATE_MULTIPLIER', 200)
const SHINY_CHANCE_AT_MAX_CATCH_RATE = REAL_GEN2_SHINY_RATE * SHINY_RATE_MULTIPLIER
const SHAPES = ['triangle', 'circle', 'square', 'diamond']

const GROWTH_FORMULA_BY_CURVE: Record<GrowthCurve, string> = {
  MEDIUM_FAST: 'GROWTH_MEDIUM_FAST',
  SLIGHTLY_FAST: 'GROWTH_SLIGHTLY_FAST',
  SLIGHTLY_SLOW: 'GROWTH_SLIGHTLY_SLOW',
  MEDIUM_SLOW: 'GROWTH_MEDIUM_SLOW',
  FAST: 'GROWTH_FAST',
  SLOW: 'GROWTH_SLOW',
}

// Total cumulative EXP required to BE at `level` (Gen2 growth-group curves
// are cumulative-from-level-1 formulas, not per-level deltas). Clamped at 0
// since some curves' raw formulas dip negative at very low levels.
export function totalExpForLevel(level: number, growthCurve: GrowthCurve): number {
  const formulaKey = GROWTH_FORMULA_BY_CURVE[growthCurve] || GROWTH_FORMULA_BY_CURVE.MEDIUM_SLOW
  return Math.max(0, Math.round(formulaEngine.eval(formulaKey, { n: level })))
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function withVisuals(species: SpeciesDataEntry): Species {
  return {
    ...species,
    shape: SHAPES[hashString(species.id) % SHAPES.length],
    color: colorForType(species.type),
  }
}

export const SPECIES: Record<string, Species> = Object.fromEntries(
  Object.entries(SPECIES_DATA).map(([key, species]) => [key, withVisuals(species)])
)

// Every species gets the level-50 typed AoE move (typedAoeMoves.js) appended
// to its real learnset, keyed to ITS OWN primary type — explicit user
// request, invented content with no spreadsheet equivalent. Piggybacking on
// the existing `species.abilities` {key, levelReq} shape means grantExp/
// evolvePokeInstance/createPokeInstance (data/pokes.js below, systems/
// ProgressionSystem.js) and the moveset preview table
// (ui/panels/PokeStatDetail.js#buildMovesetTable) all pick it up for free,
// with zero special-casing anywhere else.
for (const species of Object.values(SPECIES)) {
  species.abilities = [...species.abilities, { key: typedAoeMoveKey(species.type), levelReq: TYPED_AOE_LEVEL }]
}

// Hand-authored patch, same "layer on top of the synced data" pattern as
// nightmareMaps.js/legendaries.js: species whose real Gen1/2 evolution
// required a trade (with or without a held item) come out of the sync with
// evolvesTo=null — scripts/sync-planilha.js's "Evolui no Nivel" column has no
// trade/hold-item trigger at all, so today these are permanently stuck at
// their un-evolved stage. Per explicit user request, that dead end is
// replaced with a Level 80 + Stones-of-the-primary-type gate instead (see
// data/stones.js, systems/ProgressionSystem.js#evolvePokeInstance).
//
// All 9 real Gen1/2 trade/hold-item evolution chains are covered — the
// missing evolved-form species (Golem/Onix/Scizor/Kingdra/Politoed/Porygon2)
// were added to scripts/sync-planilha.js#KANTO_BANDS and synced in
// ("Setima leva" in CLAUDE.md) specifically so this list wouldn't have to
// skip any of them. Slowpoke->Slowking is the one real Gen2 case NOT here:
// Slowpoke already has a genuine, working LEVEL evolution to Slowbro (real
// planilha data, level 37) — this single-`evolvesTo`-field data model can't
// represent a second branching option, and Slowpoke isn't "stuck" the way
// the other 9 species are, so it's out of scope for a fix that's specifically
// about un-sticking dead-end evolutions.
export const SPECIAL_EVOLUTION_LEVEL = 80
export const SPECIAL_EVOLUTION_STONE_COUNT = 20
const SPECIAL_EVOLUTIONS: Record<string, string> = {
  kadabra: 'alakazam', machoke: 'machamp', haunter: 'gengar',
  graveler: 'golem', onix: 'steelix', scyther: 'scizor',
  seadra: 'kingdra', poliwhirl: 'politoed', porygon: 'porygon2',
}
for (const [fromId, toId] of Object.entries(SPECIAL_EVOLUTIONS)) {
  const from = SPECIES[fromId]
  if (from && SPECIES[toId] && !from.evolvesTo) {
    from.evolvesTo = toId
    from.evolvesAtLevel = SPECIAL_EVOLUTION_LEVEL
    from.isSpecialEvolution = true
  }
}

// Real Gen2 stat formulas: floor((2*base+iv)*level/100)+5 (and the HP variant).
// `rarityKey` is an optional multiplier on top of the real formula (see
// data/rarity.js) — omitted/unrecognized keys default to Comum's 1x, so
// every pre-existing call site keeps working unchanged. `isShiny` applies a
// flat 1.5x on top of the real base stat, BEFORE the rarity multiplier (per
// explicit user request) — the two stack multiplicatively (shiny+Mythic ends
// up at 1.5 * 3 = 4.5x, not additive).
export const SHINY_STAT_MULTIPLIER = 1.5

export function computeStatsAtLevel(species: Species, level: number, ivs: StatBlock, rarityKey?: RarityKey, isShiny?: boolean): StatBlock {
  const lvl = Math.max(1, level)
  const rarityMultiplier = (rarityKey && RARITIES[rarityKey] || RARITIES.comum).statMultiplier
  const stats = {} as StatBlock
  for (const key of Object.keys(species.base) as StatKey[]) {
    const formulaKey = key === 'hp' ? 'HP_FORMULA' : 'STAT_FORMULA'
    const base = formulaEngine.eval(formulaKey, { base: species.base[key], level: lvl, iv: ivs[key] })
    const shinyBase = isShiny ? base * SHINY_STAT_MULTIPLIER : base
    stats[key] = Math.max(1, Math.round(shinyBase * rarityMultiplier))
  }
  return stats
}

const IV_MAX = 31
const IV_STAT_COUNT = 6

function rollIvs(rng: Rng): StatBlock {
  return {
    hp: randInt(rng, 0, IV_MAX),
    atkFis: randInt(rng, 0, IV_MAX),
    atkEsp: randInt(rng, 0, IV_MAX),
    def: randInt(rng, 0, IV_MAX),
    defEsp: randInt(rng, 0, IV_MAX),
    speed: randInt(rng, 0, IV_MAX),
  }
}

// Overall IV quality as a 0-100% average across all 6 stats — used for the
// shop's IV filter/sort.
export function averageIvPercent(ivs: StatBlock): number {
  const sum = Object.values(ivs).reduce((total, v) => total + v, 0)
  return (sum / (IV_MAX * IV_STAT_COUNT)) * 100
}

// O uid do POKE E a chave primaria dele no Postgres (`pokemon_instances.id`,
// tipo uuid). Antes era um contador de modulo (`poke-1`), que tinha dois
// problemas ao sair do localStorage: reiniciava a cada carga da pagina (dois
// POKEs diferentes podiam receber o mesmo uid em sessoes distintas) e nao
// servia como PK. Gerar uuid aqui faz `poke.uid === pokemon_instances.id`
// sempre, o que torna o diff de save trivial e dispensa tabela de-para.
//
// `crypto.randomUUID` exige contexto seguro (https ou localhost) — os dois
// unicos jeitos de o jogo rodar, ja que o Supabase so atende https.
export function novoPokeUid(): string {
  return crypto.randomUUID()
}

export interface CreatePokeInstanceOptions {
  ivs?: StatBlock
  rarity?: RarityKey
}

// `rng` e o primeiro parametro (e obrigatorio) de proposito: os tres sorteios
// aqui — IV, raridade e shiny — sao exatamente os que o servidor precisa poder
// reconferir na Fase D. Um default pra `Math.random()` deixaria um caminho
// silencioso de volta pro nao-verificavel.
export function createPokeInstance(rng: Rng, speciesId: string, level = 1, { ivs: fixedIvs, rarity: fixedRarity }: CreatePokeInstanceOptions = {}): PokeInstance {
  const species = SPECIES[speciesId]
  if (!species) throw new Error(`Especie desconhecida: ${speciesId}`)
  const ivs = fixedIvs || rollIvs(rng)
  const rarity = fixedRarity || rollRarity(rng)
  const shinyChance = (species.catchRate / MAX_CATCH_RATE) * SHINY_CHANCE_AT_MAX_CATCH_RATE
  const isShiny = rollChance(rng, shinyChance)
  const stats = computeStatsAtLevel(species, level, ivs, rarity, isShiny)
  return {
    uid: novoPokeUid(),
    speciesId,
    level,
    isShiny,
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
  }
}
