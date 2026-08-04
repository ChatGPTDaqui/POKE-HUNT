const CONFIRM_TIMEOUT_MS = 4000;

export function renderSettingsScreen(container, { controller }) {
  container.innerHTML = `
    <div class="screen-sticky-header"><h2>Configuracoes</h2></div>
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
