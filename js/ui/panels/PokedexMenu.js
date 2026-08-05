// Pokedex: every species registered in the game data (js/data/pokes.js),
// independent of whether the player has ever owned/caught one — base stats,
// full learnset, which hunts it spawns in, and a per-species kill counter
// (js/systems/PokedexSystem.js) with a toggle for the shiny-only count.
import { SPECIES } from '../../data/pokes.js';
import { getAbility } from '../../data/abilities.js';
import { colorForType, TYPE_COLORS } from '../../data/typeColors.js';
import { getEffectiveness } from '../../data/typeChart.generated.js';
import { MAPS } from '../../data/maps.js';
import { getEncounter } from '../../data/enemies.js';
import { pokedexKillCount } from '../../systems/PokedexSystem.js';
import { focusHunt } from './HuntMenu.js';
import { swatchHtml } from './swatchHtml.js';

let searchTerm = '';
let expandedSpeciesId = null;
let shinyView = false;

const ALL_TYPES = Object.keys(TYPE_COLORS);

function typeChip(type) {
  return `<span class="type-chip" style="background:${colorForType(type)}">${type.slice(0, 3)}</span>`;
}

// Every attacking type's real multiplier against this species (both its own
// types combined via getEffectiveness's dual-type multiply — same function
// CombatSystem.js uses for real damage, so this always matches what actually
// happens in a fight), bucketed by the resulting multiplier. `weak4x` is
// called out separately (explicit user request: flag when a species has
// TWO types that are each weak to the same attacking type, stacking into a
// real 4x hit) rather than folded into the regular 2x weakness list.
function typeMatchups(species) {
  const weak4x = [];
  const weak2x = [];
  const resist2x = [];
  const resist4x = [];
  const immune = [];
  for (const atkType of ALL_TYPES) {
    const m = getEffectiveness(atkType, species.type, species.type2);
    if (m === 4) weak4x.push(atkType);
    else if (m === 2) weak2x.push(atkType);
    else if (m === 0.5) resist2x.push(atkType);
    else if (m === 0.25) resist4x.push(atkType);
    else if (m === 0) immune.push(atkType);
  }
  return { weak4x, weak2x, resist2x, resist4x, immune };
}

function typeChipRow(types) {
  return types.length > 0
    ? `<div class="row" style="flex-wrap:wrap;gap:4px">${types.map(typeChip).join('')}</div>`
    : '<span class="card-sub">Nenhum</span>';
}

function weaknessSectionHtml(species) {
  const { weak4x, weak2x, resist2x, resist4x, immune } = typeMatchups(species);
  const doubleWeakBlock = weak4x.length > 0 ? `
    <div class="card-sub" style="color:#ff5252;font-weight:600">⚠ Fraqueza dupla (4x de dano):</div>
    ${typeChipRow(weak4x)}
  ` : '';
  return `
    ${doubleWeakBlock}
    <div class="card-sub">Fraco contra (2x de dano):</div>
    ${typeChipRow(weak2x)}
    <div class="card-sub" style="margin-top:6px">Resiste (0.5x de dano):</div>
    ${typeChipRow(resist2x)}
    ${resist4x.length > 0 ? `
      <div class="card-sub" style="margin-top:6px">Resiste em dobro (0.25x de dano):</div>
      ${typeChipRow(resist4x)}
    ` : ''}
    <div class="card-sub" style="margin-top:6px">Imune a:</div>
    ${typeChipRow(immune)}
  `;
}

// Every species' `description` field is spreadsheet text like "Pokedex
// Nº4 - tipo FIRE." — the generated data has no separate numeric dex field,
// so this is the one place that number lives. Used purely for a stable,
// familiar sort order; species missing the pattern (shouldn't happen, see
// scripts/sync-planilha.js) sort last instead of throwing.
function dexNumber(species) {
  const match = /N[ºo]\s*(\d+)/.exec(species.description || '');
  return match ? parseInt(match[1], 10) : 99999;
}

// Every hunt (Johto/Kanto/BOSS) whose enemyPool can spawn this species —
// excludes the Modo Pesadelo mirrors (id prefix `nightmare_`, see
// data/nightmareMaps.js#buildNightmareMirror) since those are just the same
// hunts at +100/150 levels, not a distinct location; BOSS hunts (`boss_*`,
// same continent:'nightmare' bucket) stay in since they're a legendary's
// *only* spawn location.
function huntsForSpecies(speciesId) {
  return Object.values(MAPS).filter((map) => {
    if (map.id.startsWith('nightmare_')) return false;
    return map.enemyPool.some((encId) => {
      const enc = getEncounter(encId);
      return enc && enc.speciesId === speciesId;
    });
  });
}

function baseStatGridHtml(species) {
  return `
    <div class="profile-stat-grid">
      <div class="mini-stat"><span>HP</span><b>${species.base.hp}</b></div>
      <div class="mini-stat"><span>Atk Fis</span><b>${species.base.atkFis}</b></div>
      <div class="mini-stat"><span>Atk Esp</span><b>${species.base.atkEsp}</b></div>
      <div class="mini-stat"><span>Defesa</span><b>${species.base.def}</b></div>
      <div class="mini-stat"><span>Def Esp</span><b>${species.base.defEsp}</b></div>
      <div class="mini-stat"><span>Velocidade</span><b>${species.base.speed}</b></div>
    </div>
  `;
}

function movesetTableHtml(species) {
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter(({ ability }) => ability)
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq);

  return `
    <div class="moveset-table">
      <div class="moveset-row moveset-header">
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
      </div>
      ${rows.map(({ entry, ability }) => {
        // No specific poke instance in the Pokedex (species-only view) —
        // approximate the dynamic level-50 AoE move's category off the
        // species' own BASE stats instead of a real instance's (see
        // resolveAbilityCategory in data/abilities.js for the real, per-poke
        // version used everywhere a live instance exists).
        const category = ability.category === 'dynamic'
          ? (species.base.atkFis >= species.base.atkEsp ? 'physical' : 'special')
          : ability.category;
        return `
        <div class="moveset-row">
          <span>${entry.levelReq}</span>
          <span>${ability.name}</span>
          <span>${typeChip(ability.type)}</span>
          <span>${category === 'physical' ? 'Fisico' : 'Especial'}</span>
          <span>${ability.power > 0 ? ability.power : '—'}</span>
          <span>${ability.target === 'aoe' ? '✓' : '—'}</span>
        </div>
      `;
      }).join('')}
    </div>
  `;
}

function buildSpeciesDetail(species, gameState, controller) {
  const hunts = huntsForSpecies(species.id);
  const detail = document.createElement('div');
  detail.className = 'card hunt-detail pokedex-detail';
  detail.dataset.speciesId = species.id;
  detail.dataset.speciesName = species.name.toLowerCase();
  detail.innerHTML = `
    <div class="card-info">
      <div class="card-title">Status base</div>
      ${baseStatGridHtml(species)}
      <div class="card-title">Fraquezas e resistencias</div>
      ${weaknessSectionHtml(species)}
      <div class="card-title">Golpes aprendidos</div>
      ${movesetTableHtml(species)}
      <div class="card-title">Onde encontrar</div>
      <div class="pokedex-hunt-links"></div>
    </div>
  `;
  const linksEl = detail.querySelector('.pokedex-hunt-links');
  if (hunts.length === 0) {
    linksEl.innerHTML = '<span class="card-sub">Nenhuma hunt conhecida ainda.</span>';
  } else {
    for (const map of hunts) {
      const btn = document.createElement('button');
      btn.textContent = `${map.name} (Lv ${map.levelRange[0]}-${map.levelRange[1]})`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        focusHunt(map);
        controller.openScreen('hunt');
      });
      linksEl.appendChild(btn);
    }
  }
  return detail;
}

export function renderPokedexMenu(container, { gameState, controller, refresh }) {
  const allSpecies = Object.values(SPECIES).sort((a, b) => dexNumber(a) - dexNumber(b));

  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>Pokedex</h2>
      <div class="row">
        <input type="text" id="pokedex-search" placeholder="Buscar Pokemon..." value="${searchTerm}" style="flex:1">
        <button id="pokedex-shiny-toggle" class="${shinyView ? 'active' : ''}">✨ ${shinyView ? 'Abates Shiny' : 'Abates Totais'}</button>
      </div>
    </div>
    <div class="grid-list" id="pokedex-list"></div>
    <div class="hint" id="pokedex-no-results" style="display:none">Nenhum Pokemon encontrado.</div>
  `;

  const list = container.querySelector('#pokedex-list');
  const searchInput = container.querySelector('#pokedex-search');
  const shinyToggleBtn = container.querySelector('#pokedex-shiny-toggle');
  const noResultsHint = container.querySelector('#pokedex-no-results');

  for (const species of allSpecies) {
    const kills = pokedexKillCount(gameState, species.id, shinyView);

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.speciesId = species.id;
    card.dataset.speciesName = species.name.toLowerCase();
    card.style.cursor = 'pointer';
    card.innerHTML = `
      ${swatchHtml(species)}
      <div class="card-info">
        <div class="card-title">#${dexNumber(species)} ${species.name} ${typeChip(species.type)}${species.type2 ? typeChip(species.type2) : ''}</div>
        <div class="card-sub">${shinyView ? '✨ Abates shiny' : 'Abates'}: ${kills}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      expandedSpeciesId = expandedSpeciesId === species.id ? null : species.id;
      refresh();
    });

    list.appendChild(card);
    if (expandedSpeciesId === species.id) {
      list.appendChild(buildSpeciesDetail(species, gameState, controller));
    }
  }

  // Filters the already-built DOM in place (display:none, no refresh()) so
  // typing doesn't tear down and rebuild the search input on every keystroke
  // — same reasoning/pattern as HuntMenu.js#applySearch.
  function applySearch() {
    const term = searchTerm.trim().toLowerCase();
    let anyMatch = false;
    for (const card of list.querySelectorAll('.card')) {
      const matches = !term || (card.dataset.speciesName || '').includes(term);
      card.style.display = matches ? '' : 'none';
      if (matches) anyMatch = true;
    }
    noResultsHint.style.display = (term && !anyMatch) ? '' : 'none';
  }

  searchInput.addEventListener('input', () => {
    searchTerm = searchInput.value;
    applySearch();
  });

  shinyToggleBtn.addEventListener('click', () => {
    shinyView = !shinyView;
    refresh();
  });

  applySearch();
}
