// "Stones" — one custom evolution-currency item per elemental type. A lista sai
// de `TYPE_COLORS`, entao ela acompanha o dataset sozinha: sao 18 hoje, FAIRY
// incluida, e nao 17 como este comentario dizia desde os tempos de Gen 2 (o
// texto antigo afirmava "there's no FAIRY type here"). Conferido em 02/09
// (PH-414): `public.items` tem as 18, `stone_fairy` inclusive, e a pedra de
// FAIRY e alcancavel — o drop e do tipo primario da vitima e ha especie FAIRY no
// mato. Not spreadsheet-driven (the planilha has no per-type item
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
      description: `Usada para evoluir POKEs de tipo primario ${type} ao atingir o Nível 80.`,
      sellPrice: 500,
    }]
  })
)
