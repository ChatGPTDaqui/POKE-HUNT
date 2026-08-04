// One-off tool: imports real PMD Sprite Collab art (battle anims + face/big
// icons, normal and shiny) for every species that doesn't have a
// assets/battle-sprites/{id}/ folder yet — i.e. the ~130 Kanto/legendary
// species added this session, the same way the previous ~58 were imported
// from this same local checkout. Source:
// assets/SpriteCollab-master (1)/SpriteCollab-master/{sprite,portrait}/{dex4}/
//
// Also auto-measures each new species' footOffsetFraction (see
// data/spriteFootOffsets.js) by decoding the copied Idle (or Walk) sprite's
// alpha channel and finding the lowest opaque pixel row — same convention
// documented there (Down-facing, frame-0 pose), just automated instead of
// eyeballed, since there's ~130 of them this time.
//
// Run with: node scripts/import-kanto-sprites.js
'use strict';

const fs = require('fs');
const path = require('path');
const { readWorkbook } = require('./xlsx-reader.js');
const { decodePng } = require('./lib/png.js');

const ROOT = path.join(__dirname, '..');
const XLSX_PATH = path.join(ROOT, 'Planilha mestra', 'dados_do_jogo.xlsx');
const COLLAB_ROOT = path.join(ROOT, 'assets', 'SpriteCollab-master (1)', 'SpriteCollab-master');
const SPRITE_ROOT = path.join(COLLAB_ROOT, 'sprite');
const PORTRAIT_ROOT = path.join(COLLAB_ROOT, 'portrait');
const BATTLE_SPRITES_DIR = path.join(ROOT, 'assets', 'battle-sprites');
const FACE_DIR = path.join(ROOT, 'assets', 'sprites-face');
const FACE_SHINY_DIR = path.join(ROOT, 'assets', 'sprites-face-shiny');
const ICON_DIR = path.join(ROOT, 'assets', 'sprites');
const ICON_SHINY_DIR = path.join(ROOT, 'assets', 'sprites-shiny');

const NEEDED_ANIMS = ['Idle', 'Walk', 'Shoot', 'Charge', 'Sleep', 'Faint'];

function dex4(n) {
  return String(n).padStart(4, '0');
}

// ---------- Minimal AnimData.xml parsing ----------
function parseAnimData(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const nodeByName = {};
  const animBlocks = xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || [];
  for (const block of animBlocks) {
    const name = (block.match(/<Name>(.*?)<\/Name>/) || [])[1];
    if (!name) continue;
    const copyOf = (block.match(/<CopyOf>(.*?)<\/CopyOf>/) || [])[1] || null;
    const frameWidth = (block.match(/<FrameWidth>(\d+)<\/FrameWidth>/) || [])[1];
    const frameHeight = (block.match(/<FrameHeight>(\d+)<\/FrameHeight>/) || [])[1];
    const durations = [...block.matchAll(/<Duration>(\d+)<\/Duration>/g)].map((m) => parseInt(m[1], 10));
    nodeByName[name] = {
      copyOf,
      frameWidth: frameWidth ? parseInt(frameWidth, 10) : null,
      frameHeight: frameHeight ? parseInt(frameHeight, 10) : null,
      durations,
    };
  }
  return nodeByName;
}

// Resolves `name` to the real anim (with actual frame dims/durations) whose
// PNG file exists on disk in `spriteDir` — following <CopyOf> chains for
// names that have no file of their own (e.g. Abra's "Jab" copies "Strike").
function resolveAnim(name, nodeByName, spriteDir, visited = new Set()) {
  if (visited.has(name)) return null;
  visited.add(name);
  const filePath = path.join(spriteDir, `${name}-Anim.png`);
  const node = nodeByName[name];
  if (fs.existsSync(filePath) && node && node.frameWidth) {
    return { resolvedName: name, file: filePath, node };
  }
  if (node && node.copyOf) return resolveAnim(node.copyOf, nodeByName, spriteDir, visited);
  return null;
}

// ---------- Foot-offset auto-measurement ----------
const ALPHA_THRESHOLD = 20;

function measureFootOffsetFraction(pngPath, frameWidth, frameHeight) {
  const buf = fs.readFileSync(pngPath);
  const { width, height, rgba } = decodePng(buf);
  if (frameWidth > width || frameHeight > height) return null;

  // Down-facing (row 0), frame 0 — top-left cell of the sheet.
  let lowestY = -1;
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        lowestY = y;
        break;
      }
    }
  }
  if (lowestY < 0) return null; // fully transparent cell — shouldn't happen
  // footOffsetFraction is measured from the frame's vertical CENTER downward,
  // as a fraction of frameHeight (see data/spriteFootOffsets.js's own doc).
  return Math.round(((lowestY - frameHeight / 2) / frameHeight) * 1000) / 1000;
}

// ---------- File copy helpers ----------
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

// ---------- Merge into hand-authored js/data/*.js files ----------
function mergeBattleSpriteAnims(newEntries) {
  const filePath = path.join(ROOT, 'js', 'data', 'battleSpriteAnims.js');
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/export const BATTLE_SPRITE_ANIMS = ([\s\S]*?);\s*$/);
  const existing = JSON.parse(match[1]);
  const merged = { ...existing, ...newEntries };
  const header = content.slice(0, match.index);
  fs.writeFileSync(filePath, `${header}export const BATTLE_SPRITE_ANIMS = ${JSON.stringify(merged, null, 2)};\n`);
}

function insertBeforeClosingBrace(filePath, marker, newLines) {
  const content = fs.readFileSync(filePath, 'utf8');
  const idx = content.lastIndexOf('};');
  if (idx === -1) throw new Error(`nao encontrei o fechamento do objeto em ${filePath}`);
  const insertion = `\n  ${marker}\n  ${newLines.join(' ')}\n`;
  const updated = content.slice(0, idx) + insertion + content.slice(idx);
  fs.writeFileSync(filePath, updated);
}

function mergeFootOffsets(entries) {
  const filePath = path.join(ROOT, 'js', 'data', 'spriteFootOffsets.js');
  const lines = Object.entries(entries).map(([id, frac]) => `${id}: ${frac},`);
  insertBeforeClosingBrace(
    filePath,
    '// The ~130 Kanto/legendary species added when the "Novo Continente" hunts\n  // were introduced — same auto-measurement idea, just computed by script\n  // (scripts/import-kanto-sprites.js) instead of eyeballed given the volume.',
    lines,
  );
}

function mergeSpeciesWithArt(ids) {
  const filePath = path.join(ROOT, 'js', 'data', 'sprites.js');
  const content = fs.readFileSync(filePath, 'utf8');
  const marker = "]);";
  const idx = content.indexOf(marker);
  if (idx === -1) throw new Error('nao encontrei o fechamento de SPECIES_WITH_ART');
  const listStr = ids.map((id) => `'${id}'`).join(', ');
  const insertion = `\n  // Kanto/legendary species added with the "Novo Continente" hunts:\n  ${listStr},\n`;
  const updated = content.slice(0, idx) + insertion + content.slice(idx);
  fs.writeFileSync(filePath, updated);
}

// ---------- Main ----------
function main() {
  const workbook = readWorkbook(XLSX_PATH);
  const especies = workbook['Espécies'] || [];
  const dexByKey = {};
  for (const row of especies) dexByKey[row.Chave] = row['Nº Pokédex'];

  const pokesGenerated = fs.readFileSync(path.join(ROOT, 'js', 'data', 'pokes.generated.js'), 'utf8');
  const speciesData = JSON.parse(pokesGenerated.match(/export const SPECIES_DATA = ([\s\S]*?);\s*$/)[1]);

  const newSpeciesIds = Object.keys(speciesData).filter(
    (id) => !fs.existsSync(path.join(BATTLE_SPRITES_DIR, id)),
  );
  console.log(`${newSpeciesIds.length} especies sem battle-sprites ainda.`);

  const newBattleAnims = {};
  const newFootOffsets = {};
  const importedIds = [];
  const skipped = [];

  for (const id of newSpeciesIds) {
    const sheetKey = id.toUpperCase();
    const dexNum = dexByKey[sheetKey];
    if (dexNum == null) {
      skipped.push(`${id} (sem Nº Pokedex na planilha)`);
      continue;
    }
    const d4 = dex4(dexNum);
    const spriteDir = path.join(SPRITE_ROOT, d4);
    const shinySpriteDir = path.join(spriteDir, '0000', '0001');
    const portraitDir = path.join(PORTRAIT_ROOT, d4);
    const shinyPortraitDir = path.join(portraitDir, '0000', '0001');

    if (!fs.existsSync(spriteDir)) {
      skipped.push(`${id} (sem pasta sprite/${d4})`);
      continue;
    }

    const animXmlPath = path.join(spriteDir, 'AnimData.xml');
    if (!fs.existsSync(animXmlPath)) {
      skipped.push(`${id} (sem AnimData.xml)`);
      continue;
    }
    const nodeByName = parseAnimData(animXmlPath);

    const animsData = {};
    let copiedAny = false;
    let idleFramePath = null;
    let idleFrameW = null;
    let idleFrameH = null;

    for (const animName of NEEDED_ANIMS) {
      const resolved = resolveAnim(animName, nodeByName, spriteDir);
      if (!resolved) continue;

      const destNormal = path.join(BATTLE_SPRITES_DIR, id, `${animName}-Anim.png`);
      copyFile(resolved.file, destNormal);

      const shinyFile = path.join(shinySpriteDir, `${resolved.resolvedName}-Anim.png`);
      const destShiny = path.join(BATTLE_SPRITES_DIR, id, `${animName}-Shiny-Anim.png`);
      copyFile(fs.existsSync(shinyFile) ? shinyFile : resolved.file, destShiny);

      animsData[animName] = {
        frameWidth: resolved.node.frameWidth,
        frameHeight: resolved.node.frameHeight,
        durations: resolved.node.durations,
      };
      copiedAny = true;

      if (animName === 'Idle' || (animName === 'Walk' && !idleFramePath)) {
        idleFramePath = destNormal;
        idleFrameW = resolved.node.frameWidth;
        idleFrameH = resolved.node.frameHeight;
      }
    }

    if (!copiedAny) {
      skipped.push(`${id} (nenhuma das animacoes necessarias encontrada)`);
      continue;
    }

    newBattleAnims[id] = animsData;

    if (idleFramePath) {
      const frac = measureFootOffsetFraction(idleFramePath, idleFrameW, idleFrameH);
      if (frac != null) newFootOffsets[id] = frac;
    }

    // Face/big icon — both slots reuse the same "Normal" portrait, same as
    // the previous ~58 species (no separate box art exists for them either).
    const normalPortrait = path.join(portraitDir, 'Normal.png');
    if (fs.existsSync(normalPortrait)) {
      const shinyPortrait = path.join(shinyPortraitDir, 'Normal.png');
      const shinySrc = fs.existsSync(shinyPortrait) ? shinyPortrait : normalPortrait;
      copyFile(normalPortrait, path.join(FACE_DIR, `${id}.png`));
      copyFile(shinySrc, path.join(FACE_SHINY_DIR, `${id}.png`));
      copyFile(normalPortrait, path.join(ICON_DIR, `${id}.png`));
      copyFile(shinySrc, path.join(ICON_SHINY_DIR, `${id}.png`));
    }

    importedIds.push(id);
  }

  if (Object.keys(newBattleAnims).length > 0) {
    mergeBattleSpriteAnims(newBattleAnims);
    mergeFootOffsets(newFootOffsets);
    mergeSpeciesWithArt(importedIds);
  }

  console.log(`\nImportado: ${importedIds.length}`);
  console.log(`Pulado: ${skipped.length}`);
  for (const s of skipped) console.log(`  - ${s}`);
}

main();
