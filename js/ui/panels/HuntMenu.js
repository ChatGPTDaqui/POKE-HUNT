import { MAPS } from '../../data/maps.js';
import { unlockMap } from '../../systems/EconomySystem.js';
import { getEncounter } from '../../data/enemies.js';
import { SPECIES } from '../../data/pokes.js';
import { colorForType, TYPE_COLORS } from '../../data/typeColors.js';
import { faceIconUrl } from '../../data/sprites.js';

let searchTerm = '';
let expandedMapId = null;
let selectedContinent = 'johto';
let selectedType = 'all';

const CONTINENT_LABELS = { johto: 'Johto', kanto: 'Novo Continente (Kanto)', nightmare: 'Modo Pesadelo' };
const TYPE_LIST = Object.keys(TYPE_COLORS).sort();

function typeChipHtml(type) {
  return `<span class="type-chip" style="background:${colorForType(type)}">${type.slice(0, 3)}</span>`;
}

// Each encounter's weight comes from its real Gen2 catch rate (see
// scripts/sync-planilha.js#syncMapsAndEncounters + main.js#spawnEnemyAt,
// which spawns proportionally to it) — rarer species show up less often, and
// a type's "dominance" is the sum of the odds of every species carrying it.
function huntOdds(map) {
  const encounters = map.enemyPool.map(getEncounter).filter(Boolean);
  const totalWeight = encounters.reduce((sum, enc) => sum + enc.weight, 0);
  const species = encounters
    .map((enc) => ({ species: SPECIES[enc.speciesId], pct: (enc.weight / totalWeight) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const typeTotals = new Map();
  for (const { species: sp, pct: p } of species) {
    for (const type of [sp.type, sp.type2].filter(Boolean)) {
      typeTotals.set(type, (typeTotals.get(type) || 0) + p);
    }
  }
  const dominantTypes = [...typeTotals.entries()].sort((a, b) => b[1] - a[1]);

  return { species, dominantTypes };
}

function speciesRowHtml(sp, pct) {
  const url = faceIconUrl(sp.id);
  const icon = url
    ? `<img class="hunt-row-icon" src="${url}" alt="${sp.name}">`
    : `<div class="hunt-row-icon" style="background:${sp.color}"></div>`;
  return `
    <div class="hunt-tooltip-row">
      ${icon} ${typeChipHtml(sp.type)}${sp.type2 ? typeChipHtml(sp.type2) : ''} ${sp.name} — ${pct.toFixed(1)}%
    </div>
  `;
}

// Hunt card icon color: the elemental type that dominates the hunt's real
// spawn odds (same weighting huntOdds() already computes for the tooltip),
// via the existing colorForType() dictionary (js/data/typeColors.js already
// covers every real type in this dataset — no need for a second color map).
// Replaces the old flat theme color (map.bg.primary, only 3 distinct values
// across all hunts) with the exact biome color per hunt (explicit user
// request). Falls back to the theme color only for a hunt with no species at
// all (shouldn't happen post-World-Building-v2, but stays safe either way).
function huntSwatchColor(map) {
  const { dominantTypes } = huntOdds(map);
  return dominantTypes.length > 0 ? colorForType(dominantTypes[0][0]) : map.bg.primary;
}

function huntTooltipHtml(map) {
  const { species, dominantTypes } = huntOdds(map);
  const speciesRows = species.map(({ species: sp, pct }) => speciesRowHtml(sp, pct)).join('');
  const typeRows = dominantTypes.map(([type, pct]) => `
    <div class="hunt-tooltip-row">${typeChipHtml(type)} ${pct.toFixed(0)}%</div>
  `).join('');

  return `
    <span class="tooltip hunt-tooltip">
      <div class="hunt-tooltip-title">Pokemons na area</div>
      ${speciesRows}
      <div class="hunt-tooltip-title">Tipos dominantes</div>
      ${typeRows}
    </span>
  `;
}

// Click-to-expand detail panel (task: hunt detail with spawn % + face icon),
// same underlying odds as the hover tooltip above but as a persistent inline
// block — mirrors TeamMenu/BagMenu's click-to-expand card pattern.
function buildHuntDetail(map) {
  const { species } = huntOdds(map);
  const detail = document.createElement('div');
  detail.className = 'card hunt-detail';
  detail.dataset.mapId = map.id;
  detail.innerHTML = `
    <div class="card-info">
      <div class="card-title">Pokemons de ${map.name}</div>
      ${species.map(({ species: sp, pct }) => speciesRowHtml(sp, pct)).join('')}
    </div>
  `;
  return detail;
}

// Whether a hunt matches the search box — by its own name or by any species
// that can spawn in it.
function huntMatches(map, term) {
  if (!term) return false;
  if (map.name.toLowerCase().includes(term)) return true;
  return map.enemyPool.some((id) => {
    const enc = getEncounter(id);
    const species = enc && SPECIES[enc.speciesId];
    return species && species.name.toLowerCase().includes(term);
  });
}

// Whether any species spawnable in this hunt carries the given elemental
// type (primary or secondary).
function huntHasType(map, type) {
  if (type === 'all') return true;
  return map.enemyPool.some((id) => {
    const enc = getEncounter(id);
    const species = enc && SPECIES[enc.speciesId];
    return species && (species.type === type || species.type2 === type);
  });
}

// Called by PokedexMenu.js's "ir para a hunt" shortcut before switching to
// this screen — pre-fills the continent tab + search box so the target hunt
// is the one visible/highlighted/scrolled-to as soon as the panel renders
// (reuses the exact same search-match/scroll logic applySearch() already
// runs on every render, just seeded with the map's own name instead of
// whatever the player last typed).
export function focusHunt(map) {
  selectedContinent = map.continent || 'johto';
  searchTerm = map.name;
  selectedType = 'all';
}

export function renderHuntMenu(container, { gameState, controller, refresh }) {
  if (!gameState.hasStarter) {
    container.innerHTML = `<h2>Hunts</h2><div class="dialogue-box">Volte ao Hospital e escolha seu primeiro POKE antes de sair para caçar.</div>`;
    return;
  }
  if (gameState.activePoke.hp <= 0) {
    container.innerHTML = `<h2>Hunts</h2><div class="dialogue-box">Seu POKE esta desmaiado! Volte ao Hospital para cura-lo antes de sair para caçar.</div>`;
    return;
  }

  const continents = [...new Set(Object.values(MAPS).map((map) => map.continent || 'johto'))];

  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>Selecione um mapa</h2>
      ${continents.length > 1 ? `<div class="tabs continent-tabs" id="continent-tabs"></div>` : ''}
      <div class="row">
        <input type="text" id="hunt-search" placeholder="Buscar local ou POKE..." value="${searchTerm}" style="flex:1">
        <select id="hunt-type-filter">
          <option value="all" ${selectedType === 'all' ? 'selected' : ''}>Todos os elementos</option>
          ${TYPE_LIST.map((type) => `<option value="${type}" ${selectedType === type ? 'selected' : ''}>${type}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid-list" id="map-list"></div>
    <div class="hint" id="hunt-no-results" style="display:none">Nenhuma hunt encontrada (pode estar oculta pelo filtro de elemento).</div>
  `;
  const list = container.querySelector('#map-list');
  const noResultsHint = container.querySelector('#hunt-no-results');
  const searchInput = container.querySelector('#hunt-search');
  const typeFilterEl = container.querySelector('#hunt-type-filter');
  const tabsEl = container.querySelector('#continent-tabs');

  if (tabsEl) {
    for (const continent of continents) {
      const btn = document.createElement('button');
      btn.textContent = CONTINENT_LABELS[continent] || continent;
      btn.className = continent === selectedContinent ? 'active' : '';
      btn.addEventListener('click', () => {
        selectedContinent = continent;
        refresh();
      });
      tabsEl.appendChild(btn);
    }
  }

  for (const map of Object.values(MAPS).filter((m) => (m.continent || 'johto') === selectedContinent)) {
    const unlocked = gameState.isMapUnlocked(map.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.mapId = map.id;
    const costLabel = map.unlockCost
      ? `Custo: ${map.unlockCost.gold ? map.unlockCost.gold + ' ouro' : ''}${map.unlockCost.diamonds ? map.unlockCost.diamonds + ' diamantes' : ''}`
      : 'Gratis';

    card.style.cursor = 'pointer';
    card.style.display = huntHasType(map, selectedType) ? '' : 'none';
    card.innerHTML = `
      <div class="swatch" style="background:${huntSwatchColor(map)}"></div>
      <div class="card-info">
        <div class="card-title">
          ${map.name} (Lv ${map.levelRange[0]}-${map.levelRange[1]})
          <span class="info-icon" tabindex="0">?${huntTooltipHtml(map)}</span>
        </div>
        ${unlocked ? '' : `<div class="card-sub">${costLabel}</div>`}
      </div>
      <button>${unlocked ? 'Entrar' : 'Desbloquear'}</button>
    `;

    card.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      if (unlocked) {
        controller.enterMap(map.id);
      } else {
        const result = unlockMap(gameState, map);
        if (result.success) {
          controller.save();
          controller.enterMap(map.id);
        } else {
          controller.toast(`Recursos insuficientes para desbloquear ${map.name}.`, 'error', 'world');
          refresh();
        }
      }
    });

    // Clicking the card (name/body, not the info-icon's own hover tooltip or
    // the Entrar/Desbloquear button) toggles a persistent detail panel with
    // every species' spawn % and face icon — same data as the hover tooltip,
    // but reachable without hovering (touch-friendly).
    card.addEventListener('click', (e) => {
      if (e.target.closest('.info-icon') || e.target.closest('button')) return;
      const wasExpanded = expandedMapId === map.id;
      expandedMapId = wasExpanded ? null : map.id;
      refresh();
    });

    list.appendChild(card);
    if (expandedMapId === map.id) {
      list.appendChild(buildHuntDetail(map));
    }
  }

  function applySearch() {
    const term = searchTerm.trim().toLowerCase();
    let firstMatch = null;
    let anyMatch = false;
    for (const card of list.querySelectorAll('.card')) {
      // Cards hidden by the type filter shouldn't count as a match — matching
      // one would try to highlight/scroll to an element with no layout box,
      // silently doing nothing and making the search look broken.
      const visible = card.style.display !== 'none';
      const map = MAPS[card.dataset.mapId];
      const matches = visible && huntMatches(map, term);
      card.classList.toggle('hunt-match', matches);
      if (matches) {
        anyMatch = true;
        if (!firstMatch) firstMatch = card;
      }
    }
    if (firstMatch) firstMatch.scrollIntoView({ block: 'center', behavior: 'smooth' });
    noResultsHint.style.display = (term && !anyMatch) ? '' : 'none';
  }

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    applySearch();
  });
  typeFilterEl.addEventListener('change', () => {
    selectedType = typeFilterEl.value;
    refresh();
  });
  applySearch();
}
