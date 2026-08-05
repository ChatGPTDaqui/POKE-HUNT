// Level-50 signature AoE move: explicit user request — every POKE (any
// species, any type) automatically learns one area move themed to its own
// PRIMARY type once it reaches level 50, with no equivalent in the
// spreadsheet (this is invented content, not real Gen2 data) — same
// "hand-authored layer on top of the sync" pattern as data/stones.js's 17
// per-type items. One entry per real elemental type in this dataset
// (TYPE_COLORS already enumerates exactly those 17, see data/typeColors.js).
//
// `category: 'dynamic'` is NOT a real category — CombatSystem.js/AbilityHUD.js/
// PokeStatDetail.js all resolve it per-attacker via abilities.js#resolveAbilityCategory
// (physical if the user's Atk Fisico stat is higher, special otherwise),
// per explicit user request ("calculado de acordo com o maior atributo do
// Pokemon").
import { TYPE_COLORS } from './typeColors.js';

export const TYPED_AOE_LEVEL = 50;
const TYPED_AOE_POWER = 70;
const TYPED_AOE_PP = 15;

export function typedAoeMoveKey(type) {
  return `aoe50_${type.toLowerCase()}`;
}

function buildTypedAoeMoves() {
  const moves = {};
  for (const type of Object.keys(TYPE_COLORS)) {
    const key = typedAoeMoveKey(type);
    moves[key] = {
      id: key,
      name: `Explosao Elemental (${type})`,
      type,
      category: 'dynamic',
      power: TYPED_AOE_POWER,
      pp: TYPED_AOE_PP,
    };
  }
  return moves;
}

export const TYPED_AOE_MOVES = buildTypedAoeMoves();
