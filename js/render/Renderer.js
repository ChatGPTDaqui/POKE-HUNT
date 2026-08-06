import { drawEntity, drawHpBar, drawNameLevelTag, drawEffect, drawMapBackground, drawNpcMarker } from './Sprites.js';

const HOSPITAL_BG = { primary: '#2b2f45', secondary: '#333a5c' };

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_SENSITIVITY = 0.0015;
const ZOOM_STEP = 0.1;
// Explicit user request: default zoom level (the % shown in #zoom-control)
// is 150%. Applies to both the hunt camera (renderMap) and the Hospital
// scene (renderHospital) — the player can still zoom past this via
// Ctrl+Scroll/the +/- buttons, same MIN/MAX clamp as before.
const DEFAULT_ZOOM = 1.5;
// Fraction of screen height the active POKE anchors to — 0.5 would be dead
// center; explicit user request to sit slightly below center instead, so a
// bit more of the world ahead/above is visible than behind.
const PLAYER_ANCHOR_Y = 0.58;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.width = canvas.width;
    this.height = canvas.height;
    this.zoom = DEFAULT_ZOOM;
  }

  // Canvas attribute width/height (its actual drawing-buffer resolution) are
  // resized to match the real window on load/resize (see main.js) so the
  // game always fills 100% at any aspect ratio, no fixed 960x540 + letterbox
  // scaling. Everything here already keys off this.width/this.height rather
  // than a hardcoded resolution, so just re-reading them after a resize is
  // enough to keep the camera/hospital layout correct.
  handleResize() {
    this.width = this.canvas.width;
    this.height = this.canvas.height;
  }

  // Ctrl+Scroll camera zoom (see main.js's wheel listener). Negative deltaY
  // (scroll up) zooms in.
  adjustZoom(deltaY) {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom - deltaY * ZOOM_SENSITIVITY));
  }

  // Discrete +/- zoom button (see #zoom-control in index.html) — same clamp
  // as the Ctrl+Scroll wheel gesture above, just a fixed step per click.
  zoomStep(direction) {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom + direction * ZOOM_STEP));
    return this.zoom;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  // Nurse desk / player spot in the Hospital scene BEFORE the zoom pull-back
  // below — fractions of the current canvas size (not fixed px) so they
  // stay sensibly placed — nurse upper-middle, player just below her — at
  // any window size/aspect ratio. Only used internally by renderHospital,
  // which draws at these positions under a ctx transform; anything outside
  // this file (nurse click/hover hit-test in main.js) must use the public,
  // already-zoom-adjusted getters below instead.
  _hospitalBaseNursePos() {
    return { x: this.width / 2, y: this.height * 0.35 };
  }

  _hospitalBasePlayerPos() {
    return { x: this.width / 2, y: this.height * 0.68 };
  }

  // Maps a base Hospital position through the same center-anchored
  // scale renderHospital applies to the whole scene, so callers doing plain
  // canvas-pixel hit-testing (no ctx transform of their own) land on
  // whatever is actually drawn on screen at the current zoom.
  _applyHospitalZoom({ x, y }) {
    const cx = this.width / 2, cy = this.height / 2;
    return { x: cx + (x - cx) * this.zoom, y: cy + (y - cy) * this.zoom };
  }

  // Public: real on-screen position, accounting for zoom — used by both
  // renderHospital's own drawing (indirectly, via the ctx transform) and
  // main.js's nurse click/hover hit-test, so the two can never drift apart.
  get hospitalNursePos() {
    return this._applyHospitalZoom(this._hospitalBaseNursePos());
  }

  get hospitalPlayerPos() {
    return this._applyHospitalZoom(this._hospitalBasePlayerPos());
  }

  renderHospital(playerEntity) {
    const ctx = this.ctx;
    this.clear();
    const hospitalMap = { bounds: { width: this.width, height: this.height }, bg: HOSPITAL_BG };
    const cx = this.width / 2, cy = this.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-cx, -cy);

    // Enlarged so the shrunk (zoom < 1 = pulled back) scene still covers the
    // whole canvas after the transform above — same technique renderMap uses
    // for the hunt camera (viewport size divided by zoom).
    const viewportW = this.width / this.zoom;
    const viewportH = this.height / this.zoom;
    drawMapBackground(ctx, hospitalMap, { x: cx - viewportW / 2, y: cy - viewportH / 2, w: viewportW, h: viewportH });

    const nursePos = this._hospitalBaseNursePos();
    drawNpcMarker(ctx, nursePos.x, nursePos.y, 'Enfermeira');
    if (playerEntity) {
      const original = { x: playerEntity.x, y: playerEntity.y };
      const playerPos = this._hospitalBasePlayerPos();
      playerEntity.x = playerPos.x;
      playerEntity.y = playerPos.y;
      drawEntity(ctx, playerEntity);
      drawHpBar(ctx, playerEntity);
      drawNameLevelTag(ctx, playerEntity);
      playerEntity.x = original.x;
      playerEntity.y = original.y;
    }
    ctx.restore();
  }

  renderMap(mapDef, world) {
    const ctx = this.ctx;
    this.clear();

    const camera = this._computeCamera(mapDef, world.player);
    ctx.save();
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-camera.x, -camera.y);

    // Divided by zoom: at zoom<1 (zoomed out) more world is visible than a
    // raw width/height would cover, and drawMapBackground's viewport-filled
    // pattern (see Sprites.js) needs the real visible world-space rect to
    // avoid a ring of unpainted background at the edges.
    drawMapBackground(ctx, mapDef, { x: camera.x, y: camera.y, w: this.width / this.zoom, h: this.height / this.zoom });

    for (const enemy of world.enemies) {
      // Dead enemies stay in the array briefly (see DEATH_ANIM_GRACE_PERIOD in
      // main.js) just long enough to play their Faint pose, HP bar/tag hidden.
      drawEntity(ctx, enemy);
      if (!enemy.isDead) {
        drawHpBar(ctx, enemy);
        drawNameLevelTag(ctx, enemy);
      }
    }

    if (world.player && !world.player.fainted) {
      drawEntity(ctx, world.player);
      drawHpBar(ctx, world.player);
      drawNameLevelTag(ctx, world.player);
    }

    for (const effect of world.effects) {
      drawEffect(ctx, effect);
    }

    ctx.restore();
  }

  // The player POKE stays horizontally centered and anchored at
  // PLAYER_ANCHOR_Y vertically (slightly below center) — no clamping to the
  // map bounds, so the camera can show past the edges near a corner. Divided
  // by zoom so the visible world area shrinks/grows around that same anchor
  // point as the player scrolls in/out (see adjustZoom).
  _computeCamera(mapDef, player) {
    const px = player ? player.x : mapDef.bounds.width / 2;
    const py = player ? player.y : mapDef.bounds.height / 2;
    return { x: px - this.width / 2 / this.zoom, y: py - (this.height * PLAYER_ANCHOR_Y) / this.zoom };
  }
}
