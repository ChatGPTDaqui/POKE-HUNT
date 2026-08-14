// Tipos compartilhados pelos arquivos *.generated.ts escritos por
// `scripts/sync-planilha.js`. Este arquivo NAO e gerado — e escrito a mao
// uma vez e reaproveitado pelas assinaturas `export const X: Tipo = ...` de
// cada .generated.ts. Ver CLAUDE.md "Fonte de dados: a planilha e a verdade".

export interface FormulaEntry {
  expr: string
  vars: string[]
}
export type FormulasData = Record<string, FormulaEntry>

export type TypeChartRow = Record<string, number>
export type TypeChartData = Record<string, TypeChartRow>

export type ItemKind = 'ball' | 'potion' | 'revive' | 'rod'

export interface ItemDataEntry {
  id: string
  name: string
  kind: ItemKind
  description: string
  buyPrice: number
  captureRate?: number
  healAmount?: number
  reviveHpPercent?: number
}
export type ItemsData = Record<string, ItemDataEntry>

export interface AbilityRef {
  key: string
  levelReq: number
}

export type ElementType =
  | 'NORMAL' | 'FIRE' | 'WATER' | 'ELECTRIC' | 'GRASS' | 'ICE' | 'FIGHTING'
  | 'POISON' | 'GROUND' | 'FLYING' | 'PSYCHIC' | 'BUG' | 'ROCK' | 'GHOST'
  | 'DRAGON' | 'DARK' | 'STEEL'

export type GrowthCurve = 'FAST' | 'MEDIUM_FAST' | 'SLIGHTLY_FAST' | 'MEDIUM_SLOW' | 'SLIGHTLY_SLOW' | 'SLOW'

export interface SpeciesBaseStats {
  hp: number
  atkFis: number
  atkEsp: number
  def: number
  defEsp: number
  speed: number
}

export interface SpeciesDataEntry {
  id: string
  name: string
  description: string
  type: ElementType
  type2: ElementType | null
  catchRate: number
  baseExp: number
  growthCurve: GrowthCurve
  base: SpeciesBaseStats
  abilities: AbilityRef[]
  evolvesTo: string | null
  evolvesAtLevel: number | null
}
export type SpeciesData = Record<string, SpeciesDataEntry>

export type AbilityCategory = 'physical' | 'special'

export interface AbilityDataEntry {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory
  power: number
  pp: number
}
export type AbilitiesData = Record<string, AbilityDataEntry>

export interface MapBackground {
  primary: string
  secondary: string
  image: string | null
}

export interface MapItemDrop {
  itemId: string
  chance: number
}

export type Continent = 'johto' | 'kanto' | 'nightmare'

export interface MapDataEntry {
  id: string
  name: string
  description: string
  levelRange: [number, number]
  unlockCost: number | null
  continent: Continent
  bounds: { width: number; height: number }
  playerSpawn: { x: number; y: number }
  bg: MapBackground
  maxEnemies: number
  respawnDelay: number
  spawnPoints: { x: number; y: number }[]
  enemyPool: string[]
  itemDrops: MapItemDrop[]
}
export type MapsData = Record<string, MapDataEntry>

export interface EncounterDataEntry {
  id: string
  speciesId: string
  minLevel: number
  maxLevel: number
  aggroRadius: number
  wanderRadius: number
  weight: number
}
export type EncountersData = Record<string, EncounterDataEntry>

// Written by `scripts/build-collision-grids.js` (separate from the xlsx
// pipeline — samples assets/hunt-backgrounds/*.png pixels directly).
export type CollisionGrids = Record<string, string[]>

// Escritos por `scripts/gerar-subbiomas.mjs` (tambem fora do pipeline da
// planilha — cruza as pools do PokeRogue com o nosso catalogo).
export type SubBiomaEspecies = Record<string, string[]>
export type SubBiomaLinks = Record<string, { bioma: string; peso: number }[]>
