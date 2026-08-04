// Ability (move) definitions. `power`/`type`/`category`/`pp` all come from
// the spreadsheet sync (see abilities.generated.js) — `power` is the real
// Gen2 base-power number fed into DAMAGE_BASE (CombatSystem), `type` drives
// STAB/effectiveness, and `pp` drives `cooldown`: fewer PP means a slower-
// recharging move — cooldown = TICK_MS * (PP_REFERENCE / pp). Each ability's
// cooldown is tracked individually (CombatSystem.js), further scaled by the
// user's Speed stat.
//
// Level-to-learn is per SPECIES now, not per move (the real data has the
// same move learned at different levels by different species) — see
// data/pokes.js's `species.abilities` list of {key, levelReq}.
//
// BASIC_ATTACK is the one hand-authored exception: a universal fallback
// (not in the spreadsheet) so a species whose only learned moves so far are
// all 0-power status moves (e.g. a low-level Hoppip only knows Splash/
// Synthesis/Tail Whip until level 10) is never completely unable to fight —
// the same role "Struggle" plays in the real games. Being the one move every
// single POKE always has, its cooldown is a fixed BASE_ATTACK_INTERVAL (see
// CombatSystem.js) — not PP-based, and not Speed-scaled like the rest.
//
// Status/0-power moves are excluded from combat and from every player-facing
// list (isDamagingAbility) — they stay in the data below untouched, in case
// their mechanics (stat drops, etc) get implemented later.
import { createFormulaEngine } from '../core/FormulaEngine.js';
import { FORMULAS } from './formulas.generated.js';
import { ABILITIES_DATA } from './abilities.generated.js';

const formulaEngine = createFormulaEngine(FORMULAS);
const TICK_SECONDS = formulaEngine.eval('TICK_MS') / 1000;
const PP_REFERENCE = 20; // PP value that recharges at exactly TICK_SECONDS

function cooldownFromPp(pp) {
  return TICK_SECONDS * (PP_REFERENCE / Math.max(1, pp));
}

export const BASIC_ATTACK = {
  id: 'basic_attack',
  name: 'Ataque Basico',
  category: 'physical',
  type: 'NORMAL',
  target: 'single',
  power: 40,
  pp: 35,
};

// Moves that hit every adjacent target in the real games, cross-referenced
// against Bulbapedia's "moves that hit multiple Pokemon" list — only the
// ones that already deal damage here get the AOE treatment (the matching
// 0-power status moves, e.g. Growl/Tail Whip/Leer, stay inert per
// isDamagingAbility, so tagging them 'aoe' would have no effect anyway).
const AOE_ABILITY_KEYS = new Set(['razor_leaf', 'bubble', 'earthquake', 'explosion', 'magnitude', 'selfdestruct']);
const AOE_RADIUS = 240; // medium/high splash circle around the attacker (doubled per balance pass)

export const ABILITIES = Object.fromEntries(
  Object.entries(ABILITIES_DATA).map(([key, ability]) => {
    const isAoe = AOE_ABILITY_KEYS.has(key);
    return [
      key,
      {
        ...ability,
        target: isAoe ? 'aoe' : 'single',
        radius: isAoe ? AOE_RADIUS : undefined,
        cooldown: cooldownFromPp(ability.pp),
      },
    ];
  })
);

export function getAbility(id) {
  if (id === BASIC_ATTACK.id) return BASIC_ATTACK;
  return ABILITIES[id] || null;
}

// Status/0-power moves are inert for now (see file header) — every
// player-facing move list and the combat AI both filter through this.
export function isDamagingAbility(ability) {
  return !!ability && ability.power > 0;
}
