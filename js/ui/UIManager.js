import { eventBus } from '../core/EventBus.js';
import { renderHud } from './panels/HUD.js';
import { renderAbilityHud } from './panels/AbilityHUD.js';
import { renderHuntMenu } from './panels/HuntMenu.js';
import { renderShopMenu } from './panels/ShopMenu.js';
import { renderTeamMenu } from './panels/TeamMenu.js';
import { renderBagMenu } from './panels/BagMenu.js';
import { renderPokedexMenu } from './panels/PokedexMenu.js';
import { renderSettingsScreen } from './panels/SettingsScreen.js';
import { renderStartScreen } from './panels/StartScreen.js';
import { renderPerfStats } from './panels/PerfStatsHUD.js';
import { renderAutoItemBadge } from './panels/AutoButtonBadge.js';
import { updateAutoFloatingPanelCounts } from './panels/autoFloatingPanel.js';
import { ChatLog } from './panels/ChatLog.js';
import { makeDraggable } from './draggable.js';
import { LANCE_MAP_ID } from '../data/nightmareMaps.js';

// Hospital and Auto are no longer DOM overlays — Hospital is just the canvas
// scene (click the nurse to heal, see main.js), and Auto is a small floating
// panel (see ui/panels/autoFloatingPanel.js) instead of a full .screen.
const PANEL_RENDERERS = {
  hunt: renderHuntMenu,
  shop: renderShopMenu,
  team: renderTeamMenu,
  bag: renderBagMenu,
  pokedex: renderPokedexMenu,
  settings: renderSettingsScreen,
};

export class UIManager {
  constructor({ gameState, controller, getWorld }) {
    this.gameState = gameState;
    this.controller = controller;
    this.getWorld = getWorld;
    this.hudEl = document.getElementById('hud');
    this.abilityHudEl = document.getElementById('ability-hud');
    this.toastsEl = document.getElementById('toasts');
    this.navEl = document.getElementById('bottom-nav');
    this.overlayRoot = document.getElementById('overlay-root');
    this.perfStatsEl = document.getElementById('perf-stats');
    this.autoItemBadgeEl = document.getElementById('auto-item-badge');
    this.reviveModalEl = document.getElementById('revive-modal');
    this.bossDefeatModalEl = document.getElementById('boss-defeat-modal');
    this.lanceCountdownModalEl = document.getElementById('lance-countdown-modal');
    this.lanceVictoryReturnEl = document.getElementById('lance-victory-return');
    this.chatLog = new ChatLog(document.getElementById('chat-log'));
    this.currentScreen = null;
    // Scroll position within each screen's scrolling body, keyed by screen
    // name — restored across the full teardown/rebuild every refresh() does
    // (every filter/sort/tab click calls _renderScreen() from scratch, which
    // would otherwise reset scroll to the top on every single interaction).
    this._scrollPositions = {};

    this._wireNav();
    // Delegated: renderHud() rebuilds #hud's innerHTML every render frame
    // (60fps), which destroys/recreates the evolve button mid-click before a
    // directly-bound listener can fire. A listener on the stable hudEl itself
    // survives those rebuilds.
    this.hudEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.evolve-tag');
      if (btn) this.controller.evolvePoke(btn.dataset.uid);
    });
    // Same rebuild-every-frame situation as the HUD's evolve button above.
    this.perfStatsEl.addEventListener('click', (e) => {
      if (e.target.closest('.perf-reset-btn')) this.controller.resetPerfStats();
    });
    // BOSS-hunt defeat warning: built once (see _updateBossDefeatModal, which
    // only ever toggles the 'visible' class, never rewrites innerHTML) so a
    // direct listener here is safe without the delegated-listener trick the
    // 60fps-rebuilt panels above need.
    this.bossDefeatModalEl.innerHTML = `
      <div class="boss-defeat-title">Voce foi derrotado!</div>
      <button class="boss-defeat-btn">Volte para Hospital e nao pise mais aqui</button>
    `;
    this.bossDefeatModalEl.querySelector('.boss-defeat-btn').addEventListener('click', () => {
      this.controller.returnToHospital();
    });
    // Champion Lance victory shortcut: same "built once, only toggled" safety
    // as the defeat warning right above — see _updateLanceVictoryReturn.
    this.lanceVictoryReturnEl.innerHTML = `
      <div class="lance-victory-title">Voce derrotou o Campeao Lance!</div>
      <button class="lance-victory-btn">Retornar ao Centro Pokemon</button>
    `;
    this.lanceVictoryReturnEl.querySelector('.lance-victory-btn').addEventListener('click', () => {
      this.controller.returnToHospital();
    });
    // Click-outside-to-close: only when a real screen is open (currentScreen
    // set via openScreen/_renderScreen) — the forced start-screen renders
    // directly into overlayRoot with currentScreen left null and must not be
    // dismissable this way, since picking a starter isn't optional.
    this.overlayRoot.addEventListener('click', (e) => {
      if (this.currentScreen && e.target === this.overlayRoot) this.closeScreen();
    });
    // Combat-channel messages (damage/turns/deaths) go ONLY to the Log tab —
    // everything else still pops as a toast too, and gets logged either way.
    eventBus.on('toast', ({ message, type, channel }) => {
      this.chatLog.addLine(message, type, channel);
      if (channel !== 'combat') this._showToast(message, type);
    });

    if (!this.showStartScreenIfNeeded()) {
      this.closeScreen();
      this._highlightNav('hospital');
    }
  }

  // Returns true (and blocks the normal UI) while no starter has been chosen.
  showStartScreenIfNeeded() {
    const needsStart = !this.gameState.hasStarter;
    this.navEl.style.display = needsStart ? 'none' : '';
    this.hudEl.style.display = needsStart ? 'none' : '';
    this.abilityHudEl.style.display = needsStart ? 'none' : '';

    if (needsStart) {
      this.currentScreen = null;
      this.overlayRoot.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.className = 'screen panel start-screen';
      this.overlayRoot.appendChild(wrapper);
      renderStartScreen(wrapper, { gameState: this.gameState, controller: this.controller });
    }
    return needsStart;
  }

  // Called once a starter has just been chosen (or after a reset undoes one).
  enterGameAfterStart() {
    if (!this.showStartScreenIfNeeded()) {
      this.closeScreen();
      this._highlightNav('hospital');
    }
  }

  _wireNav() {
    this.navEl.querySelectorAll('button[data-nav]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.nav;
        if (target === 'hospital') {
          // Hospital is just the canvas scene now (click the nurse to heal,
          // see main.js) — no DOM modal pops on top of it anymore.
          this.controller.returnToHospital();
          this.closeScreen();
          this._highlightNav('hospital');
        } else {
          this.openScreen(target);
        }
      });
    });
  }

  openScreen(name) {
    this.currentScreen = name;
    this._renderScreen();
    this._highlightNav(name);
  }

  closeScreen() {
    this.currentScreen = null;
    this.overlayRoot.innerHTML = '';
    this._highlightNav(null);
  }

  _highlightNav(name) {
    this.navEl.querySelectorAll('button[data-nav]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.nav === name);
    });
  }

  _renderScreen() {
    this.overlayRoot.innerHTML = '';
    if (!this.currentScreen) return;

    // Compact instead of the old near-fullscreen inset — every remaining
    // .screen (Equipe/Mochila/Hunts/Loja/Config; Hospital/Auto left this
    // system entirely, see PANEL_RENDERERS above) shrinks so the battlefield
    // stays visible behind it.
    const wrapper = document.createElement('div');
    wrapper.className = 'screen panel compact';

    // Non-scrolling chrome: close button always stays put (see #screen-body
    // below, the only part that actually scrolls), and doubles as the
    // window's drag handle — explicit user request that every window on
    // screen can be repositioned.
    const topbar = document.createElement('div');
    topbar.className = 'screen-topbar';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.textContent = 'X';
    closeBtn.addEventListener('click', () => this.closeScreen());
    topbar.appendChild(closeBtn);
    wrapper.appendChild(topbar);
    makeDraggable(wrapper, topbar);

    const body = document.createElement('div');
    body.className = 'screen-body';
    wrapper.appendChild(body);
    this.overlayRoot.appendChild(wrapper);

    const renderer = PANEL_RENDERERS[this.currentScreen];
    if (renderer) {
      renderer(body, {
        gameState: this.gameState,
        controller: this.controller,
        world: this.getWorld(),
        refresh: () => this._renderScreen(),
      });
    }

    body.scrollTop = this._scrollPositions[this.currentScreen] || 0;
    body.addEventListener('scroll', () => {
      this._scrollPositions[this.currentScreen] = body.scrollTop;
    });
  }

  updateHud() {
    renderHud(this.hudEl, { gameState: this.gameState, world: this.getWorld(), controller: this.controller });
    renderAbilityHud(this.abilityHudEl, { world: this.getWorld() });
    renderPerfStats(this.perfStatsEl, this.gameState);
    renderAutoItemBadge(this.autoItemBadgeEl, this.gameState);
    updateAutoFloatingPanelCounts(this.gameState);
    this._updateReviveModal();
    this._updateBossDefeatModal();
    this._updateLanceCountdownModal();
    this._updateLanceVictoryReturn();
  }

  // Explicit user request: a "Retornar ao Centro Pokemon" button appears
  // ONLY after beating Champion Lance, for as long as the player is still
  // standing in his hunt (world.sequenceCleared, set once per visit by
  // main.js#stepWorld's sequence-clear check — leaving and coming back
  // resets it, same as everything else about that world object, but
  // isContinentUnlocked/'kanto' stays unlocked forever regardless).
  _updateLanceVictoryReturn() {
    const world = this.getWorld();
    const visible = Boolean(world && world.mapDef && world.mapDef.id === LANCE_MAP_ID && world.sequenceCleared);
    this.lanceVictoryReturnEl.classList.toggle('visible', visible);
  }

  // Champion Lance's intro countdown (world.countdownRemaining, see
  // main.js#buildMapWorld/stepWorld) — no interactive elements, so a plain
  // innerHTML rebuild every frame is safe, same as the revive modal above.
  _updateLanceCountdownModal() {
    const world = this.getWorld();
    const remaining = world && world.countdownRemaining;
    const visible = remaining != null && remaining > 0;
    this.lanceCountdownModalEl.classList.toggle('visible', visible);
    if (visible) {
      this.lanceCountdownModalEl.innerHTML = `
        <div class="lance-countdown-title">O Campeao Lance se aproxima...</div>
        <div class="lance-countdown-count">${Math.ceil(remaining)}</div>
      `;
    }
  }

  // BOSS hunts disable auto-pot/auto-revive entirely (see AutoSystem.js) —
  // dying there is meant to be final, so instead of the revive countdown
  // this shows a persistent warning whose only way out is walking away.
  _updateBossDefeatModal() {
    const world = this.getWorld();
    const visible = Boolean(world && world.mapDef && world.mapDef.noRespawn && world.player && world.player.fainted);
    this.bossDefeatModalEl.classList.toggle('visible', visible);
  }

  // Auto-Revive's countdown (world.reviveCountdown, see AutoSystem.js#AUTO_REVIVE_DELAY) —
  // no interactive elements here, so a plain innerHTML rebuild every frame
  // is safe (unlike the HUD evolve button, nothing here needs to survive a
  // mid-click DOM swap).
  _updateReviveModal() {
    const world = this.getWorld();
    const countdown = world && world.reviveCountdown;
    const visible = countdown != null && countdown > 0;
    this.reviveModalEl.classList.toggle('visible', visible);
    if (visible) {
      this.reviveModalEl.innerHTML = `
        <div class="revive-modal-title">POKE desmaiado! Auto-Revive em...</div>
        <div class="revive-modal-count">${Math.ceil(countdown)}</div>
      `;
    }
  }

  _showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    this.toastsEl.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }
}
