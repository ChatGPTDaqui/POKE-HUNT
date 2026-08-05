// Which particle "family" each elemental type's hit/AOE effect uses (see
// render/Sprites.js#drawShapeParticle) — layered on top of the existing
// procedural canvas VFX (js/render/Sprites.js, "Sprite de golpe: procedural,
// nao mais imagem" in CLAUDE.md) instead of replacing it: no real per-type
// spritesheet/gif exists in the repo for any of the 17 elemental types, so
// this is the CSS-fallback-equivalent for a Canvas game — a colored,
// type-themed shape drawn with plain 2D primitives, never an <img>/404 risk,
// no asset pipeline needed. If real spritesheets/gifs are added per type
// later, they only need to plug into drawShapeParticle's dispatch (or bypass
// it with an image draw when available) — nothing else in the combat/effect
// pipeline needs to change (see Effect.js#elementType / CombatSystem.js).
// Several types intentionally share a shape family (e.g. ROCK/GROUND both
// "chunk", DRAGON/DARK both "claw") — colorForType() already makes them
// read as distinct elements, and 12 real shape families across 17 types is
// far more differentiated than the single generic burst this replaces.
export const IMPACT_SHAPE_BY_TYPE = {
  FIRE: 'flame',
  WATER: 'droplet',
  GRASS: 'leaf',
  BUG: 'shard',
  ELECTRIC: 'bolt',
  ICE: 'crystal',
  FIGHTING: 'star',
  POISON: 'bubble',
  GROUND: 'chunk',
  ROCK: 'chunk',
  FLYING: 'feather',
  PSYCHIC: 'swirl',
  GHOST: 'wisp',
  DRAGON: 'claw',
  DARK: 'claw',
  STEEL: 'shard',
  NORMAL: 'dot',
};

export function impactShapeForType(type) {
  return IMPACT_SHAPE_BY_TYPE[type] || 'dot';
}
