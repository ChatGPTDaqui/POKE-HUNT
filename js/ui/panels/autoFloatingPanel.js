// Compact floating version of the old full-screen "Auto" panel — anchored
// near the toggle button instead of going through UIManager.openScreen
// (which dims/blurs the whole game behind any .screen), so the battlefield
// stays fully visible while automation toggles are open. Reuses
// renderAutoPanel's actual body untouched; only the container/positioning
// differs.
import { renderAutoPanel, updateAutoPanelCounts } from './AutoPanel.js';
import { makeDraggable } from '../draggable.js';

let currentOverlay = null;
let currentBody = null;

export function showAutoFloatingPanel(gameState, controller, getWorld) {
  if (currentOverlay) return; // already open — toggle button should close instead, see main.js

  const panel = document.createElement('div');
  panel.className = 'auto-floating-panel panel';
  panel.innerHTML = '<div class="auto-floating-topbar"><button class="close-btn">X</button></div><div class="auto-floating-body"></div>';
  document.body.appendChild(panel);
  currentOverlay = panel;
  // Explicit user request: every window that opens can be dragged around.
  makeDraggable(panel, panel.querySelector('.auto-floating-topbar'));

  const body = panel.querySelector('.auto-floating-body');
  currentBody = body;
  const refresh = () => renderAutoPanel(body, { gameState, controller, world: getWorld ? getWorld() : null, refresh });
  refresh();

  const close = () => {
    panel.remove();
    currentOverlay = null;
    currentBody = null;
    document.removeEventListener('mousedown', onOutsideClick, true);
  };
  function onOutsideClick(e) {
    if (!panel.contains(e.target) && e.target.id !== 'auto-toggle-btn') close();
  }
  panel.querySelector('.close-btn').addEventListener('click', close);
  // Deferred so the same click that opened the panel (bubbling from
  // #auto-toggle-btn) doesn't immediately trigger this and close it again.
  setTimeout(() => document.addEventListener('mousedown', onOutsideClick, true), 0);
}

export function closeAutoFloatingPanel() {
  if (currentOverlay) {
    currentOverlay.remove();
    currentOverlay = null;
  }
}

export function isAutoFloatingPanelOpen() {
  return currentOverlay !== null;
}

// Called every frame from UIManager.updateHud() while the panel is open —
// keeps every item-count badge live (explicit user request: "atualizado em
// tempo real") without rebuilding the panel itself (see AutoPanel.js).
export function updateAutoFloatingPanelCounts(gameState) {
  if (currentBody) updateAutoPanelCounts(currentBody, gameState);
}
