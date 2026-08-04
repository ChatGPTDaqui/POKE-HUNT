// Shop/inventory items. All 13 real items (balls/potions/revives/rods) come
// straight from the spreadsheet sync (items.generated.js). This file only
// adds sellPrice, which is always computed from SELL_ITEM_PRICE rather than
// stored (so tweaking SELL_ITEM_FRACTION in the sheet re-balances every
// item's resale value automatically).
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from './formulas.generated.js';
import { ITEMS_DATA } from './items.generated.js';
import { STONE_ITEMS } from './stones.js';

const formulaEngine = createFormulaEngine(FORMULAS);
const SELL_FRACTION = formulaEngine.eval('SELL_ITEM_FRACTION');

const GENERATED_ITEMS = Object.fromEntries(
  Object.entries(ITEMS_DATA).map(([key, item]) => {
    const sellPrice = Math.max(1, Math.round(formulaEngine.eval('SELL_ITEM_PRICE', {
      buyPrice: item.buyPrice,
      sellFraction: SELL_FRACTION,
    })));
    return [key, { ...item, sellPrice }];
  })
);

// Shop stock: every ball/potion/revive is purchasable; rods aren't sold yet
// since fishing isn't implemented (their data still syncs, just unused).
// Built from the spreadsheet-sourced items only — Stones are loot-only (see
// data/stones.js), never for sale.
export const SHOP_STOCK = Object.values(GENERATED_ITEMS)
  .filter((item) => item.kind !== 'rod')
  .map((item) => ({ itemId: item.id, currency: 'gold' }));

// Merged view used by every generic "look up an owned item" lookup
// (getItem, the Mochila/Loja "vender" tabs, etc.) so Stones behave like any
// other stackable item everywhere except the buy list above.
export const ITEMS = { ...GENERATED_ITEMS, ...STONE_ITEMS };

export function getItem(id) {
  return ITEMS[id] || null;
}
