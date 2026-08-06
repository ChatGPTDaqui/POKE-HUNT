// Derives a walkability grid for each of the 7 real hunt-background images
// (assets/hunt-backgrounds/*.png, see CLAUDE.md) by sampling the actual
// pixels — per explicit user request: POKE can't walk through "agua,
// paredes, penhascos, barrancos". Reliably telling drawn rock/wall texture
// apart from drawn floor/path texture would need real semantic image
// understanding this script doesn't have, so two rules are implemented, each
// reliably detectable by pixel sampling alone:
//  - near-black average luminance = the void/out-of-bounds regions visible
//    at every image's edges and gaps (walls/cliffs/ravines read as shadowed-
//    dark in all 7 source images, confirmed by eye), same as before.
//  - saturated blue = real water (rivers/lakes), confirmed by eye: viewing
//    forest.png directly shows an actual river with wooden bridges crossing
//    it that this rule alone previously missed entirely (0% blocked before
//    this change). NOT applied to water.png itself — that image is an
//    underwater grotto scene for the WATER-type hunt, where "blue" is the
//    intended walkable habitat, not an obstacle; confirmed by eye too.
//
// Must mirror render/Sprites.js#drawMapBackground's world<->image transform
// exactly (HUNT_BG_TILE_SCALE, map-center anchor) or the grid wouldn't line
// up with what's actually drawn on screen. Run with:
//   node scripts/build-collision-grids.js
'use strict';

const fs = require('fs');
const path = require('path');
const { decodePng } = require('./lib/png');

const HUNT_BG_TILE_SCALE = 1.6; // must match js/render/Sprites.js
const MAP_BOUNDS = { width: 1400, height: 900 }; // must match every regular hunt's bounds (scripts/sync-planilha.js)
const CELL_SIZE = 40; // world units per grid cell — ~1 POKE collision "box" (entity radius 14-16, diameter ~28-32)
const DARKNESS_THRESHOLD = 26; // 0-255 average RGB below this = "black area"
const SAMPLE_STRIDE = 5; // sample a 5x5 grid of points per cell instead of every pixel (plenty for a threshold this coarse)

// A pixel counts as "water" when blue clearly dominates red/green AND is
// bright/saturated enough — calibrated against forest.png's real river
// pixels (sampled ~[80,165,255]). The brightness floor (100, not the first
// attempt's 60) matters: dragon.png is a night scene with blue-tinted
// ambient shadow on its stone floor (sampled ~[28,39,69]) that technically
// has blue "dominating" red/green too but reads nothing like water by eye —
// confirmed visually, the looser threshold was misblocking ~18% of that
// hunt's legitimately walkable ground before this fix.
function isWaterColor(r, g, b) {
  return b > r * 1.3 && b > g * 1.15 && b > 100;
}
const WATER_CELL_RATIO = 0.5; // majority of a cell's samples must read as water to block it

const BG_FILES = ['fire.png', 'water.png', 'forest.png', 'cave.png', 'dojo.png', 'eletric.png', 'dragon.png'];
const WATER_HABITAT_FILE = 'water.png'; // the one image where blue is the floor, not an obstacle

const bgDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds');
// Migracao React: passa a escrever dentro do app Vite, tipado — ver
// scripts/sync-planilha.js (mesmo padrao de retarget) e o plano em
// .claude/plans/wise-snuggling-oasis.md.
const outFile = path.join(__dirname, '..', 'web', 'src', 'data', 'generated', 'collisionGrids.generated.ts');

// Math.ceil rather than a plain division: 1400/40 is exact (35) but 900/40
// isn't (22.5) — ceil gives a whole extra row of buffer past the map's real
// bottom edge instead of leaving `rows` a non-integer (which would still
// "work" via the for-loop's implicit truncation, but make the exported
// COLLISION_GRID_ROWS constant lie about the grid's real dimensions).
const cols = Math.ceil(MAP_BOUNDS.width / CELL_SIZE);
const rows = Math.ceil(MAP_BOUNDS.height / CELL_SIZE);
const mapCx = MAP_BOUNDS.width / 2;
const mapCy = MAP_BOUNDS.height / 2;

function buildGridForImage(imgPath, blockWater) {
  const buf = fs.readFileSync(imgPath);
  const { width, height, rgba } = decodePng(buf);
  const iw = width * HUNT_BG_TILE_SCALE;
  const ih = height * HUNT_BG_TILE_SCALE;
  const originX = mapCx - iw / 2; // world-space top-left of the drawn image
  const originY = mapCy - ih / 2;

  const rowStrings = [];
  let blockedCount = 0, waterBlockedCount = 0;
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const wx0 = col * CELL_SIZE, wy0 = row * CELL_SIZE;
      let total = 0, samples = 0, waterSamples = 0;
      for (let sy = 0; sy < SAMPLE_STRIDE; sy++) {
        for (let sx = 0; sx < SAMPLE_STRIDE; sx++) {
          const wx = wx0 + ((sx + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const wy = wy0 + ((sy + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const ix = Math.round((wx - originX) / HUNT_BG_TILE_SCALE);
          const iy = Math.round((wy - originY) / HUNT_BG_TILE_SCALE);
          if (ix < 0 || iy < 0 || ix >= width || iy >= height) { total += 0; samples++; continue; } // out of image = treat as black/void
          const idx = (iy * width + ix) * 4;
          const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
          const lum = (r + g + b) / 3;
          total += alpha < 10 ? 0 : lum; // fully transparent pixel counts as void too
          if (alpha >= 10 && isWaterColor(r, g, b)) waterSamples++;
          samples++;
        }
      }
      const avgLum = total / samples;
      const isDark = avgLum < DARKNESS_THRESHOLD;
      const isWater = blockWater && samples > 0 && waterSamples / samples >= WATER_CELL_RATIO;
      const blocked = isDark || isWater;
      if (blocked) blockedCount++;
      if (isWater && !isDark) waterBlockedCount++;
      line += blocked ? '1' : '0';
    }
    rowStrings.push(line);
  }
  return { rowStrings, blockedCount, waterBlockedCount, total: cols * rows };
}

// Keyed by the exact `bg.image` path js/data/maps.generated.js stores for a
// hunt using this file (see scripts/sync-planilha.js#TYPE_BACKGROUND_IMAGE)
// — a direct image-path -> grid lookup at runtime (js/data/maps.js#getMap)
// needs no separate "which type is this" tracking.
const grids = {};
for (const filename of BG_FILES) {
  const imgPath = path.join(bgDir, filename);
  const key = `assets/hunt-backgrounds/${filename}`;
  if (!fs.existsSync(imgPath)) {
    console.warn(`Skipping ${key}: not found`);
    continue;
  }
  const blockWater = filename !== WATER_HABITAT_FILE;
  const { rowStrings, blockedCount, waterBlockedCount, total } = buildGridForImage(imgPath, blockWater);

  // Safety check: the spawn point (map center) and its immediate
  // neighborhood must be walkable, or every hunt using this grid would
  // softlock the player on entry. If this ever fails, something about the
  // image/transform assumptions above is wrong for that file.
  const centerRow = Math.floor(rows / 2);
  const centerCol = Math.floor(cols / 2);
  const centerBlocked = rowStrings[centerRow][centerCol] === '1';
  if (centerBlocked) {
    throw new Error(`${key}: spawn point (map center) came out blocked — aborting, would softlock every hunt using this grid.`);
  }

  const pct = ((blockedCount / total) * 100).toFixed(1);
  console.log(`${key}: ${blockedCount}/${total} cells blocked (${pct}%, ${waterBlockedCount} from water), spawn OK`);
  grids[key] = rowStrings;
}

const header = `// AUTO-GENERATED by \`node scripts/build-collision-grids.js\` from the real
// pixels of assets/hunt-backgrounds/*.png. Do not edit by hand — re-run the
// script instead (e.g. after replacing/re-upscaling a background image).
// Each grid is one string per row, '1' = blocked (near-black/void in the
// source image), '0' = walkable. See systems/MovementSystem.js for how this
// is consulted, and scripts/build-collision-grids.js for how it's derived.
import type { CollisionGrids } from './types';

export const COLLISION_GRID_CELL_SIZE = ${CELL_SIZE};
export const COLLISION_GRID_COLS = ${cols};
export const COLLISION_GRID_ROWS = ${rows};
export const COLLISION_GRIDS: CollisionGrids = ${JSON.stringify(grids, null, 2)};
`;

fs.writeFileSync(outFile, header);
console.log(`Wrote ${outFile}`);
