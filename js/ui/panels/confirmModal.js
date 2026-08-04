// Small themed confirm dialog, appended straight to <body> so it floats above
// every overlay screen. Used for anything destructive enough to warrant a
// second click — currently just selling a shiny POKE (see ShopMenu.js).
export function showConfirmModal({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' }, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';
  overlay.innerHTML = `
    <div class="confirm-modal panel">
      <div class="confirm-modal-title">${title}</div>
      <div class="confirm-modal-msg">${message}</div>
      <div class="row" style="justify-content:flex-end;">
        <button class="cancel-btn">${cancelLabel}</button>
        <button class="confirm-btn confirm-danger">${confirmLabel}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.cancel-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.confirm-btn').addEventListener('click', () => {
    close();
    onConfirm();
  });
}
