// Single source of truth for everything that persists between sessions.
// Plain data only (no class instances with behaviour) so it can be
// JSON-serialized directly by SaveManager.
import { MAPS } from '../data/maps.js';

// Every real, currently-sellable item (rods excluded — fishing isn't
// implemented, see CLAUDE.md's "fora de escopo" note).
const STARTING_ITEMS = {
  poke_ball: 10000, great_ball: 10000, ultra_ball: 10000, premier_ball: 10000,
  potion: 10000, super_potion: 10000, hyper_potion: 10000, max_potion: 10000,
  revive: 10000, max_revive: 10000,
};
const DEFAULT_AUTO_POT_RULES = [{ hpPercent: 40, itemId: 'potion' }];
const DEFAULT_AUTO_CATCH_CONFIG = { ballId: 'poke_ball', catchShinyEnabled: true, shinyBallId: 'great_ball' };
// Every hunt (see scripts/sync-planilha.js#pickTopHunts — all non-Surf,
// day-period Johto locations, plus the hand-authored Kanto bands) is
// unlocked from the start and skips the redundant "Desbloquear" tap — except
// any hunt that actually carries an unlockCost (currently just the
// legendary-only capstone hunt), which stays locked until paid for.
const DEFAULT_UNLOCKED_MAPS = Object.values(MAPS)
  .filter((map) => !map.unlockCost)
  .map((map) => map.id);

export class GameState {
  constructor() {
    this.team = []; // poke instances, max 6 (see data/pokes.js#createPokeInstance)
    this.activeIndex = 0;
    this.bagPokes = []; // every captured POKE lands here; move to team manually
    this.items = { ...STARTING_ITEMS }; // itemId -> quantity
    this.lockedItems = {}; // itemId -> true, guarded against sellItem/sellAllItems (see EconomySystem.js)
    this.wallet = { gold: 500000, diamonds: 5 };
    this.unlockedMaps = [...DEFAULT_UNLOCKED_MAPS];
    this.currentMapId = null; // null = at the Hospital
    this.autoToggles = { autoPot: true, autoCatch: true, autoRevive: true };
    this.autoPotRules = DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r })); // ordered list, first matching rule wins, max 3
    this.autoCatchConfig = { ...DEFAULT_AUTO_CATCH_CONFIG };
    // Per-species overrides for auto-catch: { speciesId, ballItemId }. Takes
    // priority over autoCatchConfig for that species — and unlike the
    // default/shiny config, never falls back to another ball when its own
    // runs out (see AutoSystem.js#maybeAutoCatch), so a player can dedicate a
    // scarce ball to one species without risking it getting drained on
    // everything else.
    this.autoCatchRules = [];
    // Bottom-left farming-rate panel totals — persisted (not just per page
    // load) so switching hunts or reloading the page never looks like a
    // reset; only the panel's own "Resetar" button (systems/StatsTracker.js)
    // clears it.
    this.perfStats = { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() };
    // Trainer (player) leveling, separate from the active POKE's own level —
    // see systems/ProgressionSystem.js#grantTrainerExp, granted per kill
    // alongside the POKE's own EXP.
    this.trainer = { name: 'Treinador', level: 1, exp: 0 };
    // Pokedex kill counters, keyed by speciesId: { normal, shiny }. Recorded
    // unconditionally in main.js#handleEnemyDefeated (both live and the
    // silent catch-up/Farm Offline paths), see systems/PokedexSystem.js.
    this.pokedexKills = {};
    // Champion Lance (data/nightmareMaps.js#LANCE_MAP_ID) is now Johto's
    // final hunt — clearing its 6-POKE sequence is a hard requirement to
    // reach Kanto (explicit user request), separate from the existing
    // per-map gold-cost unlock system above (every Kanto hunt itself still
    // carries no unlockCost — this is a second, continent-wide gate in front
    // of it). 'johto' always unlocked; 'kanto' only after
    // main.js#stepWorld's sequence-clear check calls unlockContinent.
    // 'nightmare' (Modo Pesadelo + the 11 legendary BOSS hunts,
    // data/nightmareMaps.js) is meant to be free from the start (see
    // CLAUDE.md) — included here upfront so HuntMenu.js's continent gate
    // (isContinentUnlocked) never blocks it. Real bug found live: every
    // nightmare-continent hunt showed "Bloqueado"/"Derrote o Campeao Lance"
    // forever, even after actually clearing Lance, because nothing ever
    // called unlockContinent('nightmare') — Lance's clear only ever unlocks
    // 'kanto'. See fromSnapshot below for the matching fix on existing saves.
    this.unlockedContinents = ['johto', 'nightmare'];
  }

  get activePoke() {
    return this.team[this.activeIndex] || null;
  }

  get hasStarter() {
    return this.team.length > 0;
  }

  setActiveIndex(index) {
    if (index >= 0 && index < this.team.length) this.activeIndex = index;
  }

  addItem(itemId, qty = 1) {
    this.items[itemId] = (this.items[itemId] || 0) + qty;
  }

  hasItem(itemId, qty = 1) {
    return (this.items[itemId] || 0) >= qty;
  }

  removeItem(itemId, qty = 1) {
    if (!this.hasItem(itemId, qty)) return false;
    this.items[itemId] -= qty;
    if (this.items[itemId] <= 0) delete this.items[itemId];
    return true;
  }

  addGold(amount) {
    this.wallet.gold += amount;
  }

  spendGold(amount) {
    if (this.wallet.gold < amount) return false;
    this.wallet.gold -= amount;
    return true;
  }

  addDiamonds(amount) {
    this.wallet.diamonds += amount;
  }

  spendDiamonds(amount) {
    if (this.wallet.diamonds < amount) return false;
    this.wallet.diamonds -= amount;
    return true;
  }

  // Every capture lands in the bag; the player moves it into the team manually.
  addCapturedPoke(pokeInstance) {
    this.bagPokes.push(pokeInstance);
    return 'bag';
  }

  toggleItemLock(itemId) {
    if (this.lockedItems[itemId]) delete this.lockedItems[itemId];
    else this.lockedItems[itemId] = true;
  }

  isItemLocked(itemId) {
    return Boolean(this.lockedItems[itemId]);
  }

  unlockMap(mapId) {
    if (!this.unlockedMaps.includes(mapId)) this.unlockedMaps.push(mapId);
  }

  isMapUnlocked(mapId) {
    return this.unlockedMaps.includes(mapId);
  }

  unlockContinent(continent) {
    if (!this.unlockedContinents.includes(continent)) this.unlockedContinents.push(continent);
  }

  isContinentUnlocked(continent) {
    return this.unlockedContinents.includes(continent);
  }

  healTeamFully() {
    for (const poke of this.team) {
      poke.hp = poke.stats.hp;
    }
  }

  static fromSnapshot(data) {
    const state = new GameState();
    if (!data) return state;
    Object.assign(state, data);
    // Defensive defaults in case an older save is missing newer fields.
    state.autoToggles = { autoPot: true, autoCatch: true, autoRevive: true, ...(data.autoToggles || {}) };
    state.wallet = { gold: 0, diamonds: 0, ...(data.wallet || {}) };
    // Union (not replace) with the current default set — every hunt is free
    // to begin with, and a hunt-list reshuffle (merging/renaming maps) must
    // never leave an old save with newly-added map ids stuck "locked" just
    // because they didn't exist yet when the save was written.
    state.unlockedMaps = [...new Set([...(data.unlockedMaps || []), ...DEFAULT_UNLOCKED_MAPS])];
    state.team = data.team || [];
    state.bagPokes = data.bagPokes || [];
    state.items = data.items || {};
    state.lockedItems = data.lockedItems || {};
    state.autoPotRules = data.autoPotRules && data.autoPotRules.length > 0
      ? data.autoPotRules
      : DEFAULT_AUTO_POT_RULES.map((r) => ({ ...r }));
    state.autoCatchConfig = { ...DEFAULT_AUTO_CATCH_CONFIG, ...(data.autoCatchConfig || {}) };
    state.autoCatchRules = data.autoCatchRules || [];
    state.perfStats = { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now(), ...(data.perfStats || {}) };
    state.trainer = { name: 'Treinador', level: 1, exp: 0, ...(data.trainer || {}) };
    state.pokedexKills = data.pokedexKills || {};
    // No grandfathering: explicit user request made clearing Champion Lance
    // a hard requirement for Kanto, so every save (old or new) needs it —
    // an old save with existing Kanto progress just needs one Lance clear.
    // 'nightmare' is unioned in unconditionally (not just defaulted) since
    // every save written before this fix has unlockedContinents stuck at
    // just ['johto'] (or ['johto','kanto']) with no way to ever add
    // 'nightmare' itself — same "union, never replace" reasoning as
    // unlockedMaps right above.
    state.unlockedContinents = [...new Set([...(data.unlockedContinents || ['johto']), 'nightmare'])];
    return state;
  }
}
