// Shared "full hunt map/encounter" shapes — a superset of the spreadsheet-
// generated MapDataEntry/EncounterDataEntry (generated/types.ts) plus every
// optional field that hand-authored layers (nightmareMaps.ts, the Lance
// sequence-boss hunt, huntSpawnOverrides.ts) attach on top at runtime. Kept
// in one place so maps.ts/nightmareMaps.ts/huntSpawnOverrides.ts all agree
// on the same public shape instead of drifting ad hoc `extends` clauses.
import type { MapDataEntry, EncounterDataEntry, SpeciesBaseStats } from './generated/types'
import type { RarityKey } from './rarity'

export type StatBlock = SpeciesBaseStats

export interface HuntMapDef extends MapDataEntry {
  collisionGrid?: string[] | null
  noRespawn?: boolean
  noCatch?: boolean
  autoSwitchTeamOnFaint?: boolean
  sequence?: string[]
  unlocksContinentOnClear?: string
  startCountdown?: number
  keepCorpses?: boolean
}

export interface HuntEncounter extends EncounterDataEntry {
  rarity?: RarityKey
  ivs?: StatBlock
}
