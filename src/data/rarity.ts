// Rarity is an independent per-instance roll (same moment/spirit as the
// isShiny roll in createPokeInstance — see pokes.js), NOT tied to species:
// any POKE of any species can come out Comum or Mythic. Weights sum to 100
// (a plain percentage), stat/sell multipliers and tag colors per the user's
// spec. Hardcoded here rather than spreadsheet-driven (like SHINY_CHANCE_AT_
// MAX_CATCH_RATE) since it's a fixed 6-row table, not a single tunable
// scalar the "Balanceamento de economia" formula system is built for.
import { weightedPick } from '@/core/random'
import type { Rng } from '@/core/rng'

export type RarityKey = 'comum' | 'incomum' | 'raro' | 'ultra' | 'legendary' | 'mythic'

export interface RarityDef {
  key: RarityKey
  label: string
  weight: number
  statMultiplier: number
  sellMultiplier: number
  color: string
}

export const RARITIES: Record<RarityKey, RarityDef> = {
  comum: {
    key: 'comum', label: 'COMUM', weight: 69,
    statMultiplier: 1, sellMultiplier: 1, color: '#9aa0a6',
  },
  incomum: {
    key: 'incomum', label: 'INCOMUM', weight: 22.7,
    statMultiplier: 1.15, sellMultiplier: 3, color: '#4ade80',
  },
  raro: {
    key: 'raro', label: 'RARO', weight: 7,
    statMultiplier: 1.35, sellMultiplier: 10, color: '#60a5fa',
  },
  ultra: {
    key: 'ultra', label: 'ULTRA', weight: 1,
    statMultiplier: 1.7, sellMultiplier: 40, color: '#a78bfa',
  },
  legendary: {
    key: 'legendary', label: 'LEGENDARY', weight: 0.25,
    statMultiplier: 2.2, sellMultiplier: 150, color: '#d4a017',
  },
  mythic: {
    key: 'mythic', label: 'MYTHIC', weight: 0.05,
    statMultiplier: 3, sellMultiplier: 600, color: '#e0348c',
  },
}

const RARITY_LIST = Object.values(RARITIES)

export function rollRarity(rng: Rng): RarityKey {
  return weightedPick(rng, RARITY_LIST, (r) => r.weight).key
}

// Saves written before this feature shipped have no `rarity` field on their
// POKE instances — treat those (and any unrecognized key) as Comum rather
// than migrating every save on load.
export function rarityOf(poke: { rarity?: string | null } | null | undefined): RarityDef {
  const key = poke?.rarity as RarityKey | undefined
  return (key && RARITIES[key]) || RARITIES.comum
}

// Ordinal rank (common -> mythic), for sort UIs — distinct from `weight`,
// which runs the opposite direction (more common = higher weight).
export const RARITY_ORDER: RarityKey[] = ['comum', 'incomum', 'raro', 'ultra', 'legendary', 'mythic']

export function rarityRank(key: string | undefined | null): number {
  const idx = RARITY_ORDER.indexOf(key as RarityKey)
  return idx === -1 ? 0 : idx
}
