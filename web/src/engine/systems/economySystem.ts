// Port de js/systems/EconomySystem.js.
import { getItem } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { stoneItemId } from '@/data/stones'
import { rollChance } from '@/core/random'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { RARITIES, type RarityKey } from '@/data/rarity'
import type { GameStateStore } from '@/stores/gameStateStore'
import type { MapDef } from '@/data/maps'
import type { EnemyEntity } from '../types'

const formulaEngine = createFormulaEngine(FORMULAS)
const POKEMON_SELL_DIVISOR = formulaEngine.eval('POKEMON_SELL_DIVISOR')
const KILL_MONEY_DIVISOR = formulaEngine.eval('KILL_MONEY_DIVISOR')
// 0.05 = pedido explicito do usuario (revertido de 0.2): todo kill tem 5%
// de chance fixa de dropar uma Stone do tipo PRIMARIO da vitima,
// independente da tabela itemDrops da propria hunt.
const STONE_DROP_CHANCE = formulaEngine.evalOrDefault('STONE_DROP_CHANCE', 0.05)
const KILL_GOLD_MULTIPLIER = formulaEngine.evalOrDefault('KILL_GOLD_MULTIPLIER', 5)
const GOLD_GLOBAL_MULTIPLIER = formulaEngine.evalOrDefault('GOLD_GLOBAL_MULTIPLIER', 1)

export function pokemonSellValue(level: number, baseExp: number, rarityKey?: RarityKey): number {
  const base = formulaEngine.eval('POKEMON_SELL_VALUE', { level, baseExp, sellDivisor: POKEMON_SELL_DIVISOR })
  const multiplier = (rarityKey && RARITIES[rarityKey] || RARITIES.comum).sellMultiplier
  return Math.max(1, Math.floor(base * multiplier))
}

export interface KillLoot {
  gold: number
  droppedItems: string[]
}

// Drops de item vem do proprio mapa da hunt (mapDef.itemDrops) — a
// planilha nao tem "item segurado" por especie, entao todo kill numa hunt
// rola contra a tabela de drop compartilhada daquela hunt.
export function awardKillLoot(gameState: GameStateStore, enemy: EnemyEntity, mapDef: MapDef): KillLoot {
  const species = SPECIES[enemy.poke.speciesId]
  const sellValue = pokemonSellValue(enemy.poke.level, species.baseExp, enemy.poke.rarity)
  const baseGold = Math.max(1, Math.floor(formulaEngine.eval('MONEY_FOR_KILL', { sellValue, killDivisor: KILL_MONEY_DIVISOR })))
  const gold = Math.max(1, Math.round(baseGold * KILL_GOLD_MULTIPLIER * GOLD_GLOBAL_MULTIPLIER))
  gameState.addGold(gold)

  const droppedItems: string[] = []
  for (const drop of mapDef.itemDrops) {
    if (rollChance(drop.chance)) {
      gameState.addItem(drop.itemId, 1)
      droppedItems.push(drop.itemId)
    }
  }

  if (rollChance(STONE_DROP_CHANCE)) {
    const stoneId = stoneItemId(species.type)
    gameState.addItem(stoneId, 1)
    droppedItems.push(stoneId)
  }

  return { gold, droppedItems }
}

export type EconomyResult = { success: true } | { success: false; reason: string }

export function buyItem(gameState: GameStateStore, itemId: string, qty = 1): EconomyResult {
  const item = getItem(itemId)
  if (!item || !('buyPrice' in item)) return { success: false, reason: 'unknown_item' }
  if (!gameState.spendGold(item.buyPrice * qty)) return { success: false, reason: 'insufficient_gold' }
  gameState.addItem(itemId, qty)
  return { success: true }
}

export function sellItem(gameState: GameStateStore, itemId: string, qty = 1): EconomyResult {
  const item = getItem(itemId)
  if (!item) return { success: false, reason: 'unknown_item' }
  if (gameState.isItemLocked(itemId)) return { success: false, reason: 'locked' }
  if (!gameState.removeItem(itemId, qty)) return { success: false, reason: 'insufficient_quantity' }
  gameState.addGold(item.sellPrice * qty)
  return { success: true }
}

// Vende todo item empilhavel possuido agora (todas as quantidades) de uma
// vez — itemIds trancados (ver gameStateStore#lockedItems) sao pulados.
export function sellAllItems(gameState: GameStateStore): { gold: number; itemCount: number } {
  const ownedItemIds = Object.keys(gameState.items)
    .filter((id) => gameState.items[id] > 0 && getItem(id) && !gameState.isItemLocked(id))
  let totalGold = 0
  let itemCount = 0
  for (const itemId of ownedItemIds) {
    const item = getItem(itemId)
    if (!item) continue
    const qty = gameState.items[itemId]
    gameState.removeItem(itemId, qty)
    totalGold += item.sellPrice * qty
    itemCount += qty
  }
  gameState.addGold(totalGold)
  return { gold: totalGold, itemCount }
}

// Vende um POKE extra capturado que esta na mochila, por ouro.
export function sellBagPoke(gameState: GameStateStore, pokeUid: string): { success: true; value: number } | { success: false; reason: string } {
  const poke = gameState.bagPokes.find((p) => p.uid === pokeUid)
  if (!poke) return { success: false, reason: 'not_found' }
  if (poke.locked) return { success: false, reason: 'locked' }
  gameState.removeBagPoke(pokeUid)
  const species = SPECIES[poke.speciesId]
  const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity)
  gameState.addGold(value)
  return { success: true, value }
}

// Vende todo POKE da mochila cujo uid esteja em `pokeUids` — trancados sao
// sempre pulados, mesmo se o uid foi passado (defesa em profundidade, ja
// que a UI ja exclui eles da selecao em lote).
export function sellAllBagPokes(gameState: GameStateStore, pokeUids: string[]): { gold: number; pokeCount: number } {
  const uidSet = new Set(pokeUids)
  const toSell = gameState.bagPokes.filter((p) => uidSet.has(p.uid) && !p.locked)
  let totalGold = 0
  for (const poke of toSell) {
    const species = SPECIES[poke.speciesId]
    totalGold += pokemonSellValue(poke.level, species.baseExp, poke.rarity)
  }
  gameState.removeBagPokes(toSell.map((p) => p.uid))
  gameState.addGold(totalGold)
  return { gold: totalGold, pokeCount: toSell.length }
}

// `mapDef.unlockCost` (ver data/generated/types.ts) e `number | null` — todo
// mapa real de hoje tem `null` (a antiga "Camara dos Lendarios" paga em
// ouro foi removida, ver nightmareMaps.js/CLAUDE.md "Removed: LEGENDARY_BAND";
// legendarios sao BOSS-hunt-only agora). Interpretado como custo em ouro
// quando presente — codigo efetivamente inerte hoje (nenhum mapa real usa),
// mas mantido pro dia que um mapa pago volte a existir.
export function unlockMap(gameState: GameStateStore, mapDef: MapDef): EconomyResult {
  if (gameState.isMapUnlocked(mapDef.id)) return { success: true }
  if (!mapDef.unlockCost) {
    gameState.unlockMap(mapDef.id)
    return { success: true }
  }
  if (!gameState.spendGold(mapDef.unlockCost)) {
    return { success: false, reason: 'insufficient_gold' }
  }
  gameState.unlockMap(mapDef.id)
  return { success: true }
}
