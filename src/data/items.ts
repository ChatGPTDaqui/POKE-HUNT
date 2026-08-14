// Shop/inventory items. Os 19 itens reais (bolas/pocoes/revives/curas de
// status/varas) vem do catalogo gerado (items.generated.ts, cuja fonte agora e
// scripts/usum/items.json com os precos de loja do Ultra Sun). This file only
// adds sellPrice, which is always computed from SELL_ITEM_PRICE rather than
// stored (so tweaking SELL_ITEM_FRACTION in the sheet re-balances every
// item's resale value automatically).
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import { ITEMS_DATA } from './generated/items.generated'
import { STONE_ITEMS, type StoneItem } from './stones'
import type { ItemDataEntry } from './generated/types'

export interface GeneratedItem extends ItemDataEntry {
  sellPrice: number
}

export type AnyItem = GeneratedItem | StoneItem

const formulaEngine = createFormulaEngine(FORMULAS)
const SELL_FRACTION = formulaEngine.eval('SELL_ITEM_FRACTION')

// Desconto de 70% no preco de COMPRA de bola e pocao (pedido explicito).
//
// Mora aqui, e nao no dado gerado, pela regra do projeto: `*.generated.ts` e
// sobrescrito a cada sync e a planilha nao e escrita por mim. Este arquivo ja e
// o lugar onde preco vira decisao de balanceamento (o `sellPrice` sempre foi
// derivado aqui em vez de armazenado, exatamente pra poder rebalancear sem
// mexer no dado). Vira knob de planilha como todo o resto da economia.
const DESCONTO_BOLA_POCAO = formulaEngine.evalOrDefault('BALL_POTION_BUY_DISCOUNT', 0.7)
const KINDS_COM_DESCONTO = new Set(['ball', 'potion', 'status_heal'])

const GENERATED_ITEMS: Record<string, GeneratedItem> = Object.fromEntries(
  Object.entries(ITEMS_DATA).map(([key, item]) => {
    // O desconto entra ANTES do `sellPrice`, e isso nao e detalhe: venda e 50%
    // da compra (`SELL_ITEM_FRACTION`). Descontar so a compra deixaria a Poke
    // Ball custando 60 e vendendo por 100 — uma impressora de ouro com dois
    // cliques. Comprar continua valendo menos que vender de volta.
    const buyPrice = KINDS_COM_DESCONTO.has(item.kind)
      ? Math.max(1, Math.round(item.buyPrice * (1 - DESCONTO_BOLA_POCAO)))
      : item.buyPrice
    const sellPrice = Math.max(1, Math.round(formulaEngine.eval('SELL_ITEM_PRICE', {
      buyPrice,
      sellFraction: SELL_FRACTION,
    })))
    return [key, { ...item, buyPrice, sellPrice }]
  })
)

export interface ShopStockEntry {
  itemId: string
  currency: 'gold'
}

// Shop stock: every ball/potion/revive is purchasable; rods aren't sold yet
// since fishing isn't implemented (their data still syncs, just unused).
// Built from the spreadsheet-sourced items only — Stones are loot-only (see
// data/stones.js), never for sale.
//
// `status_heal` fica fora ATE os status existirem (Leva B). O item ja tem
// linha no banco, preco e desconto — o que falta e o efeito. Vender hoje um
// Antidote que nao cura nada e pior que nao vender: o jogador gasta ouro num
// item inerte e nao tem como saber disso.
const KINDS_FORA_DA_LOJA = new Set(['rod', 'status_heal'])

export const SHOP_STOCK: ShopStockEntry[] = Object.values(GENERATED_ITEMS)
  .filter((item) => !KINDS_FORA_DA_LOJA.has(item.kind))
  .map((item) => ({ itemId: item.id, currency: 'gold' }))

// Merged view used by every generic "look up an owned item" lookup
// (getItem, the Mochila/Loja "vender" tabs, etc.) so Stones behave like any
// other stackable item everywhere except the buy list above.
export const ITEMS: Record<string, AnyItem> = { ...GENERATED_ITEMS, ...STONE_ITEMS }

export function getItem(id: string): AnyItem | null {
  return ITEMS[id] || null
}
