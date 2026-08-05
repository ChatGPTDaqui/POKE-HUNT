import { getAbility, BASIC_ATTACK, isDamagingAbility, resolveAbilityCategory } from '../../data/abilities.js';
import { colorForType } from '../../data/typeColors.js';

// Physical/Special border colors and the AOE ring color are fixed UI accents
// (not per-type), so a glance at the slot tells you the attack's category and
// reach without reading the tooltip.
const CATEGORY_BORDER = { physical: '#9aa0a6', special: '#60a5fa' };

function shortLabel(name) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3);
}

// Explicit user request: double left-click on a slot toggles whether the
// auto-battle AI is allowed to pick that move at all (CombatSystem.js#pickAbility
// filters against `poke.disabledAbilities`) — most useful for opting out of
// the newly-punishing self-destruct moves, but works for any move. Stored as
// a plain {abilityId: true} map directly on the poke INSTANCE (same shape/
// no-migration-needed pattern as gameState.lockedItems) so it survives a
// save/reload and follows the POKE if it's swapped out of the active slot.
//
// `container` (the #ability-hud DOM node) is a stable element fetched once by
// UIManager and reused every frame — only its innerHTML is replaced here, so
// a listener attached to the container itself (event delegation) survives
// every re-render instead of being torn down along with the `.ability-slot`
// divs, avoiding the mousedown/mouseup-on-two-different-DOM-nodes issue
// documented in CLAUDE.md's "Bug de clique em botao..." gotcha.
function ensureToggleListener(container) {
  if (container._toggleBound) return;
  container._toggleBound = true;
  container.addEventListener('dblclick', (e) => {
    const slot = e.target.closest('.ability-slot');
    if (!slot) return;
    const abilityId = slot.dataset.abilityId;
    const poke = container._activePoke;
    if (!abilityId || !poke) return;
    if (!poke.disabledAbilities) poke.disabledAbilities = {};
    if (poke.disabledAbilities[abilityId]) delete poke.disabledAbilities[abilityId];
    else poke.disabledAbilities[abilityId] = true;
  });
}

export function renderAbilityHud(container, { world }) {
  const player = world && world.player;
  if (!player || !player.poke) {
    container.innerHTML = '';
    return;
  }

  ensureToggleListener(container);
  container._activePoke = player.poke;

  const disabled = player.poke.disabledAbilities || {};
  const ids = [BASIC_ATTACK.id, ...player.poke.unlockedAbilities]
    .filter((id) => isDamagingAbility(getAbility(id)));
  container.innerHTML = ids.map((id) => {
    const ability = getAbility(id);
    const isOff = !!disabled[id];
    const cd = player.cooldowns[id] || 0;
    const ready = cd <= 0 && !isOff;
    const typeColor = colorForType(ability.type);
    const borderColor = CATEGORY_BORDER[resolveAbilityCategory(ability, player.poke)] || CATEGORY_BORDER.physical;
    const aoeClass = ability.target === 'aoe' ? ' aoe' : '';
    const offClass = isOff ? ' disabled' : '';
    const title = `${ability.name}${isOff ? ' (desativado — 2x clique para reativar)' : ' (2x clique para desativar)'}`;
    return `
      <div class="ability-slot${ready ? ' ready' : ''}${aoeClass}${offClass}" title="${title}" data-ability-id="${id}"
        style="background: ${typeColor}; border-color: ${borderColor};">
        <span>${shortLabel(ability.name)}</span>
        ${!ready && !isOff ? `<div class="cooldown-overlay">${cd.toFixed(1)}</div>` : ''}
        ${isOff ? `<div class="cooldown-overlay ability-off-overlay">OFF</div>` : ''}
        <div class="dmg-badge">${ability.power}</div>
      </div>
    `;
  }).join('');
}
