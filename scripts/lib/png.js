// Minimal pure-Node PNG decoder (no npm deps — same constraint as
// xlsx-reader.js). Supports the color-type/bit-depth combinations actually
// present in this project's ripped assets: indexed (4/8-bit, with PLTE+tRNS),
// truecolor+alpha (8/16-bit), truecolor without alpha (16-bit). Used by
// scripts/measure-attack-graphics.js and scripts/import-kanto-sprites.js.
'use strict';

const zlib = require('zlib');

function readChunks(buf) {
  const chunks = [];
  let offset = 8; // skip PNG signature
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.slice(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 8 + length + 4; // length + type + data + crc
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Decodes a PNG buffer to a flat RGBA Uint8ClampedArray (width*height*4).
function decodePng(buf) {
  const chunks = readChunks(buf);
  const ihdr = chunks.find((c) => c.type === 'IHDR').data;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data));
  const raw = zlib.inflateSync(idat);

  const plteChunk = chunks.find((c) => c.type === 'PLTE');
  const trnsChunk = chunks.find((c) => c.type === 'tRNS');
  const palette = plteChunk ? plteChunk.data : null;
  const trns = trnsChunk ? trnsChunk.data : null;

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const bitsPerPixel = channels * bitDepth;
  const bytesPerPixel = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const rowBytes = Math.ceil((width * bitsPerPixel) / 8);

  const unfiltered = Buffer.alloc(rowBytes * height);
  let prevRowStart = -1;
  let srcOffset = 0;
  for (let y = 0; y < height; y++) {
    const filterType = raw[srcOffset];
    srcOffset += 1;
    const rowStart = y * rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const rawByte = raw[srcOffset + x];
      const a = x >= bytesPerPixel ? unfiltered[rowStart + x - bytesPerPixel] : 0;
      const b = prevRowStart >= 0 ? unfiltered[prevRowStart + x] : 0;
      const c = prevRowStart >= 0 && x >= bytesPerPixel ? unfiltered[prevRowStart + x - bytesPerPixel] : 0;
      let value;
      if (filterType === 0) value = rawByte;
      else if (filterType === 1) value = (rawByte + a) & 0xff;
      else if (filterType === 2) value = (rawByte + b) & 0xff;
      else if (filterType === 3) value = (rawByte + Math.floor((a + b) / 2)) & 0xff;
      else if (filterType === 4) value = (rawByte + paeth(a, b, c)) & 0xff;
      else value = rawByte;
      unfiltered[rowStart + x] = value;
    }
    prevRowStart = rowStart;
    srcOffset += rowBytes;
  }

  const rgba = new Uint8ClampedArray(width * height * 4);

  function sampleAt(row, bitOffset, bits) {
    if (bits === 8) return row[bitOffset / 8];
    if (bits === 16) return row[bitOffset / 8];
    const byte = row[Math.floor(bitOffset / 8)];
    const shift = 8 - bits - (bitOffset % 8);
    const mask = (1 << bits) - 1;
    return (byte >> shift) & mask;
  }

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowBytes;
    const row = unfiltered.subarray(rowStart, rowStart + rowBytes);
    for (let x = 0; x < width; x++) {
      const pixelBitOffset = x * bitsPerPixel;
      const outIdx = (y * width + x) * 4;
      if (colorType === 3) {
        const idx = sampleAt(row, pixelBitOffset, bitDepth);
        rgba[outIdx] = palette[idx * 3];
        rgba[outIdx + 1] = palette[idx * 3 + 1];
        rgba[outIdx + 2] = palette[idx * 3 + 2];
        rgba[outIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 6) {
        const stride = bitDepth === 16 ? 2 : 1;
        const base = pixelBitOffset / 8;
        rgba[outIdx] = row[base];
        rgba[outIdx + 1] = row[base + stride];
        rgba[outIdx + 2] = row[base + stride * 2];
        rgba[outIdx + 3] = row[base + stride * 3];
      } else if (colorType === 2) {
        const stride = bitDepth === 16 ? 2 : 1;
        const base = pixelBitOffset / 8;
        rgba[outIdx] = row[base];
        rgba[outIdx + 1] = row[base + stride];
        rgba[outIdx + 2] = row[base + stride * 2];
        rgba[outIdx + 3] = 255;
      } else {
        rgba[outIdx + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

module.exports = { decodePng };
