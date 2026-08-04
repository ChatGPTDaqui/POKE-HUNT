// Shared drag behavior for floating windows (menu screens, POKE profile,
// Farm Offline report, Auto panel...) — explicit user request that every
// window that opens on screen can be moved around instead of staying pinned
// wherever it first appears.
//
// `handle` (defaults to `el` itself) is where a drag can start from. A
// mousedown that lands on a real control inside the handle (button, input,
// select, textarea, link, or anything tagged `.no-drag`) is left alone so
// clicking those still works normally — only empty/background space of the
// handle actually starts a drag.
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, .no-drag';

export function makeDraggable(el, handle = el) {
  handle.classList.add('draggable-handle');

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(INTERACTIVE_SELECTOR)) return;

    const rect = el.getBoundingClientRect();
    // Freeze the current on-screen position as explicit fixed left/top,
    // dropping whatever centering placed it there originally (CSS
    // top/left/transform, or a flexbox-centered parent like
    // .confirm-modal-overlay) — from this point on the element tracks the
    // mouse directly, viewport-relative regardless of how it used to be
    // positioned.
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
    el.style.transform = 'none';

    const startX = e.clientX;
    const startY = e.clientY;
    const origLeft = rect.left;
    const origTop = rect.top;
    e.preventDefault();

    function onMove(ev) {
      el.style.left = `${origLeft + (ev.clientX - startX)}px`;
      el.style.top = `${origTop + (ev.clientY - startY)}px`;
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
