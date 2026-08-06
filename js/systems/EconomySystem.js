import { getItem } from '../data/items.js';
import { SPECIES } from '../data/pokes.js';
import { stoneItemId } from '../data/stones.js';
import { rollChance } from '../core/Random.js';
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from '../data/formulas.generated.js';
import { RARITIES } from '../data/rarity.js';

const formulaEngine = createFormulaEngine(FORMULAS);
const POKEMON_SELL_DIVISOR = formulaEngine.eval('POKEMON_SELL_DIVISOR');
const KILL_MONEY_DIVISOR = formulaEngine.eval('KILL_MONEY_DIVISOR');
// 0.05 = explicit user request (brought back down from 0.2): every kill has
// a flat 5% chance to drop a Stone matching the victim's PRIMARY type,
// independent of the hunt's own itemDrops table below (Stones aren't
// spreadsheet loot — see data/stones.js).
const STONE_DROP_CHANCE = formulaEngine.evalOrDefault('STONE_DROP_CHANCE', 0.05);
// Both spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia"
// section) with fallbacks matching the old hardcoded behavior — gold earned
// from defeating a wild POKE is boosted 5x over the raw MONEY_FOR_KILL
// formula, times an extra global lever for one-knob rebalancing.
const KILL_GOLD_MULTIPLIER = formulaEngine.evalOrDefault('KILL_GOLD_MULTIPLIER', 5);
// 1 = explicit user request to revert the earlier +300% balance pass and
// restore the original formula (just KILL_GOLD_MULTIPLIER, no extra knob).
const GOLD_GLOBAL_MULTIPLIER = formulaEngine.evalOrDefault('GOLD_GLOBAL_MULTIPLIER', 1);

// `rarityKey` is optional (see data/rarity.js) — omitted/unrecognized keys
// default to Comum's 1x, same fallback rule as computeStatsAtLevel.
export function pokemonSellValue(level, baseExp, rarityKey) {
  const base = formulaEngine.eval('POKEMON_SELL_VALUE', {
    level, baseExp, sellDivisor: POKEMON_SELL_DIVISOR,
  });
  const multiplier = (RARITIES[rarityKey] || RARITIES.comum).sellMultiplier;
  return Math.max(1, Math.floor(base * multiplier));
}

// Item drops come from the hunt map itself (mapDef.itemDrops) — the
// spreadsheet has no per-species "held item" data, so every kill in a given
// hunt rolls against that hunt's shared drop table.
export function awardKillLoot(gameState, enemy, mapDef) {
  const species = SPECIES[enemy.poke.speciesId];
  const sellValue = pokemonSellValue(enemy.poke.level, species.baseExp, enemy.poke.rarity);
  const baseGold = Math.max(1, Math.floor(formulaEngine.eval('MONEY_FOR_KILL', { sellValue, killDivisor: KILL_MONEY_DIVISOR })));
  const gold = Math.max(1, Math.round(baseGold * KILL_GOLD_MULTIPLIER * GOLD_GLOBAL_MULTIPLIER));
  gameState.addGold(gold);

  const droppedItems = [];
  for (const drop of mapDef.itemDrops) {
    if (rollChance(drop.chance)) {
      gameState.addItem(drop.itemId, 1);
      droppedItems.push(drop.itemId);
    }
  }

  if (rollChance(STONE_DROP_CHANCE)) {
    const stoneId = stoneItemId(species.type);
    gameState.addItem(stoneId, 1);
    droppedItems.push(stoneId);
  }

  return { gold, droppedItems };
}

export function buyItem(gameState, itemId, qty = 1) {
  const item = getItem(itemId);
  if (!item) return { success: false, reason: 'unknown_item' };
  if (!gameState.spendGold(item.buyPrice * qty)) return { success: false, reason: 'insufficient_gold' };
  gameState.addItem(itemId, qty);
  return { success: true };
}

export function sellItem(gameState, itemId, qty = 1) {
  const item = getItem(itemId);
  if (!item) return { success: false, reason: 'unknown_item' };
  if (gameState.isItemLocked(itemId)) return { success: false, reason: 'locked' };
  if (!gameState.removeItem(itemId, qty)) return { success: false, reason: 'insufficient_quantity' };
  gameState.addGold(item.sellPrice * qty);
  return { success: true };
}

// Sells every stackable item currently owned (all quantities) in one go —
// locked itemIds (see GameState.js#lockedItems) are skipped entirely.
export function sellAllItems(gameState) {
  const ownedItemIds = Object.keys(gameState.items)
    .filter((id) => gameState.items[id] > 0 && getItem(id) && !gameState.isItemLocked(id));
  let totalGold = 0;
  let itemCount = 0;
  for (const itemId of ownedItemIds) {
    const item = getItem(itemId);
    const qty = gameState.items[itemId];
    gameState.removeItem(itemId, qty);
    totalGold += item.sellPrice * qty;
    itemCount += qty;
  }
  gameState.addGold(totalGold);
  return { gold: totalGold, itemCount };
}

// Sells an extra captured POKE sitting in the bag for gold.
export function sellBagPoke(gameState, pokeUid) {
  const idx = gameState.bagPokes.findIndex((p) => p.uid === pokeUid);
  if (idx === -1) return { success: false, reason: 'not_found' };
  if (gameState.bagPokes[idx].locked) return { success: false, reason: 'locked' };
  const [poke] = gameState.bagPokes.splice(idx, 1);
  const species = SPECIES[poke.speciesId];
  const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity);
  gameState.addGold(value);
  return { success: true, value };
}

// Sells every bag POKE whose uid is in `pokeUids` (the caller decides which —
// e.g. everything currently matching an IV filter). Locked POKEs are always
// skipped, even if their uid was passed in — defense in depth alongside the
// UI already excluding them from bulk selection (same rule as shiny).
export function sellAllBagPokes(gameState, pokeUids) {
  const uidSet = new Set(pokeUids);
  const toSell = gameState.bagPokes.filter((p) => uidSet.has(p.uid) && !p.locked);
  let totalGold = 0;
  for (const poke of toSell) {
    const species = SPECIES[poke.speciesId];
    totalGold += pokemonSellValue(poke.level, species.baseExp, poke.rarity);
  }
  const soldUidSet = new Set(toSell.map((p) => p.uid));
  gameState.bagPokes = gameState.bagPokes.filter((p) => !soldUidSet.has(p.uid));
  gameState.addGold(totalGold);
  return { gold: totalGold, pokeCount: toSell.length };
}

export function unlockMap(gameState, mapDef) {
  if (gameState.isMapUnlocked(mapDef.id)) return { success: true };
  if (!mapDef.unlockCost) {
    gameState.unlockMap(mapDef.id);
    return { success: true };
  }
  if (mapDef.unlockCost.gold && !gameState.spendGold(mapDef.unlockCost.gold)) {
    return { success: false, reason: 'insufficient_gold' };
  }
  if (mapDef.unlockCost.diamonds && !gameState.spendDiamonds(mapDef.unlockCost.diamonds)) {
    return { success: false, reason: 'insufficient_diamonds' };
  }
  gameState.unlockMap(mapDef.id);
  return { success: true };
}
