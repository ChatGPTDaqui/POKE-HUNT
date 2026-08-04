import { ITEMS } from '../../data/items.js';
import { SPECIES } from '../../data/pokes.js';
import { getEncounter } from '../../data/enemies.js';
import { BEST_POTION_OPTION } from '../../systems/AutoSystem.js';

const MAX_AUTO_POT_RULES = 3;

function infoIcon(text) {
  return `<span class="info-icon">?<span class="tooltip">${text}</span></span>`;
}

function potionOptionsHtml(potionOptions, selectedId) {
  const bestOption = `<option value="${BEST_POTION_OPTION}" ${selectedId === BEST_POTION_OPTION ? 'selected' : ''}>Escolher melhor</option>`;
  const items = potionOptions.map((p) => `<option value="${p.id}" ${selectedId === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
  return bestOption + items;
}

function ballOptionsHtml(ballOptions, selectedId) {
  return ballOptions.map((b) => `<option value="${b.id}" ${selectedId === b.id ? 'selected' : ''}>${b.name}</option>`).join('');
}

// Species currently spawnable in the active hunt — same enemyPool -> encounter
// -> species lookup HuntMenu.js#huntOdds already uses. Deduped since the same
// species can back multiple encounter rows in one pool.
function currentHuntSpecies(world) {
  if (!world || !world.mapDef) return [];
  const seen = new Map();
  for (const encounterId of world.mapDef.enemyPool) {
    const enc = getEncounter(encounterId);
    const species = enc && SPECIES[enc.speciesId];
    if (species && !seen.has(species.id)) seen.set(species.id, species);
  }
  return [...seen.values()];
}

export function renderAutoPanel(container, { gameState, controller, world, refresh }) {
  const potionOptions = Object.values(ITEMS).filter((i) => i.kind === 'potion');
  const ballOptions = Object.values(ITEMS).filter((i) => i.kind === 'ball');
  const huntSpecies = currentHuntSpecies(world);

  container.innerHTML = `
    <h2>Automacoes</h2>

    <div class="toggle-row" id="row-pot">
      <div>
        <div>Auto-pot ${infoIcon('Cura automaticamente usando as regras abaixo. Cada regra define um limite de vida (%) e qual pocao usar quando o POKE cair abaixo desse limite. A primeira regra que corresponder (na ordem da lista) e usada.')}</div>
        <div class="hint">Usa pocoes seguindo as regras abaixo, na ordem listada.</div>
      </div>
      <div class="switch ${gameState.autoToggles.autoPot ? 'on' : ''}"><div class="knob"></div></div>
    </div>
    <div class="grid-list" id="autopot-rules"></div>
    <div class="row">
      <button id="add-rule" ${gameState.autoPotRules.length >= MAX_AUTO_POT_RULES ? 'disabled' : ''}>+ Adicionar regra</button>
    </div>

    <div class="toggle-row" id="row-catch">
      <div>
        <div>Auto-catch ${infoIcon('Lanca automaticamente a bola escolhida abaixo em todo inimigo derrotado, tentando captura-lo. Capturas sempre vao para a mochila.')}</div>
        <div class="hint">Lanca a bola selecionada automaticamente em todo inimigo derrotado.</div>
      </div>
      <div class="switch ${gameState.autoToggles.autoCatch ? 'on' : ''}"><div class="knob"></div></div>
    </div>
    <div class="card">
      <div class="card-info">
        <label class="row">Bola padrao:
          <select id="ball-select">
            ${ballOptions.map((b) => `<option value="${b.id}" ${gameState.autoCatchConfig.ballId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="toggle-row" id="row-shiny">
      <div>
        <div>Catch Shiny ${infoIcon('Quando ativado, usa uma bola diferente (escolhida abaixo) especificamente ao capturar POKES Shiny — uma variante rara e colorida.')}</div>
        <div class="hint">Usa uma bola diferente ao capturar POKES Shiny (raros).</div>
      </div>
      <div class="switch ${gameState.autoCatchConfig.catchShinyEnabled ? 'on' : ''}"><div class="knob"></div></div>
    </div>
    <div class="card">
      <div class="card-info">
        <label class="row">Bola para Shiny:
          <select id="shiny-ball-select" ${gameState.autoCatchConfig.catchShinyEnabled ? '' : 'disabled'}>
            ${ballOptions.map((b) => `<option value="${b.id}" ${gameState.autoCatchConfig.shinyBallId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>

    <div class="row">
      <strong>Regras por especie ${infoIcon('Define uma bola especifica pra uma especie da hunt atual. Tem prioridade sobre a bola padrao/shiny. Se a bola da regra acabar, o bot so mata aquela especie em vez de gastar outra bola nela.')}</strong>
    </div>
    ${huntSpecies.length === 0 ? '<div class="hint">Entre numa hunt pra configurar regras por especie.</div>' : ''}
    <div class="grid-list" id="autocatch-rules"></div>
    <div class="row">
      <button id="add-catch-rule" ${huntSpecies.length === 0 ? 'disabled' : ''}>+ Adicionar regra</button>
    </div>

    <div class="toggle-row" id="row-revive">
      <div>
        <div>Auto-revive ${infoIcon('Se o POKE em campo desmaiar, usa automaticamente um Revive da mochila para reanima-lo.')}</div>
        <div class="hint">Usa um Revive automaticamente se o POKE desmaiar.</div>
      </div>
      <div class="switch ${gameState.autoToggles.autoRevive ? 'on' : ''}"><div class="knob"></div></div>
    </div>
  `;

  const rulesList = container.querySelector('#autopot-rules');
  gameState.autoPotRules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="card-info">
        <div class="row">
          <span>Se vida &lt;=</span>
          <input type="number" min="1" max="99" value="${rule.hpPercent}" class="hp-input" />
          <span>%, usar</span>
          <select class="potion-select">
            ${potionOptionsHtml(potionOptions, rule.itemId)}
          </select>
        </div>
      </div>
      ${gameState.autoPotRules.length > 1 ? '<button>Remover</button>' : ''}
    `;

    row.querySelector('.hp-input').addEventListener('change', (e) => {
      rule.hpPercent = Math.max(1, Math.min(99, Number(e.target.value) || 1));
      controller.save();
    });
    row.querySelector('.potion-select').addEventListener('change', (e) => {
      rule.itemId = e.target.value;
      controller.save();
    });
    const removeBtn = row.querySelector('button');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        gameState.autoPotRules.splice(index, 1);
        controller.save();
        refresh();
      });
    }
    rulesList.appendChild(row);
  });

  const catchRulesList = container.querySelector('#autocatch-rules');
  gameState.autoCatchRules.forEach((rule, index) => {
    const speciesOptions = new Map(huntSpecies.map((s) => [s.id, s.name]));
    // A rule's species can outlive the hunt it was created in (the player
    // moved on) — keep it selectable/visible instead of silently vanishing
    // from its own dropdown.
    if (rule.speciesId && !speciesOptions.has(rule.speciesId)) {
      const staleSpecies = SPECIES[rule.speciesId];
      speciesOptions.set(rule.speciesId, staleSpecies ? `${staleSpecies.name} (fora da hunt atual)` : rule.speciesId);
    }

    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="card-info">
        <div class="row">
          <span>Especie</span>
          <select class="rule-species-select">
            ${[...speciesOptions.entries()].map(([id, name]) => `<option value="${id}" ${rule.speciesId === id ? 'selected' : ''}>${name}</option>`).join('')}
          </select>
          <span>bola</span>
          <select class="rule-ball-select">
            ${ballOptionsHtml(ballOptions, rule.ballItemId)}
          </select>
        </div>
      </div>
      <button>Remover</button>
    `;
    row.querySelector('.rule-species-select').addEventListener('change', (e) => {
      rule.speciesId = e.target.value;
      controller.save();
    });
    row.querySelector('.rule-ball-select').addEventListener('change', (e) => {
      rule.ballItemId = e.target.value;
      controller.save();
    });
    row.querySelector('button').addEventListener('click', () => {
      gameState.autoCatchRules.splice(index, 1);
      controller.save();
      refresh();
    });
    catchRulesList.appendChild(row);
  });

  const addCatchRuleBtn = container.querySelector('#add-catch-rule');
  if (addCatchRuleBtn) {
    addCatchRuleBtn.addEventListener('click', () => {
      if (huntSpecies.length === 0) return;
      const alreadyRuled = new Set(gameState.autoCatchRules.map((r) => r.speciesId));
      const firstFree = huntSpecies.find((s) => !alreadyRuled.has(s.id)) || huntSpecies[0];
      gameState.autoCatchRules.push({ speciesId: firstFree.id, ballItemId: gameState.autoCatchConfig.ballId });
      controller.save();
      refresh();
    });
  }

  container.querySelector('#add-rule').addEventListener('click', () => {
    if (gameState.autoPotRules.length < MAX_AUTO_POT_RULES) {
      gameState.autoPotRules.push({ hpPercent: 50, itemId: BEST_POTION_OPTION });
      controller.save();
      refresh();
    }
  });

  const bindToggle = (rowId, obj, key) => {
    container.querySelector(`#${rowId} .switch`).addEventListener('click', () => {
      obj[key] = !obj[key];
      controller.save();
      refresh();
    });
  };
  bindToggle('row-pot', gameState.autoToggles, 'autoPot');
  bindToggle('row-catch', gameState.autoToggles, 'autoCatch');
  bindToggle('row-revive', gameState.autoToggles, 'autoRevive');
  bindToggle('row-shiny', gameState.autoCatchConfig, 'catchShinyEnabled');

  container.querySelector('#ball-select').addEventListener('change', (e) => {
    gameState.autoCatchConfig.ballId = e.target.value;
    controller.save();
  });
  container.querySelector('#shiny-ball-select').addEventListener('change', (e) => {
    gameState.autoCatchConfig.shinyBallId = e.target.value;
    controller.save();
  });
}
