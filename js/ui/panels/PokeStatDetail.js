import { expProgressForInstance } from '../../systems/ProgressionSystem.js';
import { getAbility, isDamagingAbility } from '../../data/abilities.js';
import { gen5SpriteUrl } from '../../data/gen5Sprites.js';
import { colorForType } from '../../data/typeColors.js';
import { pokeNameTagHtml } from './swatchHtml.js';
import { rarityOf } from '../../data/rarity.js';

const IV_LABELS = { hp: 'HP', atkFis: 'AF', atkEsp: 'AE', def: 'DF', defEsp: 'DE', speed: 'VL' };

function typeChip(type) {
  return `<span class="type-chip" style="background:${colorForType(type)}">${type.slice(0, 3)}</span>`;
}

// Persistent header shared by both tabs of PokeProfileModal (rendered once,
// outside the tab-switched body) — the animated gen5 sprite is the dominant
// visual element per the user's request ("espacos preenchidos
// prioritariamente pela sprite"), name/types/HP/EXP condensed into thin bar
// rows beside it instead of the old stacked-label layout.
export function buildProfileHero(poke, species) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny);
  const hpPct = Math.max(0, poke.hp / poke.stats.hp);
  const progress = expProgressForInstance(poke, species);
  const expPct = Math.max(0, Math.min(1, progress.into / progress.needed));

  const hero = document.createElement('div');
  hero.className = 'profile-hero';
  hero.innerHTML = `
    <div class="profile-sprite-box" style="border-color:${rarityOf(poke).color}">
      <img class="profile-sprite" src="${url}" alt="${species.name}" onerror="this.remove()">
    </div>
    <div class="profile-hero-info">
      <div class="profile-name-row">${pokeNameTagHtml(poke, species)}<span class="profile-level">Lv${poke.level}</span></div>
      <div class="profile-types">${typeChip(species.type)}${species.type2 ? typeChip(species.type2) : ''}</div>
      <div class="profile-bar-row">
        <span class="profile-bar-label">HP</span>
        <div class="bar-track"><div class="bar-fill hp${hpPct < 0.3 ? ' low' : ''}" style="width:${hpPct * 100}%"></div></div>
        <span class="profile-bar-value">${Math.floor(poke.hp)}/${poke.stats.hp}</span>
      </div>
      <div class="profile-bar-row">
        <span class="profile-bar-label">EXP</span>
        <div class="bar-track"><div class="bar-fill exp" style="width:${expPct * 100}%"></div></div>
      </div>
    </div>
  `;
  return hero;
}

// Status tab body — just the numeric stats now that identity (name/types/HP/
// EXP) lives in the shared header above. Compact 3-col grid + IV/ability
// chip rows instead of one stat per full-width line, to keep this short.
export function buildStatDetail(poke, species) {
  const abilityNames = poke.unlockedAbilities
    .map((id) => getAbility(id))
    .filter(isDamagingAbility)
    .map((a) => a.name);

  const detail = document.createElement('div');
  detail.className = 'stat-detail';
  detail.dataset.uid = poke.uid;
  detail.innerHTML = `
    <div class="profile-stat-grid">
      <div class="mini-stat"><span>Atk Fis</span><b>${poke.stats.atkFis}</b></div>
      <div class="mini-stat"><span>Atk Esp</span><b>${poke.stats.atkEsp}</b></div>
      <div class="mini-stat"><span>Defesa</span><b>${poke.stats.def}</b></div>
      <div class="mini-stat"><span>Def Esp</span><b>${poke.stats.defEsp}</b></div>
      <div class="mini-stat"><span>Velocidade</span><b>${poke.stats.speed}</b></div>
    </div>
    <div class="profile-chip-row">
      ${Object.entries(poke.ivs).map(([key, value]) => `<span class="iv-chip">${IV_LABELS[key] || key} <b>${value}</b></span>`).join('')}
    </div>
    <div class="card-sub">Habilidades: ${abilityNames.length ? abilityNames.join(', ') : 'Nenhuma ainda'}</div>
  `;
  return detail;
}

// Full learnset for the species — every move it will *ever* learn, not just
// what the current level has unlocked (species.abilities, unlike the
// instance's own `unlockedAbilities`, is the complete list). Rows for moves
// already learned at this poke's level get a `.learned` class; the rest stay
// dim, so the table doubles as a "what's next" preview.
export function buildMovesetTable(poke, species) {
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter(({ ability }) => ability)
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq);

  const table = document.createElement('div');
  table.className = 'moveset-table';
  table.innerHTML = `
    <div class="moveset-row moveset-header">
      <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span>
    </div>
    ${rows.map(({ entry, ability }) => {
      const learned = entry.levelReq <= poke.level;
      const dmg = ability.power > 0 ? ability.power : '—';
      const category = ability.category === 'physical' ? 'Fisico' : 'Especial';
      const aoe = ability.target === 'aoe' ? '✓' : '—';
      return `
        <div class="moveset-row ${learned ? 'learned' : ''}">
          <span>${entry.levelReq}</span>
          <span>${ability.name}</span>
          <span>${typeChip(ability.type)}</span>
          <span>${category}</span>
          <span>${dmg}</span>
          <span>${aoe}</span>
        </div>
      `;
    }).join('')}
  `;
  return table;
}
