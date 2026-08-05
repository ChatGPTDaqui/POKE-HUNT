// Post-battle Pokeball-throw animation (js/render/Sprites.js#drawCaptureAnim,
// triggered from main.js#handleEnemyDefeated). The source sheet
// (assets/pokeball-bounce.png, user-provided) is a 28-column x 32-row grid
// of 64x64px cells — measured directly off the real PNG (zlib-inflate +
// unfilter, scan for the 64px column/row pitch), not assumed, since 1792/5
// doesn't divide evenly the way a naive "5 columns" reading would suggest.
// Columns follow the real Pokemon franchise's official ball order (Poke=1,
// Great=2, Ultra=3, Master=4, Premier=5, ...26 more types this game doesn't
// have items for) — only 4 of the 28 columns are ever addressed, matching
// this game's real catching items (js/data/items.generated.js).
export const CAPTURE_ANIM_URL = 'assets/pokeball-bounce.png';
export const CAPTURE_ANIM_CELL = 64;

export const CAPTURE_ANIM_COLUMNS = {
  poke_ball: 0,
  great_ball: 1,
  ultra_ball: 2,
  premier_ball: 4, // column 4 (Master Ball, 0-indexed 3) has no equivalent item in this game and is skipped
};

// Rows 1-15 (successful capture) / 16-26 (failed capture, "broke free") per
// explicit spec — 0-indexed here. The sheet has additional rows (27-32)
// beyond what was specified for either sequence; left unused rather than
// guessed at.
export const CAPTURE_ANIM_SUCCESS_ROWS = 15;
export const CAPTURE_ANIM_FAIL_ROW_START = 15;
export const CAPTURE_ANIM_FAIL_ROWS = 11;
export const CAPTURE_ANIM_FRAME_DURATION = 0.07; // seconds per frame

export function captureAnimRowCount(success) {
  return success ? CAPTURE_ANIM_SUCCESS_ROWS : CAPTURE_ANIM_FAIL_ROWS;
}

// Source-rect for one frame, clamped so holding on `frameIndex` past the end
// just freezes on the sequence's last frame instead of reading garbage rows.
export function captureAnimFrameRect(ballItemId, success, frameIndex) {
  const col = CAPTURE_ANIM_COLUMNS[ballItemId];
  if (col == null) return null;
  const rowCount = captureAnimRowCount(success);
  const rowStart = success ? 0 : CAPTURE_ANIM_FAIL_ROW_START;
  const row = rowStart + Math.min(Math.max(0, frameIndex), rowCount - 1);
  return {
    sx: col * CAPTURE_ANIM_CELL,
    sy: row * CAPTURE_ANIM_CELL,
    sw: CAPTURE_ANIM_CELL,
    sh: CAPTURE_ANIM_CELL,
  };
}
