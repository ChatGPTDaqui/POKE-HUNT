import { SPECIES } from '../../data/pokes.js';
import { expProgressForInstance, canEvolve } from '../../systems/ProgressionSystem.js';
import { showPokeProfileModal } from './PokeProfileModal.js';
import { swatchHtml, pokeNameTagHtml } from './swatchHtml.js';

export function renderTeamMenu(container, { gameState, controller, refresh }) {
  container.innerHTML = `
    <div class="screen-sticky-header"><h2>Equipe (${gameState.team.length}/6)</h2></div>
    <div class="grid-list" id="team-list"></div>
  `;

  const list = container.querySelector('#team-list');
  if (gameState.team.length === 0) {
    list.innerHTML = '<div class="hint">Voce ainda nao tem nenhum POKE.</div>';
    return;
  }

  gameState.team.forEach((poke, index) => {
    const species = SPECIES[poke.speciesId];
    const isActive = index === gameState.activeIndex;

    const progress = expProgressForInstance(poke, species);
    const evolveTag = canEvolve(poke, species) ? ' <button class="evolve-tag">Evoluir</button>' : '';
    const canRemove = gameState.team.length > 1;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      ${swatchHtml(species, { isShiny: poke.isShiny, poke })}
      <div class="card-info">
        <div class="card-title">${pokeNameTagHtml(poke, species)} Lv${poke.level}${evolveTag} ${isActive ? '(Em campo)' : ''}</div>
        <div class="card-sub">HP ${Math.floor(poke.hp)}/${poke.stats.hp} | EXP ${Math.max(0, Math.floor(progress.into))}/${progress.needed}</div>
      </div>
      <div class="col">
        ${!isActive ? '<button class="field-btn">Colocar em campo</button>' : ''}
        ${canRemove ? '<button class="remove-btn">Retirar da equipe</button>' : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.field-btn') || e.target.closest('.evolve-tag') || e.target.closest('.remove-btn')) return;
      showPokeProfileModal(poke, species);
    });

    const fieldBtn = card.querySelector('.field-btn');
    if (fieldBtn) {
      fieldBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        controller.setActiveTeamIndex(index);
        refresh();
      });
    }

    const evolveBtn = card.querySelector('.evolve-tag');
    if (evolveBtn) {
      evolveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        controller.evolvePoke(poke.uid);
        refresh();
      });
    }

    const removeBtn = card.querySelector('.remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        controller.removeFromTeam(poke.uid);
        refresh();
      });
    }

    list.appendChild(card);
  });
}
