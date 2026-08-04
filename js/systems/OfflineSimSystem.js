// Headless time-lapse driver shared by the two "you weren't watching" systems
// (see CLAUDE.md): the browser-throttle catch-up that fires when a minimized/
// backgrounded tab becomes visible again (uncapped, silent), and the real
// Farm Offline report shown on boot after the tab/app was actually closed
// (capped at OFFLINE_FARM_MAX_HOURS, shown as a summary modal).
//
// Deliberately does NOT reimplement movement/combat/auto-heal — it drives
// `stepFn` (main.js#stepWorld), the exact same function the live 60fps loop
// calls every frame, just in silent mode and in a tight loop instead of one
// call per animation frame. That guarantees the estimate is the real combat
// pipeline (crit, STAB, effectiveness, auto-pot/revive/catch, respawn — all
// of it), not a separate theoretical formula that could drift out of sync.

export function createEmptySummary() {
  return {
    requestedSeconds: 0,
    simulatedSeconds: 0,
    kills: 0,
    gold: 0,
    xp: 0,
    captures: [], // { speciesId, level, isShiny, rarity }
    shinySeen: 0,
    shinyCaptured: 0,
    itemsGained: {}, // itemId -> qty
    itemsConsumed: {}, // itemId -> qty
    pokeLeveledUp: false,
    trainerLeveledUp: false,
    stoppedEarly: false, // fainted with no way to auto-revive (no toggle, or no `revive` left)
  };
}

// `stepFn(world, dt, { silent }) -> killResults[]` — see main.js#stepWorld.
// Each kill result is whatever main.js#handleEnemyDefeated returns:
// { gold, xp, leveledUp, trainerLeveledUp, isShiny, captured, capturedPoke }.
export function simulateWorldSeconds({ world, gameState, seconds, stepSeconds, stepFn }) {
  const summary = createEmptySummary();
  summary.requestedSeconds = seconds;
  if (seconds <= 0 || !world.player) return summary;

  const itemsBefore = { ...gameState.items };
  const step = Math.max(0.01, stepSeconds);
  let remaining = seconds;

  while (remaining > 0) {
    const dt = Math.min(step, remaining);
    remaining -= dt;

    const kills = stepFn(world, dt, { silent: true }) || [];
    for (const result of kills) {
      summary.kills += 1;
      summary.gold += result.gold;
      summary.xp += result.xp;
      if (result.leveledUp) summary.pokeLeveledUp = true;
      if (result.trainerLeveledUp) summary.trainerLeveledUp = true;
      if (result.isShiny) summary.shinySeen += 1;
      if (result.captured && result.capturedPoke) {
        summary.captures.push({
          speciesId: result.capturedPoke.speciesId,
          level: result.capturedPoke.level,
          isShiny: Boolean(result.capturedPoke.isShiny),
          rarity: result.capturedPoke.rarity,
        });
        if (result.capturedPoke.isShiny) summary.shinyCaptured += 1;
      }
    }

    if (world.player.fainted) {
      const canRecover = gameState.autoToggles.autoRevive && gameState.hasItem('revive', 1);
      if (!canRecover) {
        summary.stoppedEarly = true;
        break;
      }
    }
  }

  summary.simulatedSeconds = seconds - Math.max(0, remaining);

  const itemIds = new Set([...Object.keys(itemsBefore), ...Object.keys(gameState.items)]);
  for (const itemId of itemIds) {
    const delta = (gameState.items[itemId] || 0) - (itemsBefore[itemId] || 0);
    if (delta > 0) summary.itemsGained[itemId] = delta;
    else if (delta < 0) summary.itemsConsumed[itemId] = -delta;
  }

  return summary;
}
