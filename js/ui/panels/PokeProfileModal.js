import { buildProfileHero, buildStatDetail, buildMovesetTable } from './PokeStatDetail.js';
import { makeDraggable } from '../draggable.js';

// The single, canonical "click a POKE to see its profile" experience —
// floats above everything (appended to <body>, same trick as confirmModal)
// so it works from anywhere a poke is shown: team/bag lists, the shop's
// sell tab, the Hospital screen, even the always-on in-game HUD. Two tabs:
// Status (compact stat grid) and Golpes (full learnset, not just what's
// currently unlocked — see buildMovesetTable). The animated hero sprite
// (buildProfileHero) is built ONCE outside the tab-switched body — only
// `.profile-body`'s innerHTML is replaced on tab clicks, so the GIF's
// animation never gets reset by a re-render.
export function showPokeProfileModal(poke, species) {
  let activeTab = 'status';

  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'confirm-modal poke-profile-modal panel';
  modal.innerHTML = `
    <button class="close-btn">X</button>
    <div class="profile-hero-slot"></div>
    <div class="row tabs profile-tabs">
      <button data-tab="status">Status</button>
      <button data-tab="golpes">Golpes</button>
    </div>
    <div class="profile-body"></div>
  `;
  overlay.appendChild(modal);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector('.close-btn').addEventListener('click', close);
  modal.querySelector('.profile-hero-slot').appendChild(buildProfileHero(poke, species));
  // Explicit user request: every window that opens can be dragged around —
  // the hero art strip (non-interactive) is the handle.
  makeDraggable(modal, modal.querySelector('.profile-hero-slot'));

  const tabButtons = modal.querySelectorAll('.profile-tabs button');
  const body = modal.querySelector('.profile-body');

  function renderBody() {
    tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === activeTab));
    body.innerHTML = '';
    body.appendChild(activeTab === 'status' ? buildStatDetail(poke, species) : buildMovesetTable(poke, species));
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderBody();
    });
  });

  document.body.appendChild(overlay);
  renderBody();
}
