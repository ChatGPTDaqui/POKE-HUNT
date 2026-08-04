import { ITEMS } from '../../data/items.js';
import { SPECIES, averageIvPercent } from '../../data/pokes.js';
import { itemIconUrl } from '../../data/sprites.js';
import { showPokeProfileModal } from './PokeProfileModal.js';
import { swatchHtml, pokeNameTagHtml } from './swatchHtml.js';
import { rarityRank } from '../../data/rarity.js';

// Persists only for the lifetime of the page; fine since a single Bag
// screen instance is ever open at a time.
let activeTab = 'pokemons';
let bagSortKey = 'rarity'; // 'rarity' | 'iv' | 'level'
let bagSortDesc = true;
let bagSearchTerm = '';
let bagShinyOnly = false;

const SORT_LABELS = { rarity: 'Raridade', iv: 'IV', level: 'Nivel' };

function sortValue(poke, key) {
  if (key === 'rarity') return rarityRank(poke.rarity);
  if (key === 'iv') return averageIvPercent(poke.ivs);
  return poke.level;
}

export function renderBagMenu(container, { gameState, controller, world, refresh }) {
  const fainted = Boolean(world && world.player && world.player.fainted);

  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>Mochila</h2>
      <div class="row tabs" id="bag-tabs">
        <button data-tab="pokemons">Pokemons</button>
        <button data-tab="itens">Itens</button>
      </div>
    </div>
    <div class="grid-list" id="bag-content"></div>
  `;

  container.querySelectorAll('#bag-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      refresh();
    });
  });

  const content = container.querySelector('#bag-content');
  if (activeTab === 'pokemons') renderPokemonsTab(content, gameState, controller, refresh);
  else renderItensTab(content, gameState, controller, fainted, refresh);
}

function renderPokemonsTab(content, gameState, controller, refresh) {
  if (gameState.bagPokes.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Nenhum POKE na mochila.';
    content.appendChild(hint);
    return;
  }

  const searchRow = document.createElement('div');
  searchRow.className = 'row';
  searchRow.innerHTML = `
    <input type="text" id="bag-search" placeholder="Buscar POKE por nome..." value="${bagSearchTerm}" style="flex:1">
  `;
  content.appendChild(searchRow);
  const searchInput = searchRow.querySelector('#bag-search');

  const sortRow = document.createElement('div');
  sortRow.className = 'row';
  sortRow.innerHTML = `
    <label>Ordenar por
      <select id="bag-sort-key">
        ${Object.entries(SORT_LABELS).map(([key, label]) => `<option value="${key}" ${key === bagSortKey ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    <button id="bag-sort-dir">${bagSortDesc ? '↓' : '↑'}</button>
  `;
  content.appendChild(sortRow);
  sortRow.querySelector('#bag-sort-key').addEventListener('change', (e) => {
    bagSortKey = e.target.value;
    refresh();
  });
  sortRow.querySelector('#bag-sort-dir').addEventListener('click', () => {
    bagSortDesc = !bagSortDesc;
    refresh();
  });

  const shinyFilterRow = document.createElement('div');
  shinyFilterRow.className = 'row';
  shinyFilterRow.innerHTML = `
    <label><input type="checkbox" id="bag-shiny-only" ${bagShinyOnly ? 'checked' : ''}> Somente Shiny ✨</label>
  `;
  content.appendChild(shinyFilterRow);
  shinyFilterRow.querySelector('#bag-shiny-only').addEventListener('change', (e) => {
    bagShinyOnly = e.target.checked;
    applyBagSearch();
  });

  const sorted = [...gameState.bagPokes].sort((a, b) => {
    const diff = sortValue(a, bagSortKey) - sortValue(b, bagSortKey);
    return bagSortDesc ? -diff : diff;
  });

  const cardList = document.createElement('div');
  cardList.className = 'grid-list';
  content.appendChild(cardList);

  // Filters cards in place (toggling display, not rebuilding the DOM) so
  // typing in the search box never steals focus back out of the input —
  // same trick as HuntMenu.js's applySearch.
  function applyBagSearch() {
    const term = bagSearchTerm.trim().toLowerCase();
    let anyVisible = false;
    for (const card of cardList.querySelectorAll('.card')) {
      const matches = (!term || card.dataset.speciesName.includes(term))
        && (!bagShinyOnly || card.dataset.shiny === 'true');
      card.style.display = matches ? '' : 'none';
      if (matches) anyVisible = true;
    }
    emptyHint.style.display = anyVisible ? 'none' : '';
  }
  searchInput.addEventListener('input', () => {
    bagSearchTerm = searchInput.value;
    applyBagSearch();
  });

  const emptyHint = document.createElement('div');
  emptyHint.className = 'hint';
  emptyHint.textContent = 'Nenhum POKE encontrado.';
  emptyHint.style.display = 'none';
  content.appendChild(emptyHint);

  for (const poke of sorted) {
    const species = SPECIES[poke.speciesId];
    if (!species || !poke.ivs) {
      console.warn('BagMenu: pulando POKE com dados invalidos', poke);
      continue;
    }
    const canMove = gameState.team.length < 6;

    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.dataset.speciesName = species.name.toLowerCase();
    card.dataset.shiny = String(Boolean(poke.isShiny));
    card.innerHTML = `
      ${swatchHtml(species, { isShiny: poke.isShiny, poke })}
      <div class="card-info">
        <div class="card-title">${pokeNameTagHtml(poke, species)} Lv${poke.level}</div>
        <div class="card-sub">HP ${Math.floor(poke.hp)}/${poke.stats.hp}</div>
      </div>
      <button class="lock-btn" title="${poke.locked ? 'Destrancar' : 'Trancar'}">${poke.locked ? '🔒' : '🔓'}</button>
      ${canMove ? '<button class="move-btn">Mover p/ equipe</button>' : '<span class="hint">Equipe cheia</span>'}
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.move-btn') || e.target.closest('.lock-btn')) return;
      showPokeProfileModal(poke, species);
    });

    card.querySelector('.lock-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      poke.locked = !poke.locked;
      controller.save();
      refresh();
    });

    const moveBtn = card.querySelector('.move-btn');
    if (moveBtn) {
      moveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = gameState.bagPokes.findIndex((p) => p.uid === poke.uid);
        if (idx !== -1) {
          const [moved] = gameState.bagPokes.splice(idx, 1);
          gameState.team.push(moved);
          controller.save();
          refresh();
        }
      });
    }

    cardList.appendChild(card);
  }

  applyBagSearch();
}

function renderItensTab(content, gameState, controller, fainted, refresh) {
  const ids = Object.keys(gameState.items).filter((id) => gameState.items[id] > 0 && ITEMS[id]);
  if (ids.length === 0) {
    content.innerHTML = '<div class="hint">Nenhum item.</div>';
    return;
  }
  for (const itemId of ids) {
    const item = ITEMS[itemId];
    const locked = gameState.isItemLocked(itemId);
    const canUse = gameState.hasStarter && (
      item.kind === 'revive' ? fainted : item.kind === 'potion' ? !fainted : false
    );
    const iconUrl = itemIconUrl(itemId);
    const icon = iconUrl ? `<img class="item-icon" src="${iconUrl}" alt="${item.name}" title="${item.description}">` : '';
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${icon}
      <div class="card-info">
        <div class="card-title">${item.name} x${gameState.items[itemId]}</div>
        <div class="card-sub">${item.description}</div>
      </div>
      <button class="lock-btn" title="${locked ? 'Destrancar' : 'Trancar'}">${locked ? '🔒' : '🔓'}</button>
      ${canUse ? '<button class="use-btn">Usar</button>' : ''}
    `;
    card.querySelector('.lock-btn').addEventListener('click', () => {
      gameState.toggleItemLock(itemId);
      controller.save();
      refresh();
    });
    const useBtn = card.querySelector('.use-btn');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        controller.useItem(itemId);
        refresh();
      });
    }
    content.appendChild(card);
  }
}
