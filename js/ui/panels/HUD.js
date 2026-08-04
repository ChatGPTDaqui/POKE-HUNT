import { SPECIES } from '../../data/pokes.js';
import { expProgressForInstance, canEvolve, trainerExpProgress } from '../../systems/ProgressionSystem.js';
import { spriteUrl } from '../../data/sprites.js';
import { showPokeProfileModal } from './PokeProfileModal.js';
import { rarityOf } from '../../data/rarity.js';

// Builds the static DOM skeleton once and caches element refs on the
// container. renderHud() then only ever touches text/width/style on those
// cached refs — it never replaces them. This matters because this panel
// rebuilds every render frame (60fps): if the evolve button were recreated
// via innerHTML each frame, a real mouse click's mousedown and mouseup could
// land on two different DOM node *instances* (old vs freshly-rebuilt), and
// browsers silently swallow the click event when that happens (drag-cancel
// heuristic) — that was the root cause of the "Evoluir" button appearing to
// do nothing.
function buildHudDom(container) {
  container.innerHTML = `
    <div class="trainer-row">
      <span class="trainer-name"></span><span class="trainer-level"></span>
      <div class="bar-track trainer-bar-track"><div class="bar-fill trainer-exp"></div></div>
    </div>
    <div class="hud-row">
      <div class="hud-poke">
        <span class="hud-poke-icon-slot"></span>
        <div>
          <div class="hud-poke-title">
            <span class="shiny-tag hud-shiny-tag"></span><span class="rarity-tag hud-rarity-tag"></span><span class="hud-poke-name"></span><span class="hud-poke-level"></span><button class="evolve-tag">Evoluir</button><span class="hud-fainted"> - Desmaiado!</span>
          </div>
          <div class="bar-track"><div class="bar-fill hp"></div></div>
          <div class="bar-track"><div class="bar-fill exp"></div></div>
        </div>
      </div>
      <div class="wallet">
        <span class="gold"></span>
        <span class="diamond"></span>
      </div>
    </div>
  `;
  // Reads container._gameState at click time (kept fresh by renderHud every
  // frame, see below) rather than closing over the poke from build time —
  // this DOM node is only ever built once, but the active POKE can change.
  container.querySelector('.hud-poke').style.cursor = 'pointer';
  container.querySelector('.hud-poke').addEventListener('click', (e) => {
    if (e.target.closest('.evolve-tag')) return; // let UIManager's delegated handler evolve instead
    const poke = container._gameState && container._gameState.activePoke;
    if (!poke) return;
    showPokeProfileModal(poke, SPECIES[poke.speciesId]);
  });

  container._els = {
    trainerName: container.querySelector('.trainer-name'),
    trainerLevel: container.querySelector('.trainer-level'),
    trainerExpFill: container.querySelector('.trainer-exp'),
    iconSlot: container.querySelector('.hud-poke-icon-slot'),
    shinyTag: container.querySelector('.hud-shiny-tag'),
    rarityTag: container.querySelector('.hud-rarity-tag'),
    nameEl: container.querySelector('.hud-poke-name'),
    levelEl: container.querySelector('.hud-poke-level'),
    evolveBtn: container.querySelector('.evolve-tag'),
    faintedEl: container.querySelector('.hud-fainted'),
    hpFill: container.querySelector('.bar-fill.hp'),
    expFill: container.querySelector('.bar-fill.exp'),
    goldEl: container.querySelector('.gold'),
    diamondEl: container.querySelector('.diamond'),
  };
}

export function renderHud(container, { gameState, world, controller }) {
  container._gameState = gameState; // read by the click-to-open-profile listener set up in buildHudDom
  const poke = gameState.activePoke;
  if (!poke) {
    if (container._built !== 'empty') {
      container.innerHTML = '<div class="hud-poke">Nenhum POKE ainda</div>';
      container._built = 'empty';
    }
    return;
  }
  if (container._built !== 'full') {
    buildHudDom(container);
    container._built = 'full';
  }
  const els = container._els;
  const species = SPECIES[poke.speciesId];
  const hpPct = Math.max(0, poke.hp / poke.stats.hp);
  const progress = expProgressForInstance(poke, species);
  const expPct = Math.max(0, Math.min(1, progress.into / progress.needed));
  const fainted = !!(world && world.player && world.player.fainted);
  const url = spriteUrl(poke.speciesId, poke.isShiny);

  const trainer = gameState.trainer;
  const trainerProgress = trainerExpProgress(trainer);
  const trainerExpPct = Math.max(0, Math.min(1, trainerProgress.into / trainerProgress.needed));
  els.trainerName.textContent = trainer.name;
  els.trainerLevel.textContent = ` Lv${trainer.level}`;
  els.trainerExpFill.style.width = `${trainerExpPct * 100}%`;

  const rarity = rarityOf(poke);
  if (els.iconSlot.dataset.uid !== poke.uid || els.iconSlot.dataset.shiny !== String(poke.isShiny) || els.iconSlot.dataset.rarity !== rarity.key) {
    const borderStyle = `border-color:${rarity.color}`;
    const iconInner = url
      ? `<img class="poke-icon poke-icon-sprite" style="${borderStyle}" src="${url}" alt="${species.name}">`
      : `<div class="poke-icon" style="background:${species.color};${borderStyle}"></div>`;
    els.iconSlot.innerHTML = poke.isShiny ? `<span class="swatch-wrap">${iconInner}<span class="shiny-badge">✨</span></span>` : iconInner;
    els.iconSlot.dataset.uid = poke.uid;
    els.iconSlot.dataset.shiny = String(poke.isShiny);
    els.iconSlot.dataset.rarity = rarity.key;
  }

  els.shinyTag.textContent = poke.isShiny ? '✨' : '';
  els.rarityTag.textContent = rarity.label;
  els.rarityTag.style.color = rarity.color;
  els.rarityTag.style.borderColor = rarity.color;
  els.nameEl.textContent = species.name;
  els.nameEl.className = `hud-poke-name${poke.isShiny ? ' shiny-name' : ''}`;
  els.levelEl.textContent = ` Lv${poke.level}`;
  els.faintedEl.style.display = fainted ? '' : 'none';

  const eligible = canEvolve(poke, species);
  els.evolveBtn.style.display = eligible ? '' : 'none';
  els.evolveBtn.dataset.uid = poke.uid;

  els.hpFill.style.width = `${hpPct * 100}%`;
  els.hpFill.classList.toggle('low', hpPct < 0.3);
  els.expFill.style.width = `${expPct * 100}%`;

  els.goldEl.textContent = gameState.wallet.gold;
  els.diamondEl.textContent = `Diamantes: ${gameState.wallet.diamonds}`;
}
