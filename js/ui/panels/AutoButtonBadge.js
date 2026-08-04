import { itemIconUrl } from '../../data/sprites.js';
import { getItem } from '../../data/items.js';

// Live counts for whichever items the Auto bot is actually configured to use
// right now — default ball, shiny ball (only if that toggle is on), and every
// per-species rule's ball (js/state/GameState.js#autoCatchRules), deduped.
// Deliberately NOT the whole inventory (would blow out the small bottom-left
// panel) — only what the bot could actually reach for on its next capture.
// No interactive elements in here, so a plain innerHTML rebuild every frame
// (called from UIManager.updateHud()) is safe — same reasoning as
// UIManager.js's revive/boss-defeat modals.
export function renderAutoItemBadge(container, gameState) {
  const activeIds = new Set();
  if (gameState.autoToggles.autoCatch) {
    if (gameState.autoCatchConfig.ballId) activeIds.add(gameState.autoCatchConfig.ballId);
    if (gameState.autoCatchConfig.catchShinyEnabled && gameState.autoCatchConfig.shinyBallId) {
      activeIds.add(gameState.autoCatchConfig.shinyBallId);
    }
    for (const rule of gameState.autoCatchRules) {
      if (rule.ballItemId) activeIds.add(rule.ballItemId);
    }
  }

  if (activeIds.size === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = [...activeIds].map((itemId) => {
    const item = getItem(itemId);
    if (!item) return '';
    const iconUrl = itemIconUrl(itemId);
    const icon = iconUrl ? `<img class="item-icon" src="${iconUrl}" alt="${item.name}">` : '';
    const count = gameState.items[itemId] || 0;
    return `<div class="auto-item-row">${icon}<span>${item.name} x${count}</span></div>`;
  }).join('');
}
