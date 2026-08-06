// Report shown once on boot when the Farm Offline system (see
// js/systems/OfflineSimSystem.js + main.js's boot sequence) detects the save
// was closed for a meaningful stretch of real time. Same floating-overlay
// pattern as confirmModal.js/PokeProfileModal.js. Every line in the body is
// hidden when its value is 0 (explicit user request) instead of showing a
// wall of zeroes.
import { SPECIES } from '../../data/pokes.js';
import { ITEMS } from '../../data/items.js';
import { spriteUrl, itemIconUrl } from '../../data/sprites.js';
import { pokemonSellValue } from '../../systems/EconomySystem.js';
import { makeDraggable } from '../draggable.js';
import { pokeNameTagHtml } from './swatchHtml.js';

const MAX_CAPTURES_SHOWN = 40;

function formatDuration(totalSeconds) {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}min`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function statRow(label, value) {
  return `<div class="row stat-row"><span>${label}</span><span>${value}</span></div>`;
}

function itemListHtml(itemsMap) {
  return Object.entries(itemsMap)
    .filter(([, qty]) => qty > 0)
    .map(([itemId, qty]) => {
      const item = ITEMS[itemId];
      const name = item ? item.name : itemId;
      const url = itemIconUrl(itemId);
      const icon = url ? `<img class="item-icon" src="${url}" alt="${name}">` : '';
      return `<div class="row offline-item-row">${icon}<span>${name} x${qty}</span></div>`;
    })
    .join('');
}

function estimatedValueGained(summary) {
  const itemsValue = Object.entries(summary.itemsGained)
    .reduce((sum, [id, qty]) => sum + (ITEMS[id]?.sellPrice || 0) * qty, 0);
  const pokeValue = summary.captures.reduce((sum, c) => {
    const species = SPECIES[c.speciesId];
    return species ? sum + pokemonSellValue(c.level, species.baseExp, c.rarity) : sum;
  }, 0);
  return summary.gold + itemsValue + pokeValue;
}

function estimatedValueSpent(summary) {
  return Object.entries(summary.itemsConsumed)
    .reduce((sum, [id, qty]) => sum + (ITEMS[id]?.buyPrice || 0) * qty, 0);
}

function capturesHtml(captures) {
  if (captures.length === 0) return '';
  const shown = captures.slice(0, MAX_CAPTURES_SHOWN).map((c) => {
    const species = SPECIES[c.speciesId];
    if (!species) return '';
    const url = spriteUrl(c.speciesId, c.isShiny);
    return `
      <div class="card offline-capture-card">
        ${url ? `<img class="card-sprite" src="${url}" alt="${species.name}">` : ''}
        <div class="card-info"><div class="card-title">${pokeNameTagHtml(c, species)} Lv${c.level}</div></div>
      </div>
    `;
  }).join('');
  const overflow = captures.length > MAX_CAPTURES_SHOWN
    ? `<div class="hint">+${captures.length - MAX_CAPTURES_SHOWN} outro(s)...</div>`
    : '';
  return `<div class="hint">CAPTURAS</div><div class="grid-list offline-captures-list">${shown}${overflow}</div>`;
}

function buildBody(summary) {
  if (summary.kills === 0) {
    return '<div class="card-sub">Nada aconteceu enquanto voce esteve fora.</div>';
  }

  const rows = [];
  if (summary.gold > 0) rows.push(statRow('Ouro ganho', `+${summary.gold}`));
  if (summary.xp > 0) rows.push(statRow('EXP ganho', `+${summary.xp}`));
  if (summary.pokeLeveledUp) rows.push(statRow('POKE ativo', 'Subiu de nivel!'));
  if (summary.trainerLeveledUp) rows.push(statRow('Treinador', 'Subiu de nivel!'));
  if (summary.captures.length > 0) rows.push(statRow('POKEs capturados', summary.captures.length));
  if (summary.shinySeen > 0) rows.push(statRow('Shinys avistados', summary.shinySeen));
  if (summary.shinyCaptured > 0) rows.push(statRow('Shinys capturados', summary.shinyCaptured));

  const gainedHtml = itemListHtml(summary.itemsGained);
  const consumedHtml = itemListHtml(summary.itemsConsumed);
  const totalConsumed = Object.values(summary.itemsConsumed).reduce((a, b) => a + b, 0);

  const gainedValue = estimatedValueGained(summary);
  const spentValue = estimatedValueSpent(summary);
  const balance = gainedValue - spentValue;
  const balanceColor = balance >= 0 ? 'var(--color-success)' : 'var(--color-danger)';

  return `
    <div class="offline-farm-rows">${rows.join('')}</div>
    ${capturesHtml(summary.captures)}
    ${gainedHtml ? `<div class="hint">ITENS OBTIDOS</div><div class="offline-item-list">${gainedHtml}</div>` : ''}
    ${consumedHtml ? `<div class="hint">CONSUMIVEIS GASTOS (${totalConsumed})</div><div class="offline-item-list">${consumedHtml}</div>` : ''}
    ${(gainedValue > 0 || spentValue > 0) ? `
      <div class="hint">BALANCO ESTIMADO</div>
      ${gainedValue > 0 ? statRow('Ganho (ouro + itens + POKEs)', `+${Math.round(gainedValue)}`) : ''}
      ${spentValue > 0 ? statRow('Gasto (consumiveis)', `-${Math.round(spentValue)}`) : ''}
      <div class="row stat-row"><span>Saldo</span><span style="color:${balanceColor}">${balance >= 0 ? '+' : ''}${Math.round(balance)}</span></div>
    ` : ''}
  `;
}

export function showOfflineFarmModal(summary) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';

  const capNote = !summary.stoppedEarly && !summary.truncated && summary.requestedSeconds > summary.simulatedSeconds + 1
    ? `<div class="hint">Limitado a ${formatDuration(summary.simulatedSeconds)} de simulacao (o resto do tempo fora nao gerou progresso).</div>`
    : '';
  const stoppedNote = summary.stoppedEarly
    ? '<div class="hint">Seu POKE desmaiou e ficou sem Revive para reanimar automaticamente — a farm parou antes do tempo acabar.</div>'
    : '';
  // The simulation has a wall-clock budget so a slow device can't be frozen
  // (or have the page killed) replaying hours of combat — when that budget
  // runs out the report says so instead of quietly reporting less progress
  // than the time away would suggest.
  const truncatedNote = summary.truncated
    ? '<div class="hint">A simulacao foi interrompida para nao travar o dispositivo — parte do tempo fora nao foi processada.</div>'
    : '';

  overlay.innerHTML = `
    <div class="confirm-modal panel offline-farm-modal">
      <div class="confirm-modal-title">Bem-vindo de volta!</div>
      <div class="card-sub">Voce ficou fora por ${formatDuration(summary.requestedSeconds)}.</div>
      ${capNote}
      ${stoppedNote}
      ${truncatedNote}
      <div class="offline-farm-body">${buildBody(summary)}</div>
      <div class="row" style="justify-content:flex-end;">
        <button class="confirm-btn">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Explicit user request: every window that opens can be dragged around —
  // the title line (non-interactive) is the handle.
  makeDraggable(overlay.querySelector('.offline-farm-modal'), overlay.querySelector('.confirm-modal-title'));

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.confirm-btn').addEventListener('click', close);
}
