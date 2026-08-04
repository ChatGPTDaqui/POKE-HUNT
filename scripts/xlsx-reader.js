// Minimal, dependency-free .xlsx reader.
//
// There is no Python/openpyxl available in this environment, and we don't
// want an npm dependency just to read one spreadsheet, so this parses the
// OOXML zip format directly using only Node's `fs`/`zlib`.
//
// Read-only by design: this project never writes back into the user's
// spreadsheet (see scripts/sync-planilha.js for why).
'use strict';

const fs = require('fs');
const zlib = require('zlib');

const EOCD_SIG = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_FILE_SIG = 0x04034b50;

function readZipEntries(buffer) {
  let eocdOffset = -1;
  const searchStart = Math.max(0, buffer.length - 66000);
  for (let i = buffer.length - 22; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Nao parece um .xlsx valido (EOCD do zip nao encontrado).');

  const cdEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = {};
  let ptr = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (buffer.readUInt32LE(ptr) !== CENTRAL_DIR_SIG) {
      throw new Error('Entrada invalida no diretorio central do zip.');
    }
    const compMethod = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const fnameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fname = buffer.toString('utf8', ptr + 46, ptr + 46 + fnameLen);
    entries[fname] = { compMethod, compSize, localHeaderOffset };
    ptr += 46 + fnameLen + extraLen + commentLen;
  }
  return entries;
}

function extractEntry(buffer, entry) {
  const off = entry.localHeaderOffset;
  if (buffer.readUInt32LE(off) !== LOCAL_FILE_SIG) throw new Error('Cabecalho local do zip invalido.');
  const fnameLen = buffer.readUInt16LE(off + 26);
  const extraLen = buffer.readUInt16LE(off + 28);
  const dataStart = off + 30 + fnameLen + extraLen;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compSize);
  if (entry.compMethod === 0) return compressed;
  if (entry.compMethod === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Metodo de compressao nao suportado: ${entry.compMethod}`);
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml))) {
    const tRegex = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    let text = '';
    while ((tm = tRegex.exec(m[1]))) text += tm[1];
    strings.push(decodeXmlEntities(text));
  }
  return strings;
}

function colToIndex(colLetters) {
  let idx = 0;
  for (let i = 0; i < colLetters.length; i++) idx = idx * 26 + (colLetters.charCodeAt(i) - 64);
  return idx; // 1-based
}

// Returns [{ rowNum, cells: { [colIndex]: { col, value, formula } } }, ...]
// Cells with no cached value and no formula (pure formatting) are skipped.
function parseSheetCells(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml))) {
    const rowNum = parseInt(rm[1], 10);
    const rowXml = rm[2];
    const cellRegex = /<c r="([A-Z]+)(\d+)"([^>]*)>([\s\S]*?)<\/c>|<c r="([A-Z]+)(\d+)"([^>]*)\/>/g;
    let cm;
    const cells = {};
    while ((cm = cellRegex.exec(rowXml))) {
      const colLetters = cm[1] || cm[5];
      const attrs = cm[3] || cm[6] || '';
      const inner = cm[4] || '';
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : 'n';

      const fMatch = inner.match(/<f[^>]*>([\s\S]*?)<\/f>/);
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const formula = fMatch ? decodeXmlEntities(fMatch[1]) : null;
      let value = vMatch ? decodeXmlEntities(vMatch[1]) : null;

      if (type === 's' && value !== null) {
        const idx = parseInt(value, 10);
        value = sharedStrings[idx] !== undefined ? sharedStrings[idx] : null;
      } else if (value !== null && type !== 'str' && type !== 'b') {
        const n = Number(value);
        if (!Number.isNaN(n)) value = n;
      }

      if (value === null && formula === null) continue;
      cells[colToIndex(colLetters)] = { col: colLetters, value, formula };
    }
    if (Object.keys(cells).length > 0) rows.push({ rowNum, cells });
  }
  return rows;
}

// Converts raw cells into header-keyed row objects using row 1 as headers.
function cellsToObjects(rows) {
  if (rows.length === 0) return [];
  const headerRow = rows[0];
  const headers = {};
  for (const colIdx of Object.keys(headerRow.cells)) {
    headers[colIdx] = String(headerRow.cells[colIdx].value).trim();
  }

  const objects = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    let hasAny = false;
    for (const colIdx of Object.keys(headers)) {
      const cell = row.cells[colIdx];
      obj[headers[colIdx]] = cell ? cell.value : null;
      if (cell) hasAny = true;
    }
    if (hasAny) objects.push(obj);
  }
  return objects;
}

function parseWorkbookSheetNames(workbookXml, relsXml) {
  const relMap = {};
  const relRegex = /<Relationship Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
  let rm;
  while ((rm = relRegex.exec(relsXml))) relMap[rm[1]] = rm[2];

  const sheets = [];
  const sheetRegex = /<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g;
  let sm;
  while ((sm = sheetRegex.exec(workbookXml))) {
    const target = relMap[sm[2]];
    sheets.push({ name: decodeXmlEntities(sm[1]), file: target ? target.replace(/^\//, '') : null });
  }
  return sheets;
}

// Reads every sheet of an .xlsx file into { [sheetName]: [{header: value, ...}, ...] }
function readWorkbook(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = readZipEntries(buffer);

  const workbookXml = extractEntry(buffer, entries['xl/workbook.xml']).toString('utf8');
  const relsXml = extractEntry(buffer, entries['xl/_rels/workbook.xml.rels']).toString('utf8');
  const sharedStringsEntry = entries['xl/sharedStrings.xml'];
  const sharedStrings = sharedStringsEntry
    ? parseSharedStrings(extractEntry(buffer, sharedStringsEntry).toString('utf8'))
    : [];

  const sheetMeta = parseWorkbookSheetNames(workbookXml, relsXml);
  const result = {};
  for (const { name, file } of sheetMeta) {
    if (!file) continue;
    const entryKey = `xl/${file}`;
    const entry = entries[entryKey];
    if (!entry) continue;
    const sheetXml = extractEntry(buffer, entry).toString('utf8');
    const rows = parseSheetCells(sheetXml, sharedStrings);
    result[name] = cellsToObjects(rows);
  }
  return result;
}

module.exports = { readWorkbook };
