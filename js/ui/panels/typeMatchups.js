// Shared weakness/resistance breakdown for a species — used by the Pokedex
// (js/ui/panels/PokedexMenu.js) and the universal POKE profile card
// (js/ui/panels/PokeStatDetail.js, opened from Team/Bag/Shop/Hospital/HUD)
// so both show identical numbers instead of two hand-copied implementations
// drifting apart.
import { colorForType, TYPE_COLORS } from '../../data/typeColors.js';
import { getEffectiveness } from '../../data/typeChart.generated.js';

const ALL_TYPES = Object.keys(TYPE_COLORS);

function typeChip(type) {
  return `<span class="type-chip" style="background:${colorForType(type)}">${type.slice(0, 3)}</span>`;
}

// Every attacking type's real multiplier against this species (both its own
// types combined via getEffectiveness's dual-type multiply — same function
// CombatSystem.js uses for real damage, so this always matches what actually
// happens in a fight), bucketed by the resulting multiplier. `weak4x` is
// called out separately (explicit user request: flag when a species has TWO
// types that are each weak to the same attacking type, stacking into a real
// 4x hit) rather than folded into the regular 2x weakness list.
export function typeMatchups(species) {
  const weak4x = [];
  const weak2x = [];
  const resist2x = [];
  const resist4x = [];
  const immune = [];
  for (const atkType of ALL_TYPES) {
    const m = getEffectiveness(atkType, species.type, species.type2);
    if (m === 4) weak4x.push(atkType);
    else if (m === 2) weak2x.push(atkType);
    else if (m === 0.5) resist2x.push(atkType);
    else if (m === 0.25) resist4x.push(atkType);
    else if (m === 0) immune.push(atkType);
  }
  return { weak4x, weak2x, resist2x, resist4x, immune };
}

function typeChipRow(types) {
  return types.length > 0
    ? `<div class="row" style="flex-wrap:wrap;gap:4px">${types.map(typeChip).join('')}</div>`
    : '<span class="card-sub">Nenhum</span>';
}

// Offense side of the matchup — which opposing types this species' OWN
// type(s) hit hard (2x damage), i.e. the STAB-relevant advantage a player
// gets from bringing this species into a fight. Complementary to
// typeMatchups() above (which is entirely about defending), so it
// deliberately runs the effectiveness lookup the other way around: species'
// type as the attacker, every real type as a hypothetical single-typed
// defender — a single attacking type against a single defending type never
// exceeds 2x (4x only happens on the DEFENDING side, when two of the
// defender's own types are each independently weak to the same attack), so
// there's no "double advantage" bucket to track here, unlike weak4x above.
export function typeAdvantages(species) {
  const atkTypes = [species.type, species.type2].filter(Boolean);
  const advantage2x = [];
  for (const defType of ALL_TYPES) {
    const best = Math.max(...atkTypes.map((atkType) => getEffectiveness(atkType, defType, undefined)));
    if (best === 2) advantage2x.push(defType);
  }
  return { advantage2x };
}

export function weaknessSectionHtml(species) {
  const { weak4x, weak2x, resist2x, resist4x, immune } = typeMatchups(species);
  const { advantage2x } = typeAdvantages(species);
  const doubleWeakBlock = weak4x.length > 0 ? `
    <div class="card-sub" style="color:#ff5252;font-weight:600">⚠ Fraqueza dupla (4x de dano):</div>
    ${typeChipRow(weak4x)}
  ` : '';
  return `
    <div class="card-sub" style="color:#4caf50">Vantagem contra (2x de dano):</div>
    ${typeChipRow(advantage2x)}
    ${doubleWeakBlock}
    <div class="card-sub" style="margin-top:6px">Fraco contra (2x de dano):</div>
    ${typeChipRow(weak2x)}
    <div class="card-sub" style="margin-top:6px">Resiste (0.5x de dano):</div>
    ${typeChipRow(resist2x)}
    ${resist4x.length > 0 ? `
      <div class="card-sub" style="margin-top:6px">Resiste em dobro (0.25x de dano):</div>
      ${typeChipRow(resist4x)}
    ` : ''}
    <div class="card-sub" style="margin-top:6px">Imune a:</div>
    ${typeChipRow(immune)}
  `;
}
