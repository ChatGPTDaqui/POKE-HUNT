// Update runs on a setInterval so simulation keeps progressing even while
// the browser tab is backgrounded (expected behaviour for an idle game).
// Rendering runs on requestAnimationFrame and simply draws the latest state
// whenever the tab is actually visible/compositing.
const STEP = 1 / 60;
const UPDATE_INTERVAL_MS = 1000 / 60;
const MAX_DELTA = 1.0; // clamp huge gaps (e.g. laptop sleep) to avoid a single giant combat resolution

export class GameLoop {
  constructor({ update, render }) {
    this.update = update;
    this.render = render;
    this.running = false;
    this.lastUpdateTime = 0;
    this._intervalId = null;
    this._rafId = null;
    this._renderTick = this._renderTick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastUpdateTime = performance.now();
    this._intervalId = setInterval(() => this._updateTick(), UPDATE_INTERVAL_MS);
    this._rafId = requestAnimationFrame(this._renderTick);
  }

  stop() {
    this.running = false;
    clearInterval(this._intervalId);
    cancelAnimationFrame(this._rafId);
  }

  _updateTick() {
    const now = performance.now();
    let delta = (now - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = now;
    if (delta > MAX_DELTA) delta = MAX_DELTA;

    while (delta > 0) {
      const step = Math.min(STEP, delta);
      this.update(step);
      delta -= step;
    }
  }

  _renderTick() {
    if (!this.running) return;
    this.render();
    this._rafId = requestAnimationFrame(this._renderTick);
  }
}
