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

// Regras dos status, geradas de scripts/usum/status.json (Gen VII, conferidas
// na Bulbapedia — a citacao de cada numero fica no JSON, fora do bundle).
//
// Campo ausente = aquele status nao tem aquele efeito. `duracaoEmTurnos: null`
// = nao passa sozinho: so sai por item ou pelo Centro Pokemon, exatamente como
// nos jogos.
export interface StatusRule {
  duracaoEmTurnos: [number, number] | null
  imunidadesPorTipo: ElementType[]
  danoPorTurnoFracaoDoMaximo?: number
  multiplicadorDeDanoFisico?: number
  multiplicadorDeVelocidade?: number
  chanceDePerderOTurno?: number
  chanceDeDescongelarPorTurno?: number
  bloqueiaAcao?: boolean
  descongelaComTipo?: ElementType
  chanceDeSeAtacar?: number
  poderDoAutoDano?: number
}

export interface StatusRules {
  naoVolateis: Record<string, StatusRule>
  volateis: Record<string, StatusRule>
  nomes: Record<string, string>
  golpesDePo: { imunesPorTipo: ElementType[]; golpes: string[] }
  reaplicacao: { turnosDeImunidade: number }
}
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

// Uma mudanca de estagio de atributo. `estagios` vai de -6 a +6, como nos
// jogos; positivo sobe, negativo desce.
export interface StatChange {
  stat: 'atkFis' | 'atkEsp' | 'def' | 'defEsp' | 'speed'
  estagios: number
}

export interface AbilityDataEntry {
  id: string
  name: string
  type: ElementType
  category: AbilityCategory
  power: number
  pp: number
  // Precisao real do golpe (1-100). Sempre presente: e o que separa "sempre
  // acerta" de "campo nao preenchido", e e ela que segura Horn Drill/Fissure,
  // que causam KO instantaneo com 30% de precisao.
  accuracy: number
  // --- Efeitos. Ausente = o golpe nao tem aquele efeito. -------------------
  // Status que o golpe causa e a chance disso (100 para golpe de status puro).
  status?: StatusCondition
  statusChance?: number
  // Mudancas de estagio de atributo e a chance (100 para golpe que so faz isso).
  statChanges?: StatChange[]
  statChance?: number
  flinchChance?: number
  // Estagios de critico ACIMA do normal, nao porcentagem (Slash tem 1).
  critStages?: number
  // % do dano causado que volta como cura (positivo) ou recuo (negativo).
  drainPercent?: number
  // % do HP maximo curada por golpe de cura pura (Recover = 50).
  healPercent?: number
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
