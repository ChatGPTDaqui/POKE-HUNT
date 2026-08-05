import { GameState } from './state/GameState.js';
import { SaveManager } from './core/SaveManager.js';
import { GameLoop } from './core/GameLoop.js';
import { eventBus } from './core/EventBus.js';
import { randInt, randRange, weightedPick } from './core/Random.js';
import { createFormulaEngine } from './core/FormulaEngine.js';

import { Renderer } from './render/Renderer.js';
import { Player } from './entities/Player.js';
import { Enemy } from './entities/Enemy.js';
import { Effect } from './entities/Effect.js';

import { SPECIES, createPokeInstance } from './data/pokes.js';
import { getMap, mapWalkRadius } from './data/maps.js';
import { getEncounter } from './data/enemies.js';
import { getItem } from './data/items.js';
import { isDamagingAbility } from './data/abilities.js';
import { FORMULAS } from './data/formulas.generated.js';
import { CAPTURE_ANIM_FRAME_DURATION, captureAnimRowCount } from './data/captureAnim.js';

import { updateMovement } from './systems/MovementSystem.js';
import { updateCombat } from './systems/CombatSystem.js';
import { updateAnimations } from './systems/AnimationSystem.js';
import { updateAutoHeal, maybeAutoCatch } from './systems/AutoSystem.js';
import { grantExp, expRewardForEnemy, evolvePokeInstance, grantTrainerExp, applyDeathExpPenalty } from './systems/ProgressionSystem.js';
import { awardKillLoot } from './systems/EconomySystem.js';
import { recordKill, recordBatch, resetStats } from './systems/StatsTracker.js';
import { recordPokedexKill } from './systems/PokedexSystem.js';
import { simulateWorldSeconds } from './systems/OfflineSimSystem.js';

import { UIManager } from './ui/UIManager.js';
import { showOfflineFarmModal } from './ui/panels/offlineFarmModal.js';
import { showLevelUpSplash } from './ui/panels/levelUpSplash.js';
import { showAutoFloatingPanel, closeAutoFloatingPanel, isAutoFloatingPanelOpen } from './ui/panels/autoFloatingPanel.js';

const STARTER_LEVEL = 1;
// Starters always come out predictable — Comum rarity, IV 75% (23/31) on
// every stat — instead of the usual per-instance random roll, so a fresh
// run's first POKE isn't a lucky/unlucky outlier (see createPokeInstance's
// options overload in data/pokes.js).
const STARTER_RARITY = 'comum';
const STARTER_IVS = { hp: 23, atkFis: 23, atkEsp: 23, def: 23, defEsp: 23, speed: 23 };
const DEATH_ANIM_GRACE_PERIOD = 4.0; // seconds a defeated enemy stays visible playing its Faint pose

// Both spreadsheet-editable (see CLAUDE.md's "Balanceamento de economia"
// section) — Farm Offline's hard cap, and the tick size the two headless
// catch-up systems (background-throttle + Farm Offline) simulate at. Coarser
// than the live game's real 1/60s so replaying up to 6h doesn't freeze the
// tab on load.
const formulaEngine = createFormulaEngine(FORMULAS);
const OFFLINE_FARM_MAX_HOURS = formulaEngine.evalOrDefault('OFFLINE_FARM_MAX_HOURS', 6);
const OFFLINE_SIM_STEP_SECONDS = formulaEngine.evalOrDefault('OFFLINE_SIM_STEP_SECONDS', 0.1);

const MIN_CATCHUP_GAP_SECONDS = 5; // below this, it's just normal frame jitter, not browser throttling
const MIN_OFFLINE_GAP_SECONDS = 60; // below this, a save-then-reload doesn't count as "you were gone"

// ---------- Boot ----------
const loadedSave = SaveManager.load();
const savedData = loadedSave ? loadedSave.data : null;
const savedAt = loadedSave ? loadedSave.savedAt : null;
const lastMapId = savedData ? savedData.currentMapId : null; // captured before it's nulled below
const gameState = GameState.fromSnapshot(savedData);
gameState.currentMapId = null; // always resume at the Hospital; enemies/effects aren't persisted

const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas);

// #game-viewport/#game-canvas are CSS-sized to 100vw/100vh (see
// css/style.css), so the canvas's actual drawing-buffer resolution (the
// width/height *attributes*, distinct from their CSS size) is kept in sync
// with that on load and on every resize — this is what lets the game fill
// 100% of the window at any aspect ratio (portrait, ultrawide, whatever)
// instead of a fixed 960x540 box letterboxed to fit. Renderer keys all of
// its camera/layout math off canvas.width/height already, so re-syncing
// those plus a handleResize() call is all that's needed.
function resizeCanvasToViewport() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  renderer.handleResize();
}
resizeCanvasToViewport();
window.addEventListener('resize', resizeCanvasToViewport);

let currentWorld = buildHospitalWorld();

function saveGame() {
  SaveManager.save(gameState);
}

// ---------- World construction ----------
function buildHospitalWorld() {
  const poke = gameState.activePoke;
  const spot = renderer.hospitalPlayerPos;
  const player = poke ? new Player({ poke, x: spot.x, y: spot.y }) : null;
  if (player && player.isDead) player.fainted = true;
  return { mapDef: null, player, enemies: [], effects: [], autoTimers: { pot: 0, revive: 0 } };
}

const SPAWN_MIN_DISTANCE = 250; // keep spawns off the player's start point — medium-to-long only
const SPAWN_MARGIN = 60;

// Random point inside the map's circular walkable area, at least a medium
// distance from where the player starts, so wilds are scattered for the
// POKE to walk up on rather than clustered right at the entrance.
function randomSpawnPoint(mapDef) {
  const cx = mapDef.bounds.width / 2;
  const cy = mapDef.bounds.height / 2;
  const radius = mapWalkRadius(mapDef) - SPAWN_MARGIN;
  let x, y;
  do {
    const angle = randRange(0, Math.PI * 2);
    const dist = Math.sqrt(randRange(0, 1)) * radius;
    x = cx + Math.cos(angle) * dist;
    y = cy + Math.sin(angle) * dist;
  } while (Math.hypot(x - mapDef.playerSpawn.x, y - mapDef.playerSpawn.y) < SPAWN_MIN_DISTANCE);
  return { x, y };
}

function spawnEnemyAt(mapDef) {
  const point = randomSpawnPoint(mapDef);
  // Weighted by each encounter's real Gen2 catch rate (see
  // scripts/sync-planilha.js#syncMapsAndEncounters) — common species (high
  // catch rate) show up more often than rarer ones in the same hunt.
  const encounterId = weightedPick(mapDef.enemyPool, (id) => getEncounter(id).weight);
  const encounter = getEncounter(encounterId);
  const level = randInt(encounter.minLevel, encounter.maxLevel);
  const poke = createPokeInstance(encounter.speciesId, level);
  return new Enemy({ poke, x: point.x, y: point.y, encounterId });
}

function buildMapWorld(mapId) {
  const mapDef = getMap(mapId);
  const poke = gameState.activePoke;
  const player = new Player({ poke, x: mapDef.playerSpawn.x, y: mapDef.playerSpawn.y });
  if (player.isDead) player.fainted = true;

  const enemies = [];
  for (let i = 0; i < mapDef.maxEnemies; i++) {
    enemies.push(spawnEnemyAt(mapDef));
  }

  return {
    mapDef, player, enemies, effects: [], pendingHits: [],
    autoTimers: { pot: 0, revive: 0 },
    reviveCountdown: null,
    respawnTimer: mapDef.respawnDelay,
  };
}

// Sparkle prefix for any toast message naming a POKE — plain emoji so it's
// safe in both the floating toast's textContent and the chat log's innerHTML
// (see ChatLog.js), unlike a colored <span> which only the chat log can render.
function shinyPrefix(isShiny) {
  return isShiny ? '✨ ' : '';
}

// Snaps #screen-transition to opaque black (transition disabled) so the
// caller can swap `currentWorld` behind it with no visible cut, then
// re-enables the transition and drops opacity back to 0 to fade the new
// world in. The forced reflow between the two writes is what makes the
// browser treat "opaque" as a real starting keyframe instead of collapsing
// both style writes into one no-op.
const screenTransitionEl = document.getElementById('screen-transition');
function coverScreen() {
  if (!screenTransitionEl) return;
  screenTransitionEl.style.transition = 'none';
  screenTransitionEl.style.opacity = '1';
  void screenTransitionEl.offsetWidth;
}
function fadeScreenIn() {
  if (!screenTransitionEl) return;
  screenTransitionEl.style.transition = 'opacity 400ms ease-out';
  screenTransitionEl.style.opacity = '0';
}

// ---------- Combat resolution (EXP, loot, capture) ----------
// `silent` is used by the two headless catch-up systems (background-throttle
// fast-forward and Farm Offline, see stepWorld/simulateWorldSeconds below) —
// the real XP/gold/loot/capture calls always run either way, only the
// visual Effects, toasts and per-kill save are skipped so replaying
// potentially thousands of kills doesn't spam the chat log or hammer
// localStorage. Always returns a summary of what happened so the caller can
// aggregate it (OfflineSimSystem.js) even when silent.
function handleEnemyDefeated(world, enemy, { silent = false } = {}) {
  const poke = gameState.activePoke;
  const enemySpecies = SPECIES[enemy.poke.speciesId];

  const expGain = expRewardForEnemy(enemy.poke);
  const { leveledUp, newAbilities, level } = grantExp(poke, expGain);
  const trainerResult = grantTrainerExp(gameState.trainer, expGain);
  const loot = awardKillLoot(gameState, enemy, world.mapDef);
  const captureResult = maybeAutoCatch(gameState, enemy.poke);
  recordPokedexKill(gameState, enemy.poke.speciesId, Boolean(enemy.poke.isShiny));

  if (!silent) {
    recordKill(gameState, { gold: loot.gold, xp: expGain, isShiny: enemy.poke.isShiny });

    // Lane-stacked above the entity (see Entity#claimEffectLane/Effect's
    // `owner`) — always lands above whatever else is already floating there
    // (damage/effectiveness text, ability name) instead of guessing a fixed
    // offset, and follows the enemy if it's still moving when this fires.
    world.effects.push(new Effect({
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: expGain, unit: 'XP', color: '#4ade80', duration: 1.1, owner: enemy,
    }));
    world.effects.push(new Effect({
      type: 'rewardText', x: enemy.x, y: enemy.y,
      targetX: enemy.x, targetY: enemy.y,
      value: loot.gold, unit: '🪙', color: '#fff59d', duration: 1.1, owner: enemy,
    }));

    eventBus.emit('toast', { message: `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} derrotado! +${expGain} EXP, +${loot.gold} ouro`, type: 'gold', channel: 'combat' });

    if (leveledUp) {
      eventBus.emit('toast', { message: `${shinyPrefix(poke.isShiny)}${SPECIES[poke.speciesId].name} subiu para o nivel ${level}!`, type: 'levelup', channel: 'combat' });
      for (const ability of newAbilities.filter(isDamagingAbility)) {
        eventBus.emit('toast', { message: `Nova habilidade desbloqueada: ${ability.name}!`, type: 'levelup', channel: 'combat' });
      }
    }
    if (trainerResult.leveledUp) {
      eventBus.emit('toast', { message: `${gameState.trainer.name} subiu para o nivel ${trainerResult.level}!`, type: 'levelup', channel: 'combat' });
      showLevelUpSplash();
    }

    for (const itemId of loot.droppedItems) {
      eventBus.emit('toast', { message: `Item encontrado: ${getItem(itemId).name}`, type: 'success', channel: 'world' });
    }

    // Pokeball-throw animation — only for an actual attempt (a ball was
    // really thrown: either it caught or the catch roll failed), not for
    // 'invalid_ball'/'no_ball' where nothing was ever thrown at the enemy.
    if (captureResult && captureResult.ballItemId) {
      const rowCount = captureAnimRowCount(captureResult.success);
      world.effects.push(new Effect({
        type: 'captureAnim', x: enemy.x, y: enemy.y, targetX: enemy.x, targetY: enemy.y,
        ballItemId: captureResult.ballItemId, success: captureResult.success,
        duration: rowCount * CAPTURE_ANIM_FRAME_DURATION + 0.3,
      }));
    }

    if (captureResult) {
      if (captureResult.success) {
        const location = captureResult.location === 'team' ? 'equipe' : 'mochila';
        eventBus.emit('toast', { message: `${shinyPrefix(enemy.poke.isShiny)}${enemySpecies.name} capturado! Foi para a ${location}.`, type: 'capture-success', channel: 'world' });
      } else if (captureResult.reason === 'roll_failed') {
        eventBus.emit('toast', { message: 'A captura falhou!', type: 'capture-fail', channel: 'combat' });
      }
    }

    saveGame();
  }

  return {
    gold: loot.gold,
    xp: expGain,
    leveledUp,
    trainerLeveledUp: trainerResult.leveledUp,
    isShiny: Boolean(enemy.poke.isShiny),
    captured: Boolean(captureResult && captureResult.success),
    capturedPoke: captureResult && captureResult.success ? captureResult.poke : null,
    droppedItems: loot.droppedItems,
  };
}

// ---------- Fixed-tick update ----------
// Shared by the live 60fps loop (silent:false, called once per GameLoop tick)
// and the two headless catch-up systems (silent:true, called in a tight loop
// by simulateWorldSeconds) — this is the ONE place movement/combat/auto-heal/
// respawn get advanced, so "you were away" progress is always computed by the
// exact same rules as actually playing. Returns the list of per-kill reward
// summaries (see handleEnemyDefeated) for the caller to aggregate.
function stepWorld(world, dt, { silent = false } = {}) {
  if (!world.player) return [];

  if (!world.mapDef) {
    // Hospital: no movement/combat, but the battle sprite still animates so it
    // doesn't just sit as the geometric placeholder there.
    if (!silent) updateAnimations(world, dt);
    return [];
  }

  updateMovement(world, dt);
  const { defeatedEnemies, playerJustFainted } = updateCombat(world, dt);
  // Must run AFTER combat: triggerAttackAnim() (called from inside
  // updateCombat) needs to be picked up the same tick, or the sprite shows
  // last tick's pose (e.g. Idle) for one frame while attackAnimTimer is
  // already counting down — a stale Idle/Shoot mismatch that reads as two
  // sprites fighting for the same frame. Purely visual, so skipped when silent.
  if (!silent) updateAnimations(world, dt);

  const kills = [];
  if (defeatedEnemies.length > 0) {
    for (const enemy of defeatedEnemies) {
      kills.push(handleEnemyDefeated(world, enemy, { silent }));
      enemy.deathRemovalTimer = silent ? 0 : DEATH_ANIM_GRACE_PERIOD; // let the Faint pose play before despawning (live only)
    }
  }
  for (const enemy of world.enemies) {
    if (enemy.isDead && enemy.deathRemovalTimer > 0) enemy.deathRemovalTimer -= dt;
  }
  world.enemies = world.enemies.filter((e) => !e.isDead || e.deathRemovalTimer > 0);

  if (playerJustFainted) {
    // Runs even when silent (offline/catch-up) — same rule as every other
    // reward/penalty pipeline here, only the toast is live-only.
    const { leveledDown, level } = applyDeathExpPenalty(gameState.activePoke);
    if (!silent) {
      eventBus.emit('toast', {
        message: `${SPECIES[world.player.poke.speciesId].name} desmaiou!${leveledDown ? ` Caiu para o nivel ${level}.` : ''}`,
        type: 'error',
        channel: 'combat',
      });
    }
  }

  const autoEvents = updateAutoHeal(world, gameState, dt);
  if (!silent) {
    for (const ev of autoEvents) {
      if (ev.type === 'auto_pot') eventBus.emit('toast', { message: `Auto-pot usou ${getItem(ev.itemId).name}.`, type: 'success', channel: 'combat' });
      if (ev.type === 'auto_revive') eventBus.emit('toast', { message: 'Auto-revive reanimou seu POKE!', type: 'success', channel: 'combat' });
    }
  }

  // BOSS hunts (Modo Pesadelo, see data/nightmareMaps.js) spawn their single
  // legendary once per visit and never refill the pool after it dies —
  // leaving and re-entering the hunt (buildMapWorld) is what brings it back.
  const aliveCount = world.enemies.filter((e) => !e.isDead).length;
  if (aliveCount < world.mapDef.maxEnemies && !world.mapDef.noRespawn) {
    world.respawnTimer -= dt;
    if (world.respawnTimer <= 0) {
      world.enemies.push(spawnEnemyAt(world.mapDef));
      world.respawnTimer = world.mapDef.respawnDelay;
    }
  }

  return kills;
}

let lastLiveTickAt = Date.now(); // wall-clock of the last real (non-silent) tick — see visibilitychange handler below

function updateGame(dt) {
  stepWorld(currentWorld, dt, { silent: false });
  lastLiveTickAt = Date.now();
}

function renderGame() {
  const world = currentWorld;
  if (!world.mapDef) {
    renderer.renderHospital(world.player);
  } else {
    renderer.renderMap(world.mapDef, world);
  }
  uiManager.updateHud();
}

// ---------- UI controller ----------
const controller = {
  returnToHospital() {
    coverScreen();
    gameState.currentMapId = null;
    currentWorld = buildHospitalWorld();
    saveGame();
    fadeScreenIn();
  },
  enterMap(mapId) {
    coverScreen();
    gameState.currentMapId = mapId;
    currentWorld = buildMapWorld(mapId);
    resetStats(gameState); // farming-rate panel restarts fresh for each new hunt
    uiManager.closeScreen();
    saveGame();
    fadeScreenIn();
  },
  chooseStarter(speciesId) {
    if (gameState.hasStarter) return;
    const poke = createPokeInstance(speciesId, STARTER_LEVEL, { ivs: STARTER_IVS, rarity: STARTER_RARITY });
    gameState.team.push(poke);
    gameState.activeIndex = 0;
    currentWorld = buildHospitalWorld();
    uiManager.enterGameAfterStart();
    saveGame();
  },
  resetGame() {
    SaveManager.clear();
    Object.assign(gameState, new GameState());
    gameState.currentMapId = null;
    currentWorld = buildHospitalWorld(); // player is null again since team is empty
    uiManager.closeScreen();
    uiManager.showStartScreenIfNeeded();
    saveGame();
  },
  healTeam() {
    gameState.healTeamFully();
    currentWorld = buildHospitalWorld();
    eventBus.emit('toast', { message: 'Equipe curada!', type: 'success', channel: 'world' });
    saveGame();
  },
  setActiveTeamIndex(index) {
    // Bring the newly-fielded POKE to the front of the team list — TeamMenu
    // always renders gameState.team in array order, so this is what makes it
    // visually "jump to the top" instead of just flipping a highlight.
    const [poke] = gameState.team.splice(index, 1);
    gameState.team.unshift(poke);
    gameState.setActiveIndex(0);
    // Swap the poke data on the existing player entity in place so this works
    // both at the Hospital and mid-hunt (position/target refs stay valid).
    const player = currentWorld.player;
    if (player) {
      player.poke = gameState.activePoke;
      player.cooldowns = {};
      player.flashTimer = 0;
      player.fainted = player.isDead;
      player.state = player.fainted ? 'dead' : 'wander';
      player.target = null;
    }
    saveGame();
  },
  removeFromTeam(pokeUid) {
    const idx = gameState.team.findIndex((p) => p.uid === pokeUid);
    if (idx === -1) return;
    if (gameState.team.length <= 1) {
      eventBus.emit('toast', { message: 'Voce precisa manter ao menos 1 POKE na equipe.', type: 'error', channel: 'world' });
      return;
    }
    const wasActive = idx === gameState.activeIndex;
    const [removed] = gameState.team.splice(idx, 1);
    gameState.bagPokes.push(removed);
    if (idx < gameState.activeIndex) {
      gameState.activeIndex -= 1;
    } else if (wasActive) {
      gameState.activeIndex = Math.min(gameState.activeIndex, gameState.team.length - 1);
    }
    // Same in-place player-entity swap as setActiveTeamIndex, needed only
    // when the removed POKE was the one currently in the field.
    if (wasActive) {
      const player = currentWorld.player;
      if (player) {
        player.poke = gameState.activePoke;
        player.cooldowns = {};
        player.flashTimer = 0;
        player.fainted = player.isDead;
        player.state = player.fainted ? 'dead' : 'wander';
        player.target = null;
      }
    }
    eventBus.emit('toast', { message: `${shinyPrefix(removed.isShiny)}${SPECIES[removed.speciesId].name} foi retirado da equipe.`, type: 'success', channel: 'world' });
    saveGame();
  },
  useItem(itemId) {
    const item = getItem(itemId);
    const player = currentWorld.player;
    if (!item || !player) return;

    if (item.kind === 'potion') {
      if (player.fainted) {
        eventBus.emit('toast', { message: 'POKE desmaiado! Use um Revive ou volte ao Hospital.', type: 'error', channel: 'world' });
      } else if (gameState.removeItem(itemId, 1)) {
        player.heal(item.healAmount);
        eventBus.emit('toast', { message: `Usou ${item.name}.`, type: 'success', channel: 'world' });
      }
    } else if (item.kind === 'revive') {
      if (!player.fainted) {
        eventBus.emit('toast', { message: 'O POKE ja esta consciente.', type: 'error', channel: 'world' });
      } else if (gameState.removeItem(itemId, 1)) {
        player.poke.hp = Math.round(player.maxHp * item.reviveHpPercent);
        player.fainted = false;
        player.state = 'wander';
        eventBus.emit('toast', { message: 'POKE reanimado!', type: 'success', channel: 'world' });
      }
    }
    saveGame();
  },
  evolvePoke(pokeUid) {
    const poke = [...gameState.team, ...gameState.bagPokes].find((p) => p.uid === pokeUid);
    if (!poke) return;
    const previousName = SPECIES[poke.speciesId].name;
    const result = evolvePokeInstance(poke, gameState);
    if (!result) return;
    if (result.blocked === 'stones') {
      const { itemId, count } = result.required;
      const have = gameState.items[itemId] || 0;
      eventBus.emit('toast', {
        message: `${previousName} precisa de ${count}x ${getItem(itemId).name} para evoluir (tem ${have}).`,
        type: 'error',
        channel: 'world',
      });
      return;
    }
    eventBus.emit('toast', { message: `${shinyPrefix(poke.isShiny)}${previousName} evoluiu para ${result.species.name}!`, type: 'levelup', channel: 'world' });
    showLevelUpSplash();
    saveGame();
  },
  openScreen(name) {
    uiManager.openScreen(name);
  },
  toast(message, type, channel) {
    eventBus.emit('toast', { message, type, channel });
  },
  save() {
    saveGame();
  },
  resetPerfStats() {
    resetStats(gameState);
    saveGame();
  },
};

const uiManager = new UIManager({ gameState, controller, getWorld: () => currentWorld });

const NURSE_CLICK_RADIUS = 30;
function canvasPointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}
canvas.addEventListener('click', (event) => {
  if (currentWorld.mapDef) return; // nurse only exists in the Hospital scene
  const { x, y } = canvasPointFromEvent(event);
  const nursePos = renderer.hospitalNursePos;
  if (Math.hypot(x - nursePos.x, y - nursePos.y) <= NURSE_CLICK_RADIUS) {
    controller.healTeam();
  }
});
// Hand cursor over the nurse (Hospital scene only) — same hit-test as the
// click handler above, so the cursor always matches what's actually clickable.
canvas.addEventListener('mousemove', (event) => {
  if (currentWorld.mapDef) {
    canvas.style.cursor = 'default';
    return;
  }
  const { x, y } = canvasPointFromEvent(event);
  const nursePos = renderer.hospitalNursePos;
  canvas.style.cursor = Math.hypot(x - nursePos.x, y - nursePos.y) <= NURSE_CLICK_RADIUS ? 'pointer' : 'default';
});

// Ctrl+Scroll zooms the battle-field camera in/out; plain scroll is left
// alone (no scrollable page content to hijack, but avoids surprising the
// user when they scroll with the mouse over the canvas for another reason).
const zoomLevelEl = document.getElementById('zoom-level');
function syncZoomLabel() {
  if (zoomLevelEl) zoomLevelEl.textContent = `${Math.round(renderer.zoom * 100)}%`;
}
canvas.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  renderer.adjustZoom(event.deltaY);
  syncZoomLabel();
}, { passive: false });

// Discreet +/- buttons, top-right (see #zoom-control in index.html) — same
// clamp as the wheel gesture above, just a fixed step per click.
document.getElementById('zoom-in-btn').addEventListener('click', () => {
  renderer.zoomStep(1);
  syncZoomLabel();
});
document.getElementById('zoom-out-btn').addEventListener('click', () => {
  renderer.zoomStep(-1);
  syncZoomLabel();
});
syncZoomLabel();

// Compact floating "Auto" panel (see ui/panels/autoFloatingPanel.js) — click
// toggles it open/closed instead of routing through UIManager.openScreen.
document.getElementById('auto-toggle-btn').addEventListener('click', () => {
  if (isAutoFloatingPanelOpen()) closeAutoFloatingPanel();
  else showAutoFloatingPanel(gameState, controller, () => currentWorld);
});

// ---------- Browser-throttle catch-up (tab minimized/backgrounded, still open) ----------
// NOT Farm Offline — the tab was never closed, the browser just throttled
// setInterval/rAF while hidden (Page Visibility spec, applies to minimized
// windows too). Uncapped and silent by design: this only corrects ticks the
// browser skipped, it doesn't grant a bonus for being away, so there's no
// cap and no toast/modal — the numbers just catch up.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  const gapSeconds = (Date.now() - lastLiveTickAt) / 1000;
  lastLiveTickAt = Date.now();
  if (gapSeconds < MIN_CATCHUP_GAP_SECONDS) return;

  const world = currentWorld;
  if (!world.mapDef || !world.player) return; // nothing to fast-forward at the Hospital
  const summary = simulateWorldSeconds({
    world,
    gameState,
    seconds: gapSeconds,
    stepSeconds: OFFLINE_SIM_STEP_SECONDS,
    stepFn: stepWorld,
  });
  // Same aggregate criteria the Farm Offline report uses (summary.gold/xp/
  // kills/shinySeen) — folded into the perf panel in one batch so its Ouro/H
  // and XP/H rates don't go stale just because this stretch of time was
  // simulated silently instead of ticked live.
  recordBatch(gameState, { gold: summary.gold, xp: summary.xp, mobs: summary.kills, shinys: summary.shinySeen });
  saveGame();
});

// ---------- Farm Offline (tab actually closed / computer off / etc.) ----------
// Runs once at boot. Distinct from the catch-up above: only fires when the
// save is genuinely stale (real gap since the last save timestamp), capped
// at OFFLINE_FARM_MAX_HOURS, and shown as a summary report instead of being
// silent — see js/systems/OfflineSimSystem.js and offlineFarmModal.js.
if (lastMapId && savedAt && gameState.hasStarter) {
  const offlineGapSeconds = (Date.now() - savedAt) / 1000;
  if (offlineGapSeconds >= MIN_OFFLINE_GAP_SECONDS) {
    const offlineMapDef = getMap(lastMapId);
    if (offlineMapDef) {
      const cappedSeconds = Math.min(offlineGapSeconds, OFFLINE_FARM_MAX_HOURS * 3600);
      const offlineWorld = buildMapWorld(lastMapId);
      const summary = simulateWorldSeconds({
        world: offlineWorld,
        gameState,
        seconds: cappedSeconds,
        stepSeconds: OFFLINE_SIM_STEP_SECONDS,
        stepFn: stepWorld,
      });
      summary.requestedSeconds = offlineGapSeconds; // report the real time away, not just the capped/simulated portion
      if (summary.kills > 0) {
        showOfflineFarmModal(summary);
      }
      saveGame();
    }
  }
}

const loop = new GameLoop({ update: updateGame, render: renderGame });
loop.start();

setInterval(saveGame, 10000);
window.addEventListener('beforeunload', saveGame);
