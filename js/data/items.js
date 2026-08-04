// Shop/inventory items. All 13 real items (balls/potions/revives/rods) come
// straight from the spreadsheet sync (items.generated.js). This file only
// adds sellPrice, which is always computed from SELL_ITEM_PRICE rather than
// stored (so tweaking SELL_ITEM_FRACTION in the sheet re-balances every
// item's resale value automatically).
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from './formulas.generated.js';
import { ITEMS_DATA } from './items.generated.js';

const formulaEngine = createFormulaEngine(FORMULAS);
const SELL_FRACTION = formulaEngine.eval('SELL_ITEM_FRACTION');

export const ITEMS = Object.fromEntries(
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
export const SHOP_STOCK = Object.values(ITEMS)
  .filter((item) => item.kind !== 'rod')
  .map((item) => ({ itemId: item.id, currency: 'gold' }));

export function getItem(id) {
  return ITEMS[id] || null;
}
