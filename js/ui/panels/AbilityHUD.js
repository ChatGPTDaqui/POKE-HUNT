import { getAbility, BASIC_ATTACK, isDamagingAbility } from '../../data/abilities.js';
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

export function renderAbilityHud(container, { world }) {
  const player = world && world.player;
  if (!player || !player.poke) {
    container.innerHTML = '';
    return;
  }

  const ids = [BASIC_ATTACK.id, ...player.poke.unlockedAbilities]
    .filter((id) => isDamagingAbility(getAbility(id)));
  container.innerHTML = ids.map((id) => {
    const ability = getAbility(id);
    const cd = player.cooldowns[id] || 0;
    const ready = cd <= 0;
    const typeColor = colorForType(ability.type);
    const borderColor = CATEGORY_BORDER[ability.category] || CATEGORY_BORDER.physical;
    const aoeClass = ability.target === 'aoe' ? ' aoe' : '';
    return `
      <div class="ability-slot${ready ? ' ready' : ''}${aoeClass}" title="${ability.name}"
        style="background: ${typeColor}; border-color: ${borderColor};">
        <span>${shortLabel(ability.name)}</span>
        ${!ready ? `<div class="cooldown-overlay">${cd.toFixed(1)}</div>` : ''}
        <div class="dmg-badge">${ability.power}</div>
      </div>
    `;
  }).join('');
}
