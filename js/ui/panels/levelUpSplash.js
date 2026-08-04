// Big "LVL UP!" banner shown on POKE evolution and Trainer level-up — floats
// above everything (appended straight to <body>, same trick as
// confirmModal.js) so it works whether the player is mid-battle or inside a
// menu. No real pixel-art asset exists for this yet, so the "pixel art"
// look is faked with plain CSS: a chunky monospace font plus stepped
// text-shadow layers standing in for a pixelated outline. Self-removes after
// exactly 2s — callers don't need to track/clean up the element.
const DURATION_MS = 2000;

export function showLevelUpSplash() {
  const el = document.createElement('div');
  el.className = 'level-up-splash';
  el.innerHTML = '<span class="level-up-splash-text">LVL UP !</span>';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), DURATION_MS);
}
