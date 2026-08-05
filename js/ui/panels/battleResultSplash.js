// "VITORIA"/"DERROTA" banner for a sequence-boss fight (Champion Lance, see
// data/nightmareMaps.js) — same self-dismissing full-viewport overlay trick
// as levelUpSplash.js, just parametrized by text/color so one file covers
// both outcomes instead of duplicating the splash mechanics twice.
const DURATION_MS = 2500;

export function showBattleResultSplash(text, variant) {
  const el = document.createElement('div');
  el.className = `battle-result-splash battle-result-splash-${variant}`;
  el.innerHTML = `<span class="battle-result-splash-text">${text}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), DURATION_MS);
}
