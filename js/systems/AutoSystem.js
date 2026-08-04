import { getItem, ITEMS } from '../data/items.js';
import { attemptCapture } from './CaptureSystem.js';

const AUTO_ACTION_COOLDOWN = 1.0;
export const BEST_POTION_OPTION = 'best';
export const AUTO_REVIVE_DELAY = 5.0; // seconds a fainted POKE waits before Auto-Revive actually fires

// Resolves a rule's chosen potion to a concrete itemId. `best` picks the
// highest-healAmount potion the player currently owns.
function resolveRulePotionId(gameState, rule) {
  if (rule.itemId !== BEST_POTION_OPTION) return rule.itemId;
  const owned = Object.values(ITEMS)
    .filter((item) => item.kind === 'potion' && gameState.hasItem(item.id, 1))
    .sort((a, b) => b.healAmount - a.healAmount);
  return owned[0]?.id || null;
}

// Handles autoPot and autoRevive. Call once per fixed tick.
// `world.autoTimers` throttles repeated item usage.
// BOSS hunts (world.mapDef.noRespawn — the same flag that already marks the
// 11 legendary boss maps as "don't respawn the boss on death", see
// nightmareMaps.js) explicitly disable both toggles regardless of the
// player's own autoToggles settings — dying there is meant to be final
// (explicit user request), handled instead by the red defeat warning wired
// in main.js/UIManager.js.
export function updateAutoHeal(world, gameState, dt) {
  if (!world.autoTimers) world.autoTimers = { pot: 0, revive: 0 };
  const timers = world.autoTimers;
  timers.pot = Math.max(0, timers.pot - dt);
  timers.revive = Math.max(0, timers.revive - dt);

  const player = world.player;
  const events = [];
  const isBossHunt = Boolean(world.mapDef && world.mapDef.noRespawn);

  // Faint starts a fresh AUTO_REVIVE_DELAY-second countdown (shown as a modal
  // by UIManager) — Auto-Revive only actually fires once it reaches 0, not
  // the instant the POKE goes down.
  if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted) {
    world.reviveCountdown = world.reviveCountdown == null
      ? AUTO_REVIVE_DELAY
      : Math.max(0, world.reviveCountdown - dt);
  } else {
    world.reviveCountdown = null;
  }

  if (!isBossHunt && gameState.autoToggles.autoRevive && player.fainted && world.reviveCountdown <= 0 && timers.revive <= 0) {
    const revive = getItem('revive');
    if (revive && gameState.hasItem('revive', 1)) {
      gameState.removeItem('revive', 1);
      player.poke.hp = Math.round(player.maxHp * revive.reviveHpPercent);
      player.fainted = false;
      player.state = 'wander';
      timers.revive = AUTO_ACTION_COOLDOWN;
      world.reviveCountdown = null;
      events.push({ type: 'auto_revive', itemId: 'revive' });
    }
  }

  if (!isBossHunt && !player.fainted && gameState.autoToggles.autoPot && timers.pot <= 0) {
    const hpPct = (player.poke.hp / player.maxHp) * 100;
    for (const rule of gameState.autoPotRules) {
      if (hpPct > rule.hpPercent) continue;
      const resolvedId = resolveRulePotionId(gameState, rule);
      const item = resolvedId && getItem(resolvedId);
      if (!item || !gameState.hasItem(resolvedId, 1)) continue;
      gameState.removeItem(resolvedId, 1);
      player.heal(item.healAmount);
      timers.pot = AUTO_ACTION_COOLDOWN;
      events.push({ type: 'auto_pot', itemId: resolvedId });
      break; // only the first matching rule fires per tick
    }
  }

  return events;
}

// Called right after a kill when gameState.autoToggles.autoCatch is on.
// Precedence: a per-species rule (gameState.autoCatchRules) beats the
// shiny-ball config, which beats the default ball. A matched species rule
// has NO fallback to another ball when its own ball runs out — the bot just
// lets that species go uncaptured (kills it) instead of spending a different
// ball on it, since the whole point of a rule is reserving a specific ball
// for a specific species.
export function maybeAutoCatch(gameState, defeatedPoke) {
  if (!gameState.autoToggles.autoCatch) return null;

  const rule = gameState.autoCatchRules.find((r) => r.speciesId === defeatedPoke.speciesId);
  if (rule) {
    if (!rule.ballItemId || !gameState.hasItem(rule.ballItemId, 1)) return null;
    return attemptCapture(gameState, defeatedPoke, rule.ballItemId);
  }

  const config = gameState.autoCatchConfig;
  const isShiny = Boolean(defeatedPoke.isShiny);
  const ballId = isShiny && config.catchShinyEnabled ? config.shinyBallId : config.ballId;
  if (!ballId || !gameState.hasItem(ballId, 1)) return null;
  return attemptCapture(gameState, defeatedPoke, ballId);
}
