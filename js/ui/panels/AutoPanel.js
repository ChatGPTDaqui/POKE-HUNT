import { ITEMS } from '../../data/items.js';
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

export function renderAutoPanel(container, { gameState, controller, refresh }) {
  const potionOptions = Object.values(ITEMS).filter((i) => i.kind === 'potion');
  const ballOptions = Object.values(ITEMS).filter((i) => i.kind === 'ball');

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
