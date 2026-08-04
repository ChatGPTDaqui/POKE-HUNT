// Real-time farming-rate tracker for the bottom-left perf panel. Totals live
// in gameState.perfStats (persisted via SaveManager) so switching hunts or
// reloading the page never looks like a reset — only resetStats() (wired to
// the panel's own "Resetar" button) clears it.
export function recordKill(gameState, { gold, xp, isShiny }) {
  const stats = gameState.perfStats;
  stats.gold += gold;
  stats.xp += xp;
  stats.mobs += 1;
  if (isShiny) stats.shinys += 1;
}

// Same accumulation as recordKill, but for a whole batch of kills at once —
// used to fold a silent background-throttle catch-up's aggregate summary
// (see main.js's visibilitychange handler + OfflineSimSystem.js) into the
// panel in one shot, instead of skipping it entirely. Without this, the
// Ouro/H and XP/H rates the panel reports would undercount whenever the tab
// was minimized: elapsedHours keeps ticking against wall-clock time, but
// none of the silent kills' gold/xp were ever added to the numerator.
export function recordBatch(gameState, { gold, xp, mobs, shinys }) {
  const stats = gameState.perfStats;
  stats.gold += gold;
  stats.xp += xp;
  stats.mobs += mobs;
  stats.shinys += shinys;
}

export function resetStats(gameState) {
  gameState.perfStats = { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() };
}

export function getPerfStats(gameState) {
  const stats = gameState.perfStats;
  const elapsedHours = Math.max(1 / 3600, (Date.now() - stats.since) / 3600000);
  return {
    goldPerHour: Math.round(stats.gold / elapsedHours),
    xpPerHour: Math.round(stats.xp / elapsedHours),
    mobsPerHour: Math.round(stats.mobs / elapsedHours),
    shinys: stats.shinys,
  };
}
