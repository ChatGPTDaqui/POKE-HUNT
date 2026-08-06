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

// Hard ceilings on how much work one call may do, so a very long gap can't
// freeze (or get the tab killed on) a slow device. Two independent guards:
//
// 1. `maxSteps` bounds the ITERATION COUNT — the step size grows past the
//    requested `stepSeconds` when the gap is huge, trading combat fidelity
//    for a bounded loop instead of an unbounded one (a 3-day gap at 0.1s is
//    2.6M full combat steps; nothing weaker than a desktop survives that).
// 2. `maxWallClockMs` bounds the REAL TIME spent, checked every
//    CLOCK_CHECK_EVERY iterations. Running out does NOT immediately throw
//    the rest of the gap away: the step is quadrupled (up to
//    MAX_COARSEN_ROUNDS times) so the remainder still gets simulated, just
//    at lower fidelity — losing accuracy beats losing the player's hours.
//    Only when even that isn't enough does it stop with `truncated:true`,
//    which still beats hanging the main thread until the browser kills the
//    page (that used to mean the save never happened either, so the same
//    doomed simulation ran again on every single load).
// 250k keeps the full 6h Farm Offline cap running at the requested 0.1s step
// (6h/0.1 = 216k) — i.e. no fidelity change for the case the game actually
// ships with; only gaps longer than that (the uncapped background catch-up)
// get a coarser step.
const DEFAULT_MAX_STEPS = 250000;
const DEFAULT_MAX_WALL_CLOCK_MS = 2500;
const CLOCK_CHECK_EVERY = 512;
// Cada rodada de "coarsening" quadruplica o passo, entao o trabalho que
// falta cai 4x — 3 rodadas cobrem ate 64x o passo original, o que fecha
// qualquer gap realista. Cada rodada ganha meio orcamento novo, entao o
// custo total nunca passa de ~2.5x maxWallClockMs.
const COARSEN_FACTOR = 4;
const MAX_COARSEN_ROUNDS = 3;

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

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
    truncated: false, // ran out of the wall-clock budget before covering the whole gap
    stepSeconds: 0, // the step size actually used (may be coarser than requested — see DEFAULT_MAX_STEPS)
  };
}

// `stepFn(world, dt, { silent }) -> killResults[]` — see main.js#stepWorld.
// Each kill result is whatever main.js#handleEnemyDefeated returns:
// { gold, xp, leveledUp, trainerLeveledUp, isShiny, captured, capturedPoke }.
export function simulateWorldSeconds({
  world,
  gameState,
  seconds,
  stepSeconds,
  stepFn,
  maxSteps = DEFAULT_MAX_STEPS,
  maxWallClockMs = DEFAULT_MAX_WALL_CLOCK_MS,
}) {
  const summary = createEmptySummary();
  summary.requestedSeconds = seconds;
  // Guard against a non-finite/negative gap (a device whose wall clock jumped
  // backwards mid-session would otherwise loop forever here).
  if (!Number.isFinite(seconds) || seconds <= 0 || !world.player) return summary;

  const itemsBefore = { ...gameState.items };
  const stepCap = Math.max(1, maxSteps);
  let step = Math.max(Math.max(0.01, stepSeconds), seconds / stepCap);
  let deadline = nowMs() + maxWallClockMs;
  let coarsenRounds = 0;
  let sinceClockCheck = 0;
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

    sinceClockCheck += 1;
    if (sinceClockCheck >= CLOCK_CHECK_EVERY) {
      sinceClockCheck = 0;
      if (nowMs() >= deadline) {
        if (coarsenRounds < MAX_COARSEN_ROUNDS && remaining > step) {
          coarsenRounds += 1;
          step *= COARSEN_FACTOR;
          deadline = nowMs() + maxWallClockMs / 2;
        } else {
          summary.truncated = true;
          break;
        }
      }
    }
  }

  summary.stepSeconds = step;

  summary.simulatedSeconds = seconds - Math.max(0, remaining);

  const itemIds = new Set([...Object.keys(itemsBefore), ...Object.keys(gameState.items)]);
  for (const itemId of itemIds) {
    const delta = (gameState.items[itemId] || 0) - (itemsBefore[itemId] || 0);
    if (delta > 0) summary.itemsGained[itemId] = delta;
    else if (delta < 0) summary.itemsConsumed[itemId] = -delta;
  }

  return summary;
}
