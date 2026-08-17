// Minimal pure-Node PNG encoder (RGBA8, filtro 0) — par do decoder em
// scripts/lib/png.js, mesma restricao de zero dependencia npm.
//
// Existe porque fatiar spritesheet (scripts/fatiar-sheet-vfx.mjs) precisa
// ESCREVER PNG, e o projeto so tinha decoder. Nao pretende ser eficiente: sem
// escolha de filtro por linha, sem paleta, sem entrelacamento. Os arquivos
// gerados sao quadros de 32x32, onde o ganho de um encoder esperto e irrelevante.
'use strict';

const zlib = require('zlib');

// Tabela CRC-32 do proprio formato PNG (polinomio 0xEDB88320, refletido).
const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function bloco(tipo, dados) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tamanho, corpo, crc]);
}

/**
 * @param {number} largura
 * @param {number} altura
 * @param {Uint8Array} rgba  largura*altura*4 bytes, mesma ordem que decodePng devolve
 * @returns {Buffer} arquivo PNG completo
 */
function encodePng(largura, altura, rgba) {
  const esperado = largura * altura * 4;
  if (rgba.length !== esperado) {
    throw new Error(`rgba tem ${rgba.length} bytes, esperado ${esperado} (${largura}x${altura}x4)`);
  }
  // Uma linha = 1 byte de filtro (0 = None) + os pixels.
  const cru = Buffer.alloc(altura * (1 + largura * 4));
  for (let y = 0; y < altura; y++) {
    const destino = y * (1 + largura * 4);
    cru[destino] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * largura * 4, largura * 4).copy(cru, destino + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: truecolor + alpha
  // 10..12 = compressao/filtro/entrelacamento, todos 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', zlib.deflateSync(cru, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { encodePng };
