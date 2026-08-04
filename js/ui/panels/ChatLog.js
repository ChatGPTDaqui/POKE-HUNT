// Floating collapsible chat/log window — 3 tabs (Mundo/Comercio/Log). Combat
// noise (damage/turn/death toasts, tagged channel:'combat' by main.js) lands
// ONLY here, never as a floating toast; other channels still toast AND get
// logged, so their history is still browsable.
//
// Built once and mutated in place (see addLine/_setActiveTab) rather than
// re-rendered from scratch on every event — a full innerHTML rebuild on tab
// buttons that are already live would risk the exact same "click never
// fires" bug fixed in HUD.js's evolve button (renderHud() used to tear down
// and recreate the button every render frame, out from under an in-flight
// click).
const TABS = ['world', 'trade', 'log'];
const TAB_LABELS = { world: 'Mundo', trade: 'Comercio', log: 'Log' };
const CHANNEL_TO_TAB = { combat: 'log', trade: 'trade', world: 'world' };
const MAX_LINES = 60;

export class ChatLog {
  constructor(container) {
    this.container = container;
    this.lines = { world: [], trade: [], log: [] };
    this.activeTab = 'world';
    this.collapsed = false;
    this._buildStatic();
  }

  _buildStatic() {
    this.container.innerHTML = `
      <div class="chat-log-header">
        <div class="row tabs" id="chat-tabs">
          ${TABS.map((t) => `<button data-tab="${t}">${TAB_LABELS[t]}</button>`).join('')}
        </div>
        <button id="chat-collapse-btn">-</button>
      </div>
      <div class="chat-log-body"><div class="chat-log-lines" id="chat-lines"></div></div>
    `;
    this.tabButtons = [...this.container.querySelectorAll('#chat-tabs button')];
    this.linesEl = this.container.querySelector('#chat-lines');
    this.bodyEl = this.container.querySelector('.chat-log-body');
    this.collapseBtn = this.container.querySelector('#chat-collapse-btn');

    this.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => this._setActiveTab(btn.dataset.tab));
    });
    this.collapseBtn.addEventListener('click', () => this._toggleCollapse());
    this._setActiveTab(this.activeTab);
  }

  _setActiveTab(tab) {
    this.activeTab = tab;
    this.tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    this._renderLines();
  }

  _toggleCollapse() {
    this.collapsed = !this.collapsed;
    this.bodyEl.style.display = this.collapsed ? 'none' : '';
    this.collapseBtn.textContent = this.collapsed ? '+' : '-';
  }

  _renderLines() {
    this.linesEl.innerHTML = this.lines[this.activeTab]
      .map((l) => `<div class="chat-line ${l.type || ''}">${l.message}</div>`)
      .join('');
    this.linesEl.scrollTop = this.linesEl.scrollHeight;
  }

  addLine(message, type, channel) {
    const tab = CHANNEL_TO_TAB[channel] || 'world';
    const list = this.lines[tab];
    list.push({ message, type });
    if (list.length > MAX_LINES) list.shift();
    if (tab === this.activeTab) this._renderLines();
  }
}
