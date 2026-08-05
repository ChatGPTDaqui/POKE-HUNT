import { sortedPatchNotes } from '../../data/patchNotes.js';

const CONFIRM_TIMEOUT_MS = 4000;

let activeTab = 'geral';

function renderGeralTab(container, { controller }) {
  container.innerHTML = `
    <div class="card">
      <div class="card-info">
        <div class="card-title">Iniciar novo jogo</div>
        <div class="card-sub">Apaga todo o progresso (equipe, itens, ouro, mapas) e comeca do zero.</div>
      </div>
      <button id="reset-btn">Iniciar novo jogo</button>
    </div>
  `;

  const btn = container.querySelector('#reset-btn');
  let confirming = false;
  let timeoutId = null;

  btn.addEventListener('click', () => {
    if (!confirming) {
      confirming = true;
      btn.textContent = 'Tem certeza? Clique de novo para confirmar';
      btn.classList.add('confirm-danger');
      timeoutId = setTimeout(() => {
        confirming = false;
        btn.textContent = 'Iniciar novo jogo';
        btn.classList.remove('confirm-danger');
      }, CONFIRM_TIMEOUT_MS);
    } else {
      clearTimeout(timeoutId);
      controller.resetGame();
    }
  });
}

function renderPatchNotesTab(container) {
  const notes = sortedPatchNotes();
  container.innerHTML = notes.map((note) => `
    <div class="card patch-note-card">
      <div class="card-info">
        <div class="card-title patch-note-title">
          <span>${note.title}</span>
          <span class="patch-note-version">v${note.version}</span>
        </div>
        <div class="card-sub patch-note-date">${note.date}</div>
        <ul class="patch-note-list">
          ${note.highlights.map((h) => `<li>${h}</li>`).join('')}
        </ul>
      </div>
    </div>
  `).join('');
}

export function renderSettingsScreen(container, ctx) {
  container.innerHTML = `
    <div class="screen-sticky-header">
      <h2>Configuracoes</h2>
      <div class="row tabs" id="settings-tabs">
        <button data-tab="geral">Geral</button>
        <button data-tab="patchnotes">Patch-notes</button>
      </div>
    </div>
    <div id="settings-content"></div>
  `;

  container.querySelectorAll('#settings-tabs button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      renderSettingsScreen(container, ctx);
    });
  });

  const content = container.querySelector('#settings-content');
  if (activeTab === 'patchnotes') renderPatchNotesTab(content);
  else renderGeralTab(content, ctx);
}
