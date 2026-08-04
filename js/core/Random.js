// RNG helpers used across combat/capture systems.
export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(randRange(min, max + 1));
}

export function rollChance(probability0to1) {
  return Math.random() < probability0to1;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Picks one item from `items` with probability proportional to
// `weightFn(item)` — used for spawn tables where some species should show up
// more often than others (see main.js#spawnEnemyAt).
export function weightedPick(items, weightFn) {
  const total = items.reduce((sum, item) => sum + weightFn(item), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= weightFn(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}
