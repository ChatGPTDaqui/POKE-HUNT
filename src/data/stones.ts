// "Stones" — one custom evolution-currency item per elemental type (17
// total, matching every type in this Gen2-only dataset; there's no FAIRY
// type here). Not spreadsheet-driven (the planilha has no per-type item
// family to pull from) — hand-authored the same way nightmareMaps.js/
// legendaries.js layer hand-made content on top of the synced data. Not
// purchasable (kept out of SHOP_STOCK, see data/items.js): obtained only via
// the universal kill-drop (EconomySystem.js#awardKillLoot) and spent on the
// Level 80 evolution rule (see pokes.js's special-evolution patch +
// systems/ProgressionSystem.js#evolvePokeInstance).
import { TYPE_COLORS } from './typeColors'
import type { ElementType } from './generated/types'

export const STONE_TYPES = Object.keys(TYPE_COLORS) as ElementType[]

export function stoneItemId(type: ElementType): string {
  return `stone_${type.toLowerCase()}`
}

export function stoneName(type: ElementType): string {
  return `Pedra ${type}`
}

export interface StoneItem {
  id: string
  name: string
  kind: 'stone'
  stoneType: ElementType
  description: string
  sellPrice: number
}

export const STONE_ITEMS: Record<string, StoneItem> = Object.fromEntries(
  STONE_TYPES.map((type) => {
    const id = stoneItemId(type)
    return [id, {
      id,
      name: stoneName(type),
      kind: 'stone' as const,
      stoneType: type,
      description: `Usada para evoluir POKEs de tipo primario ${type} ao atingir o Nivel 80.`,
      sellPrice: 500,
    }]
  })
)
