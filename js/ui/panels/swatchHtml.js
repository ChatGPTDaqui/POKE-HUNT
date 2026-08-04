import { faceIconUrl } from '../../data/sprites.js';
import { pokeTooltipHtml } from './pokeTooltip.js';
import { rarityOf } from '../../data/rarity.js';

// The small colored square shown next to a POKE's name in list rows — a face
// icon image when the species has art, falling back to a flat color swatch.
// Shiny POKEs get a small sparkle badge pinned to the icon's top-left corner.
// Every swatch gets a border in its rarity color (rarityOf falls back to
// Comum for saves predating the rarity system, so old POKEs just render with
// the neutral Comum border instead of needing a migration).
// Passing `poke` also wraps the icon with a hover tooltip showing its stats.
export function swatchHtml(species, { isShiny = false, poke = null } = {}) {
  const url = faceIconUrl(species.id, isShiny);
  const borderStyle = poke ? `border-color:${rarityOf(poke).color};` : '';
  const inner = url
    ? `<img class="swatch" style="${borderStyle}" src="${url}" alt="${species.name}">`
    : `<div class="swatch" style="background:${species.color};${borderStyle}"></div>`;
  const withBadge = isShiny ? `<span class="swatch-wrap">${inner}<span class="shiny-badge">✨</span></span>` : inner;
  if (!poke) return withBadge;
  return `<span class="poke-hover" tabindex="0">${withBadge}${pokeTooltipHtml(poke, species)}</span>`;
}

// Shared `${shinyTag}${rarityTag}${nameSpan}` block used by every list row
// that shows a POKE's name (Bag/Shop/Team/Hospital/tooltip/profile/offline
// report) — used to be duplicated 2-line shiny logic per file; centralizing
// it here is also what makes the rarity tag (see data/rarity.js) show up
// everywhere at once instead of needing a 7-file sweep every time the tag
// markup changes.
export function pokeNameTagHtml(poke, species) {
  const shinyTag = poke.isShiny ? '<span class="shiny-tag">✨</span> ' : '';
  const rarity = rarityOf(poke);
  const rarityTag = `<span class="rarity-tag" style="color:${rarity.color};border-color:${rarity.color}">${rarity.label}</span> `;
  const nameSpan = `<span class="${poke.isShiny ? 'shiny-name' : ''}">${species.name}</span>`;
  return `${shinyTag}${rarityTag}${nameSpan}`;
}
