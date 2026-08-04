import { SPECIES } from '../../data/pokes.js';
import { gen5SpriteUrl } from '../../data/gen5Sprites.js';

// Fixed starter trio — kept separate from the (much larger) huntable roster
// that comes from the spreadsheet's 5 initial hunts.
const STARTER_SPECIES_IDS = ['charmander', 'squirtle', 'bulbasaur'];

export function renderStartScreen(container, { controller }) {
  container.innerHTML = `
    <h2>NOVO POKE IDLE</h2>
    <div class="dialogue-box">Voce esta prestes a comecar sua jornada. Escolha um POKE para chamar de seu.</div>
    <div class="grid-list" id="start-list"></div>
  `;

  const list = container.querySelector('#start-list');
  for (const speciesId of STARTER_SPECIES_IDS) {
    const species = SPECIES[speciesId];
    if (!species) continue;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <img class="card-sprite" src="${gen5SpriteUrl(species.id, false)}" alt="${species.name}">
      <div class="card-info">
        <div class="card-title">${species.name}</div>
        <div class="card-sub">${species.description}</div>
      </div>
      <button>Escolher</button>
    `;
    card.querySelector('button').addEventListener('click', () => {
      controller.chooseStarter(species.id);
    });
    list.appendChild(card);
  }
}
