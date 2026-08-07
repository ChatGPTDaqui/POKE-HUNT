// Derives the Water biome's collision grid + player spawn point from a
// hand-painted mask image (assets/hunt-backgrounds/masks/water-collision-mask.png)
// instead of the pixel-heuristic rules build-collision-grids.js uses for the
// other 6 hunt backgrounds. Explicit user request, scoped EXCLUSIVELY to the
// two real Water-type hunts (lv_11_20_costa, kanto_lv_36_55_profundezas) —
// does not touch build-collision-grids.js, its output, or any other biome.
//
// Mask convention (per user spec):
//   RED   = non-walkable (walk block = true)
//   GREEN = the player spawn point (a single marker, centroid of all green
//           pixels if the marker isn't a perfect single pixel)
//   everything else = walkable, ignored
//
// Must mirror the same world<->image transform as build-collision-grids.js
// (HUNT_BG_TILE_SCALE, MAP_BOUNDS, CELL_SIZE) — this mask is pixel-aligned
// 1:1 with assets/hunt-backgrounds/water.png (both 3075x3072, confirmed by
// decoding both), so the two must agree on how world space maps onto that
// image or the resulting grid would be shifted relative to what's drawn.
// Run with:
//   node scripts/build-water-collision-mask.js
'use strict';

const fs = require('fs');
const path = require('path');
const { decodePng } = require('./lib/png');

const HUNT_BG_TILE_SCALE = 1.6; // must match js/render/Sprites.js and build-collision-grids.js
const MAP_BOUNDS = { width: 1400, height: 900 }; // must match the two Water hunts' bounds (scripts/sync-planilha.js)
const CELL_SIZE = 40; // must match build-collision-grids.js — same grid shape, so isCellBlocked's math works unchanged

// A cell counts as blocked when the majority of its samples read as "painted
// red" — same majority-vote shape as build-collision-grids.js's WATER_CELL_RATIO,
// so a cell straddling a paint edge doesn't flip on a single stray sample.
const RED_CELL_RATIO = 0.5;
const SAMPLE_STRIDE = 5;

function isRedMask(r, g, b) {
  return r > 120 && r > g * 1.5 && r > b * 1.5;
}
function isGreenMask(r, g, b) {
  return g > 120 && g > r * 1.5 && g > b * 1.5;
}

const maskPath = path.join(__dirname, '..', 'assets', 'hunt-backgrounds', 'masks', 'water-collision-mask.png');
const referenceImgPath = path.join(__dirname, '..', 'assets', 'hunt-backgrounds', 'water.png');
const outFileTs = path.join(__dirname, '..', 'web', 'src', 'data', 'generated', 'waterCollisionMask.generated.ts');
const outFileJs = path.join(__dirname, '..', 'js', 'data', 'waterCollisionMask.generated.js');

const maskBuf = fs.readFileSync(maskPath);
const { width, height, rgba } = decodePng(maskBuf);

// The mask must be pixel-aligned with the real background it's a guide for —
// if a future re-export of either file changes size, silently building a
// misaligned grid would be worse than refusing to build at all.
const refBuf = fs.readFileSync(referenceImgPath);
const ref = decodePng(refBuf);
if (width !== ref.width || height !== ref.height) {
  throw new Error(
    `water-collision-mask.png (${width}x${height}) does not match water.png (${ref.width}x${ref.height}) — ` +
    `they must be pixel-aligned or the derived grid/spawn would be shifted.`
  );
}

const cols = Math.ceil(MAP_BOUNDS.width / CELL_SIZE);
const rows = Math.ceil(MAP_BOUNDS.height / CELL_SIZE);
const mapCx = MAP_BOUNDS.width / 2;
const mapCy = MAP_BOUNDS.height / 2;
const iw = width * HUNT_BG_TILE_SCALE;
const ih = height * HUNT_BG_TILE_SCALE;
const originX = mapCx - iw / 2; // world-space top-left of the drawn image
const originY = mapCy - ih / 2;

// 1) Locate the green spawn marker first — its centroid, in IMAGE space —
// before building the grid, so we can sanity-check it against the grid below.
let greenSumX = 0, greenSumY = 0, greenCount = 0;
for (let iy = 0; iy < height; iy++) {
  for (let ix = 0; ix < width; ix++) {
    const idx = (iy * width + ix) * 4;
    const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
    if (alpha < 10) continue;
    if (isGreenMask(r, g, b)) {
      greenSumX += ix;
      greenSumY += iy;
      greenCount++;
    }
  }
}
if (greenCount === 0) {
  throw new Error('water-collision-mask.png: no green spawn marker found.');
}
const greenImgX = greenSumX / greenCount;
const greenImgY = greenSumY / greenCount;
const spawnWorldX = originX + greenImgX * HUNT_BG_TILE_SCALE;
const spawnWorldY = originY + greenImgY * HUNT_BG_TILE_SCALE;

// 2) Build the collision grid from the red mask.
const rowStrings = [];
let blockedCount = 0;
for (let row = 0; row < rows; row++) {
  let line = '';
  for (let col = 0; col < cols; col++) {
    const wx0 = col * CELL_SIZE, wy0 = row * CELL_SIZE;
    let redSamples = 0, samples = 0;
    for (let sy = 0; sy < SAMPLE_STRIDE; sy++) {
      for (let sx = 0; sx < SAMPLE_STRIDE; sx++) {
        const wx = wx0 + ((sx + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
        const wy = wy0 + ((sy + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
        const ix = Math.round((wx - originX) / HUNT_BG_TILE_SCALE);
        const iy = Math.round((wy - originY) / HUNT_BG_TILE_SCALE);
        samples++;
        if (ix < 0 || iy < 0 || ix >= width || iy >= height) continue; // out of image = not painted, treat as walkable
        const idx = (iy * width + ix) * 4;
        const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
        if (alpha >= 10 && isRedMask(r, g, b)) redSamples++;
      }
    }
    const blocked = samples > 0 && redSamples / samples >= RED_CELL_RATIO;
    if (blocked) blockedCount++;
    line += blocked ? '1' : '0';
  }
  rowStrings.push(line);
}

function cellBlocked(wx, wy) {
  const col = Math.floor(wx / CELL_SIZE);
  const row = Math.floor(wy / CELL_SIZE);
  if (row < 0 || row >= rowStrings.length || col < 0 || col >= rowStrings[0].length) return false;
  return rowStrings[row][col] === '1';
}

// Safety check, same spirit as build-collision-grids.js's center check: the
// spawn point this file is about to export must itself be walkable, or every
// Water hunt would softlock the player on entry.
if (cellBlocked(spawnWorldX, spawnWorldY)) {
  throw new Error(
    `water-collision-mask.png: derived spawn point (${spawnWorldX.toFixed(1)}, ${spawnWorldY.toFixed(1)}) ` +
    `came out on a blocked cell — aborting, would softlock the Water hunts.`
  );
}

// The 6 shared enemy wander-center points (scripts/sync-planilha.js#SPAWN_POINTS)
// are the same fixed list for every hunt regardless of background — only
// flagged here (not fixed), since moving them is a cross-hunt decision
// outside this task's Water-only scope. Warn loudly if the new grid would
// strand any of them, rather than let it fail silently in play-testing.
const SHARED_ENEMY_SPAWN_POINTS = [
  { x: 500, y: 320 }, { x: 900, y: 320 }, { x: 500, y: 580 },
  { x: 900, y: 580 }, { x: 700, y: 250 }, { x: 700, y: 650 },
];
const strandedSpawnPoints = SHARED_ENEMY_SPAWN_POINTS.filter((p) => cellBlocked(p.x, p.y));
if (strandedSpawnPoints.length > 0) {
  console.warn(
    `WARNING: ${strandedSpawnPoints.length}/6 shared enemy spawn points fall on red-masked (blocked) ` +
    `cells in the Water grid: ${JSON.stringify(strandedSpawnPoints)}. These points are shared by every ` +
    `hunt (scripts/sync-planilha.js#SPAWN_POINTS) — out of scope to move here — but enemies wandering ` +
    `back toward one of these as their home point may now get stuck against a wall in the Water hunts.`
  );
}

const pct = ((blockedCount / (cols * rows)) * 100).toFixed(1);
console.log(`water-collision-mask.png: ${blockedCount}/${cols * rows} cells blocked (${pct}%)`);
console.log(`spawn point: image (${greenImgX.toFixed(1)}, ${greenImgY.toFixed(1)}) -> world (${spawnWorldX.toFixed(1)}, ${spawnWorldY.toFixed(1)})`);

const tsHeader = `// AUTO-GENERATED by \`node scripts/build-water-collision-mask.js\` from the
// hand-painted mask at assets/hunt-backgrounds/masks/water-collision-mask.png
// (red = walk-blocked, green = spawn point). Do not edit by hand — re-run
// the script instead (e.g. after repainting the mask). Applied EXCLUSIVELY
// to the Water-type hunts by web/src/data/maps.ts — see that file's
// WATER_HUNT_IDS. Same grid shape/cell size as
// generated/collisionGrids.generated.ts (COLLISION_GRID_CELL_SIZE), reused
// as-is by MovementSystem.ts/isCellBlocked.
export const WATER_COLLISION_GRID: string[] = ${JSON.stringify(rowStrings, null, 2)};
export const WATER_SPAWN_POINT: { x: number; y: number } = { x: ${spawnWorldX}, y: ${spawnWorldY} };
`;
fs.writeFileSync(outFileTs, tsHeader);
console.log(`Wrote ${outFileTs}`);

const jsHeader = `// AUTO-GENERATED by \`node scripts/build-water-collision-mask.js\` from the
// hand-painted mask at assets/hunt-backgrounds/masks/water-collision-mask.png
// (red = walk-blocked, green = spawn point). Do not edit by hand — re-run
// the script instead (e.g. after repainting the mask). Applied EXCLUSIVELY
// to the Water-type hunts by js/data/maps.js — see that file's
// WATER_HUNT_IDS. Same grid shape/cell size as
// data/collisionGrids.generated.js (COLLISION_GRID_CELL_SIZE), reused as-is
// by MovementSystem.js/isCellBlocked.
export const WATER_COLLISION_GRID = ${JSON.stringify(rowStrings, null, 2)};
export const WATER_SPAWN_POINT = { x: ${spawnWorldX}, y: ${spawnWorldY} };
`;
if (fs.existsSync(path.dirname(outFileJs))) {
  fs.writeFileSync(outFileJs, jsHeader);
  console.log(`Wrote ${outFileJs}`);
}
