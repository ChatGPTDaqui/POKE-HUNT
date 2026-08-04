import { SHOP_STOCK, getItem } from '../../data/items.js';
import { buyItem, sellItem, sellAllItems, sellBagPoke, sellAllBagPokes, pokemonSellValue } from '../../systems/EconomySystem.js';
import { SPECIES, averageIvPercent } from '../../data/pokes.js';
import { itemIconUrl } from '../../data/sprites.js';
import { swatchHtml, pokeNameTagHtml } from './swatchHtml.js';
import { showConfirmModal } from './confirmModal.js';
import { showPokeProfileModal } from './PokeProfileModal.js';
import { RARITIES, rarityOf } from '../../data/rarity.js';

// Persists only for the lifetime of the page; fine since a single Shop
// screen instance is ever open at a time.
let activeTab = 'itens';
let ivMin = 0;
let ivMax = 100;
let sortDesc = true;
let sellSearchTerm = '';
let sellShinyOnly = false; // when on, the bulk-sell flow allows shinies (with a confirm) — see renderPokemonsTab
const buyQty = new Map(); // itemId -> chosen quantity, defaults to 1 below
const sellQty = new Map();
const selectedPokeUids = new Set(); // uids checked in the "venda pokemon" tab, see renderPokemonsTab
const selectedRarities = new Set(Object.keys(RARITIES)); // all rarities shown by default

function getQty(map, itemId) {
  return map.get(itemId) || 1;
}

// The item's own sprite when we have one, with the description as a hover
// tooltip; falls back to no icon (card just shows text) otherwise.
function itemIconHtml(item) {
  const url = itemIconUrl(item.id);
  return url ? `<img class="item-icon" src="${url}" alt="${item.name}" title="${item.description}">` : '';
}

export function renderShopMenu(container, { gameState, controller, refresh }) {
  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>Loja</h2>
      <div class="row"><strong>Ouro: ${gameState.wallet.gold} | Diamantes: ${gameState.wallet.diamonds}</strong></div>
      <div class="row tabs" id="shop-tabs">
        <button data-tab="itens">Itens</button>
        <button data-tab="pokemons">Pokemons</button>
      </div>
    </div>
    <div id="shop-content"></div>
  `;

  container.querySelectorAll('#shop-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      refresh();
    });
  });

  const content = container.querySelector('#shop-content');
  if (activeTab === 'itens') renderItensTab(content, gameState, controller, refresh);
  else renderPokemonsTab(content, gameState, controller, refresh);
}

function renderItensTab(content, gameState, controller, refresh) {
  content.innerHTML = `
    <div class="shop-columns">
      <div class="shop-column">
        <div class="hint">COMPRAR</div>
        <div class="grid-list" id="buy-list"></div>
      </div>
      <div class="shop-column">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div class="hint">VENDER ITENS</div>
          <button id="sell-all-items-btn">Vender Tudo</button>
        </div>
        <div class="grid-list" id="sell-list"></div>
      </div>
    </div>
  `;

  const buyList = content.querySelector('#buy-list');
  for (const stock of SHOP_STOCK) {
    const item = getItem(stock.itemId);
    // Slider/input top out at whatever the wallet can actually afford right now.
    const maxAffordable = Math.max(1, Math.floor(gameState.wallet.gold / item.buyPrice));
    const qty = Math.min(getQty(buyQty, item.id), maxAffordable);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${itemIconHtml(item)}
      <div class="card-info">
        <div class="card-title">${item.name} (voce tem: ${gameState.items[item.id] || 0})</div>
        <div class="card-sub">Preço: ${item.buyPrice} ouro</div>
      </div>
      <div class="qty-control">
        <input type="range" class="qty-slider" min="1" max="${maxAffordable}" value="${qty}">
        <input type="number" class="qty-input" min="1" max="${maxAffordable}" value="${qty}">
      </div>
      <button>Comprar (${item.buyPrice * qty} ouro)</button>
    `;
    const slider = card.querySelector('.qty-slider');
    const input = card.querySelector('.qty-input');
    const buyBtn = card.querySelector('button');
    slider.addEventListener('input', () => {
      input.value = slider.value; // live-sync the number box without a full re-render mid-drag
      buyBtn.textContent = `Comprar (${item.buyPrice * Number(slider.value)} ouro)`;
    });
    slider.addEventListener('change', () => {
      buyQty.set(item.id, Number(slider.value));
      refresh();
    });
    input.addEventListener('change', () => {
      const v = Math.max(1, Math.min(maxAffordable, Math.floor(Number(input.value) || 1)));
      buyQty.set(item.id, v);
      refresh();
    });
    buyBtn.addEventListener('click', () => {
      const res = buyItem(gameState, item.id, qty);
      if (res.success) {
        controller.save();
        controller.toast(`Comprou ${item.name} x${qty}.`, 'success', 'trade');
      } else {
        controller.toast('Ouro insuficiente.', 'error', 'trade');
      }
      refresh();
    });
    buyList.appendChild(card);
  }

  const sellList = content.querySelector('#sell-list');
  const ownedItemIds = Object.keys(gameState.items).filter((id) => gameState.items[id] > 0);
  if (ownedItemIds.length === 0) sellList.innerHTML = '<div class="hint">Nenhum item para vender.</div>';
  for (const itemId of ownedItemIds) {
    const item = getItem(itemId);
    const owned = gameState.items[itemId];
    const qty = Math.min(getQty(sellQty, itemId), owned);
    const locked = gameState.isItemLocked(itemId);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      ${itemIconHtml(item)}
      <div class="card-info">
        <div class="card-title">${item.name} x${owned}</div>
        <div class="card-sub">Valor de venda: ${item.sellPrice} ouro</div>
      </div>
      <button class="lock-btn" title="${locked ? 'Destrancar' : 'Trancar'}">${locked ? '🔒' : '🔓'}</button>
      ${locked ? '' : `
      <div class="qty-control">
        <input type="range" class="qty-slider" min="1" max="${owned}" value="${qty}">
        <input type="number" class="qty-input" min="1" max="${owned}" value="${qty}">
      </div>
      <button class="sell-qty-btn">Vender (${qty})</button>
      <button class="sell-all-one-btn">Vender Tudo</button>
      `}
    `;
    card.querySelector('.lock-btn').addEventListener('click', () => {
      gameState.toggleItemLock(itemId);
      controller.save();
      refresh();
    });
    if (locked) { sellList.appendChild(card); continue; }
    const slider = card.querySelector('.qty-slider');
    const input = card.querySelector('.qty-input');
    const sellQtyBtn = card.querySelector('.sell-qty-btn');
    slider.addEventListener('input', () => {
      input.value = slider.value; // live-sync the number box without a full re-render mid-drag
      sellQtyBtn.textContent = `Vender (${slider.value})`;
    });
    slider.addEventListener('change', () => {
      sellQty.set(itemId, Number(slider.value));
      refresh();
    });
    input.addEventListener('change', () => {
      const v = Math.max(1, Math.min(owned, Math.floor(Number(input.value) || 1)));
      sellQty.set(itemId, v);
      refresh();
    });
    sellQtyBtn.addEventListener('click', () => {
      sellItem(gameState, itemId, qty);
      controller.save();
      refresh();
    });
    card.querySelector('.sell-all-one-btn').addEventListener('click', () => {
      sellItem(gameState, itemId, owned);
      controller.save();
      controller.toast(`Vendeu ${item.name} x${owned}.`, 'success', 'trade');
      refresh();
    });
    sellList.appendChild(card);
  }

  content.querySelector('#sell-all-items-btn').addEventListener('click', () => {
    const res = sellAllItems(gameState);
    if (res.itemCount > 0) {
      controller.save();
      controller.toast(`Vendeu ${res.itemCount} itens por ${res.gold} ouro.`, 'success', 'trade');
    }
    refresh();
  });
}

function renderPokemonsTab(content, gameState, controller, refresh) {
  content.innerHTML = `
    <div class="hint">VENDER POKES EXTRAS (MOCHILA)</div>
    <div class="row">
      <input type="text" id="sell-search" placeholder="Buscar POKE por nome..." value="${sellSearchTerm}" style="flex:1">
    </div>
    <div class="row" id="iv-filter">
      <label>IV min% <input type="number" id="iv-min" min="0" max="100" value="${ivMin}"></label>
      <label>IV max% <input type="number" id="iv-max" min="0" max="100" value="${ivMax}"></label>
      <button id="iv-sort-btn">Ordenar por IV ${sortDesc ? '↓' : '↑'}</button>
    </div>
    <div class="row" id="rarity-filter">
      ${Object.values(RARITIES).map((r) => `
        <label style="color:${r.color}">
          <input type="checkbox" class="rarity-check" value="${r.key}" ${selectedRarities.has(r.key) ? 'checked' : ''}> ${r.label}
        </label>
      `).join('')}
      <label><input type="checkbox" id="sell-shiny-only" ${sellShinyOnly ? 'checked' : ''}> Somente Shiny ✨</label>
    </div>
    <div class="row" id="bulk-sell-row" style="justify-content: space-between; align-items: center;">
      <label><input type="checkbox" id="select-all-pokes"> Selecionar tudo</label>
      <div class="row">
        <button id="sell-selected-pokes-btn">Vender Selecionados</button>
        <button id="sell-all-pokes-btn">Vender Tudo</button>
      </div>
    </div>
    <div class="grid-list" id="sell-pokes-list"></div>
  `;

  const searchInput = content.querySelector('#sell-search');
  const minInput = content.querySelector('#iv-min');
  const maxInput = content.querySelector('#iv-max');
  const selectAllBox = content.querySelector('#select-all-pokes');
  const sellSelectedBtn = content.querySelector('#sell-selected-pokes-btn');
  const sellAllBtn = content.querySelector('#sell-all-pokes-btn');
  const pokeList = content.querySelector('#sell-pokes-list');

  function syncSellSelectedBtn() {
    sellSelectedBtn.disabled = selectedPokeUids.size === 0;
    sellSelectedBtn.textContent = selectedPokeUids.size > 0 ? `Vender Selecionados (${selectedPokeUids.size})` : 'Vender Selecionados';
  }

  // Re-renders just the list + bulk-sell handlers in place — the filter
  // inputs themselves are never touched, so typing/dragging keeps focus
  // instead of getting reset by a full-panel refresh() on every keystroke.
  function renderList() {
    const term = sellSearchTerm.trim().toLowerCase();
    const pokesWithIv = gameState.bagPokes.map((poke) => ({ poke, ivPct: averageIvPercent(poke.ivs) }));
    const filtered = pokesWithIv.filter(({ poke, ivPct }) => ivPct >= ivMin && ivPct <= ivMax
      && selectedRarities.has(rarityOf(poke).key)
      && (!sellShinyOnly || poke.isShiny)
      && (!term || SPECIES[poke.speciesId].name.toLowerCase().includes(term)));
    filtered.sort((a, b) => (sortDesc ? b.ivPct - a.ivPct : a.ivPct - b.ivPct));

    // Stale uids (sold/moved elsewhere since last render, or no longer
    // matching the current IV/rarity filter) shouldn't stick around in the set.
    const filteredUids = new Set(filtered.map(({ poke }) => poke.uid));
    for (const uid of selectedPokeUids) {
      if (!filteredUids.has(uid)) selectedPokeUids.delete(uid);
    }
    // Locked POKEs never enter bulk selection. Shinies only do when the
    // "Somente Shiny" filter is active (see sellSelectedBtn below, which
    // then requires an explicit confirm) — same safety rule as "Vender Tudo"
    // otherwise, which never touches shiny at all.
    const selectableFiltered = filtered.filter(({ poke }) => !poke.locked && (sellShinyOnly || !poke.isShiny));

    pokeList.innerHTML = '';
    if (gameState.bagPokes.length === 0) {
      pokeList.innerHTML = '<div class="hint">Nenhum POKE extra na mochila.</div>';
    } else if (filtered.length === 0) {
      pokeList.innerHTML = '<div class="hint">Nenhum POKE corresponde ao filtro de IV.</div>';
    }
    for (const { poke, ivPct } of filtered) {
      const species = SPECIES[poke.speciesId];
      const value = pokemonSellValue(poke.level, species.baseExp, poke.rarity);
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.innerHTML = `
        ${poke.locked || (poke.isShiny && !sellShinyOnly) ? '<span class="checkbox-spacer"></span>' : `<input type="checkbox" class="sell-select-box" ${selectedPokeUids.has(poke.uid) ? 'checked' : ''}>`}
        ${swatchHtml(species, { isShiny: poke.isShiny, poke })}
        <div class="card-info">
          <div class="card-title">${pokeNameTagHtml(poke, species)} Lv${poke.level}</div>
          <div class="card-sub">IV: ${ivPct.toFixed(0)}%</div>
        </div>
        <button ${poke.locked ? 'disabled title="Trancado - destranque na Mochila"' : ''}>${poke.locked ? '🔒 Trancado' : `Vender (${value} ouro)`}</button>
      `;
      const doSell = () => {
        selectedPokeUids.delete(poke.uid);
        sellBagPoke(gameState, poke.uid);
        controller.save();
        refresh();
      };
      card.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation();
        if (poke.locked) return;
        if (poke.isShiny) {
          showConfirmModal({
            title: 'Vender POKE Shiny?',
            message: `${species.name} eh Shiny! Essa acao nao pode ser desfeita. Vender mesmo assim por ${value} ouro?`,
            confirmLabel: 'Vender',
          }, doSell);
        } else {
          doSell();
        }
      });
      const checkbox = card.querySelector('.sell-select-box');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => e.stopPropagation());
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selectedPokeUids.add(poke.uid);
          else selectedPokeUids.delete(poke.uid);
          selectAllBox.checked = selectableFiltered.length > 0
            && selectableFiltered.every(({ poke: p }) => selectedPokeUids.has(p.uid));
          syncSellSelectedBtn();
        });
      }
      card.addEventListener('click', () => showPokeProfileModal(poke, species));
      pokeList.appendChild(card);
    }

    selectAllBox.checked = selectableFiltered.length > 0
      && selectableFiltered.every(({ poke }) => selectedPokeUids.has(poke.uid));
    selectAllBox.onchange = () => {
      if (selectAllBox.checked) selectableFiltered.forEach(({ poke }) => selectedPokeUids.add(poke.uid));
      else selectableFiltered.forEach(({ poke }) => selectedPokeUids.delete(poke.uid));
      renderList();
    };

    syncSellSelectedBtn();
    sellSelectedBtn.onclick = () => {
      const uids = [...selectedPokeUids];
      const doSellSelected = () => {
        const res = sellAllBagPokes(gameState, uids);
        selectedPokeUids.clear();
        if (res.pokeCount > 0) {
          controller.save();
          controller.toast(`Vendeu ${res.pokeCount} POKEs por ${res.gold} ouro.`, 'success', 'trade');
        }
        refresh();
      };
      // Selection only ever contains shinies while "Somente Shiny" is active
      // (see selectableFiltered above) — every uid here is shiny in that
      // case, so a straight count is enough, no per-uid lookup needed.
      if (sellShinyOnly && uids.length > 0) {
        showConfirmModal({
          title: 'Vender POKEs Shiny?',
          message: `Voce esta vendendo ${uids.length} POKE(s) Shiny! Essa acao nao pode ser desfeita. Confirmar venda?`,
          confirmLabel: 'Vender',
        }, doSellSelected);
      } else {
        doSellSelected();
      }
    };

    // Shinies and locked POKEs never go out via the bulk button — shinies
    // only leave through the individual per-card confirm above, locked ones
    // only after being unlocked in the Mochila.
    sellAllBtn.onclick = () => {
      const shinyCount = filtered.filter(({ poke }) => poke.isShiny).length;
      const lockedCount = filtered.filter(({ poke }) => poke.locked).length;
      const uids = filtered.filter(({ poke }) => !poke.isShiny && !poke.locked).map(({ poke }) => poke.uid);
      const res = sellAllBagPokes(gameState, uids);
      selectedPokeUids.clear();
      if (res.pokeCount > 0) {
        controller.save();
        controller.toast(`Vendeu ${res.pokeCount} POKEs por ${res.gold} ouro.`, 'success', 'trade');
      }
      if (shinyCount > 0) {
        controller.toast(`${shinyCount} POKE(s) Shiny nao foram vendidos automaticamente.`, 'info', 'trade');
      }
      if (lockedCount > 0) {
        controller.toast(`${lockedCount} POKE(s) trancado(s) nao foram vendidos.`, 'info', 'trade');
      }
      refresh();
    };
  }

  searchInput.addEventListener('input', () => {
    sellSearchTerm = searchInput.value;
    renderList();
  });
  minInput.addEventListener('input', () => {
    ivMin = Math.max(0, Math.min(100, Number(minInput.value) || 0));
    renderList();
  });
  maxInput.addEventListener('input', () => {
    ivMax = Math.max(0, Math.min(100, Number(maxInput.value) || 100));
    renderList();
  });
  content.querySelector('#iv-sort-btn').addEventListener('click', () => {
    sortDesc = !sortDesc;
    refresh();
  });
  content.querySelectorAll('.rarity-check').forEach((box) => {
    box.addEventListener('change', () => {
      if (box.checked) selectedRarities.add(box.value);
      else selectedRarities.delete(box.value);
      renderList();
    });
  });
  content.querySelector('#sell-shiny-only').addEventListener('change', (e) => {
    sellShinyOnly = e.target.checked;
    selectedPokeUids.clear(); // switching modes changes what's selectable — start clean
    renderList();
  });

  renderList();
}
