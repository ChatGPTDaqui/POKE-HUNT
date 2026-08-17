// Shared "full hunt map/encounter" shapes — a superset of the spreadsheet-
// generated MapDataEntry/EncounterDataEntry (generated/types.ts) plus every
// optional field that hand-authored layers (nightmareMaps.ts, the Lance
// sequence-boss hunt, huntSpawnOverrides.ts) attach on top at runtime. Kept
// in one place so maps.ts/nightmareMaps.ts/huntSpawnOverrides.ts all agree
// on the same public shape instead of drifting ad hoc `extends` clauses.
import type { MapDataEntry, EncounterDataEntry, SpeciesBaseStats } from './generated/types'
import type { RarityKey } from './rarity'

export type StatBlock = SpeciesBaseStats

// Raio de "lure" (aggro) do POKE selvagem: distancia em que ele nota e vem
// pra cima do jogador (ver engine/entity.ts#createEnemyEntity,
// AGGRO_RADIUS_MULTIPLIER=1 la aplica esse valor sem boost, pedido explicito
// do usuario). Hardcoded nos 3 pontos que constroem `HuntEncounter`
// (huntSpawnOverrides.ts, nightmareMaps.ts x2) — trazido pra ca so pra
// `data/abilities.ts#AOE_RADIUS` ter uma fonte compartilhada em vez de
// reescrever o mesmo numero magico uma 4a vez (pedido: raio de AOE = raio de
// lure do selvagem).
export const WILD_AGGRO_RADIUS = 175

export interface HuntMapDef extends MapDataEntry {
  collisionGrid?: string[] | null
  noRespawn?: boolean
  noCatch?: boolean
  autoSwitchTeamOnFaint?: boolean
  sequence?: string[]
  /**
   * Grupos de gate (`MapDataEntry['continent']`) liberados quando a
   * `sequence` inteira desta hunt cai. Lista, e nao um valor so, porque o
   * Campeao Lance abre dois de uma vez: a faixa de nivel seguinte e o Modo
   * Pesadelo.
   */
  unlocksContinentOnClear?: string[]
  startCountdown?: number
  keepCorpses?: boolean
  // Hunt-alvo de teste (ver data/trainingDummy.ts): abate nao concede EXP,
  // ouro, item nem captura. `handleEnemyDefeated` sai cedo com um resumo
  // zerado antes de tocar em qualquer uma dessas quatro coisas.
  noRewards?: boolean
  // Mesma hunt de teste: o inimigo NUNCA revida (`executeEnemyAction` sai
  // antes de `pickAbility`). IV de ataque no minimo sozinho nao bastava —
  // o gap de NIVEL na formula de dano ainda deixava passar dano real.
  passiveEnemies?: boolean
}

export interface HuntEncounter extends EncounterDataEntry {
  rarity?: RarityKey
  ivs?: StatBlock
  // Distribuicao de nivel ponderada, quando o sorteio uniforme entre
  // minLevel/maxLevel nao serve. Usado hoje so pela hunt inicial, que por
  // pedido explicito sai 80% nivel 1 e 20% nivel 2 (uniforme daria 50/50).
  // Ausente = uniforme, como sempre foi.
  levelWeights?: { level: number; weight: number }[]
}
