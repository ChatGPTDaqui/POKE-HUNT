import { averageIvPercent } from '../../data/pokes.js';
import { pokeNameTagHtml } from './swatchHtml.js';

// Compact hover-only summary — the full breakdown (abilities, EXP bar, all
// IVs) still lives behind the click-to-expand buildStatDetail() card; this is
// just enough to eyeball a POKE without clicking.
export function pokeTooltipHtml(poke, species) {
  const typeLabel = species.type2 ? `${species.type} / ${species.type2}` : species.type;
  const ivPct = averageIvPercent(poke.ivs).toFixed(0);
  return `
    <span class="tooltip poke-tooltip">
      <div class="hunt-tooltip-title">${pokeNameTagHtml(poke, species)} (${typeLabel})</div>
      <div class="hunt-tooltip-row">HP: ${Math.floor(poke.hp)}/${poke.stats.hp}</div>
      <div class="hunt-tooltip-row">Atk Fis/Esp: ${poke.stats.atkFis} / ${poke.stats.atkEsp}</div>
      <div class="hunt-tooltip-row">Def Fis/Esp: ${poke.stats.def} / ${poke.stats.defEsp}</div>
      <div class="hunt-tooltip-row">Velocidade: ${poke.stats.speed}</div>
      <div class="hunt-tooltip-row">IV medio: ${ivPct}%</div>
    </span>
  `;
}
