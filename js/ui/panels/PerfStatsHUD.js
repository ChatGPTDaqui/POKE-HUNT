import { getPerfStats } from '../../systems/StatsTracker.js';

// Ouro/H and XP/H can easily run into the tens/hundreds of thousands at
// higher levels — abbreviate with k/M so the panel stays readable (10000 ->
// "10k", 1250000 -> "1.3M"). Trailing ".0" is stripped since a whole number
// of thousands doesn't need the decimal.
function formatRate(value) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

// Same incremental-DOM-update reasoning as HUD.js: this panel is rebuilt
// every render frame (60fps) via UIManager's updateHud(), so the "Resetar"
// button must be a persistent node (built once, cached on the container)
// rather than recreated each frame — otherwise a real mouse click's
// mousedown/mouseup can straddle two different node instances and the
// browser silently drops the click.
function buildPerfStatsDom(container) {
  container.innerHTML = `
    <div class="stat-row"><span>Ouro/H</span><span class="perf-gold"></span></div>
    <div class="stat-row"><span>XP/H</span><span class="perf-xp"></span></div>
    <div class="stat-row"><span>Mobs/H</span><span class="perf-mobs"></span></div>
    <div class="stat-row"><span>Shinys</span><span class="perf-shinys"></span></div>
    <button class="perf-reset-btn">Resetar</button>
  `;
  container._els = {
    gold: container.querySelector('.perf-gold'),
    xp: container.querySelector('.perf-xp'),
    mobs: container.querySelector('.perf-mobs'),
    shinys: container.querySelector('.perf-shinys'),
  };
}

export function renderPerfStats(container, gameState) {
  if (!container._built) {
    buildPerfStatsDom(container);
    container._built = true;
  }
  const s = getPerfStats(gameState);
  const els = container._els;
  els.gold.textContent = formatRate(s.goldPerHour);
  els.xp.textContent = formatRate(s.xpPerHour);
  els.mobs.textContent = s.mobsPerHour;
  els.shinys.textContent = s.shinys;
}
