// Helpers de sorteio usados pelos sistemas de combate/captura/movimento.
//
// Todos recebem o `Rng` explicitamente em vez de chamar `Math.random()`: o
// estado do sorteio vive no WorldState e precisa ser reproduzivel a partir da
// semente (ver core/rng.ts pro porque e pros limites disso).
import { nextFloat, type Rng } from './rng'

export function randRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min)
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randRange(rng, min, max + 1))
}

export function rollChance(rng: Rng, probability0to1: number): boolean {
  return nextFloat(rng) < probability0to1
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// Sorteia um item com probabilidade proporcional a `weightFn(item)` — usado nas
// tabelas de spawn, onde o peso e o tier de encontro real do Gen1/2 (ver
// scripts/derive-spawn-tiers.js).
export function weightedPick<T>(rng: Rng, items: T[], weightFn: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0)
  let roll = nextFloat(rng) * total
  for (const item of items) {
    roll -= weightFn(item)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}
