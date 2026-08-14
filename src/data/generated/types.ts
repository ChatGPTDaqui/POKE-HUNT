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

export type ItemKind = 'ball' | 'potion' | 'revive' | 'status_heal' | 'rod'

export interface ItemDataEntry {
  id: string
  name: string
  kind: ItemKind
  description: string
  buyPrice: number
  captureRate?: number
  healAmount?: number
  reviveHpPercent?: number
  // Sempre lista, mesmo com um alvo so: o Full Heal cura seis status de uma
  // vez, e um array unico evita um caso especial em quem consome.
  healsStatus?: StatusCondition[]
}

// Os status "de verdade" do jogo: os cinco nao-volateis (persistem depois da
// batalha) mais a confusao, que e volatil mas e a unica volatil que tem item de
// cura (Full Heal). O resto das condicoes volateis (flinch, trap, seed) nao tem
// item e nao aparece aqui.
export type StatusCondition = 'poison' | 'burn' | 'paralysis' | 'sleep' | 'freeze' | 'confusion'
export type ItemsData = Record<string, ItemDataEntry>

export interface AbilityRef {
  key: string
  levelReq: number
}

// Os 18 tipos da Gen VI em diante — a base de dados do jogo passou a ser
// Pokemon Ultra Sun (Gen VII), que inclui FAIRY. Ver CLAUDE.md.
export type ElementType =
  | 'NORMAL' | 'FIRE' | 'WATER' | 'ELECTRIC' | 'GRASS' | 'ICE' | 'FIGHTING'
  | 'POISON' | 'GROUND' | 'FLYING' | 'PSYCHIC' | 'BUG' | 'ROCK' | 'GHOST'
  | 'DRAGON' | 'DARK' | 'STEEL' | 'FAIRY'

// Os 6 grupos de experiencia reais. ERRATIC e FLUCTUATING substituem
// SLIGHTLY_FAST/SLIGHTLY_SLOW, que nao correspondiam a grupo nenhum dos jogos
// (eram curvas inventadas herdadas da planilha) — ver scripts/usum/formulas.json.
export type GrowthCurve = 'FAST' | 'MEDIUM_FAST' | 'MEDIUM_SLOW' | 'SLOW' | 'ERRATIC' | 'FLUCTUATING'

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

// 'status' entrou com a base de dados do Ultra Sun: a divisao fisico/especial
// deixou de ser por TIPO (regra da Gen I-III, que a planilha herdava) e passou
// a ser por GOLPE, e a terceira categoria real e Status. Neste jogo golpe de
// status continua inerte (`isDamagingAbility` filtra por poder > 0) — o que
// muda e que agora ele se declara como o que e, em vez de aparecer como
// "fisico com 0 de poder".
export type AbilityCategory = 'physical' | 'special' | 'status'

export interface AbilityDataEntry {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory
  power: number
  pp: number
  // 'aoe' = o golpe acerta mais de um Pokemon de uma vez nos jogos originais
  // (alvo `all-opponents`/`all-other-pokemon`/`all`). Substituiu uma lista de 6
  // chaves escrita a mao em data/abilities.ts, que ja tinha se desatualizado em
  // silencio na troca de grafia de `selfdestruct` para `self_destruct`.
  target: 'single' | 'aoe'
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
