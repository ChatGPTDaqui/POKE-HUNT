// Folha de conferencia ROTULADA de candidato a arte de efeito, na geometria
// real do combate.
//
// POR QUE ELA EXISTE, tendo `scripts/conferir-vfx-visual.mjs`. Aquele desenha
// na mesma geometria e e a ferramenta canonica pra julgar UMA escolha, mas as
// celulas dele nao tem nome: no modo avulso ele aceita vários `caminho@quadros`
// e os empilha numa grade muda. Isso serve pra 2 candidatos e nao serve pra 94,
// que foi o tamanho da varredura da PH-367/368/369 — o lote nomeado do banco
// tem 95 efeitos. Julgar 94 celulas sem nome ATRIBUI ARTE AO ID ERRADO, e esse
// erro nao aparece depois: o cadastro fica com um id que desenha outra coisa,
// que e exatamente a classe de defeito que a PH-368 foi consertar (o ROCK
// desenhando a saida do Dig, o BUG desenhando grama).
//
// O rotulo em cima de cada celula e o unico acrescimo: id, numero de quadros e
// a geometria do quadro. O resto — atacante a esquerda, alvo a `ALCANCE` dele,
// arte na altura que o jogo pede, fundo escuro de hunt — e copia deliberada de
// `conferir-vfx-visual.mjs`, pra as duas ferramentas concordarem.
//
// LIMITE CONHECIDO: ela NAO aplica `recorteX` nem `escala`. Serve pra responder
// "o que esta arte desenha?", nao "isto cabe no combate?" — pra segunda
// pergunta, `conferir-direcao-vfx.mjs` mede e `conferir-vfx-visual.mjs`
// desenha com as correcoes.
//
//   node scripts/harness/folha-de-candidatos-vfx.mjs saida.png a.png@16 b.png@7
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const { decodePng } = require(join(RAIZ, 'scripts', 'lib', 'png.js'));

// Mesmos numeros de conferir-vfx-visual.mjs. Ver o cabecalho dele pra origem.
const IMPACT_BASE_SIZE = 44, ESCALA_VFX_SINGLE = 1.05, POKE_RAIO = 14.5, ALCANCE = 39;
const ZOOM = 3, QUADROS = 6, CELULA_W = 250, CELULA_H = 110, COLUNAS = 2;

// Fonte de 3x5 so com digitos: o rotulo e um id numerico e uma geometria.
const FONTE = {
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '010', '010', '010', '010'],
  '2': ['111', '001', '111', '100', '111'], '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111'],
  '-': ['000', '000', '111', '000', '000'], ' ': ['000', '000', '000', '000', '000'],
};

function texto(dst, W, H, x, y, s, esc, cor) {
  let cx = x;
  for (const ch of String(s)) {
    const g = FONTE[ch] || FONTE[' '];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) {
      if (g[r][c] !== '1') continue;
      for (let dy = 0; dy < esc; dy++) for (let dx = 0; dx < esc; dx++) {
        const X = cx + c * esc + dx, Y = y + r * esc + dy;
        if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
        const i = (Y * W + X) * 4;
        dst[i] = cor[0]; dst[i + 1] = cor[1]; dst[i + 2] = cor[2];
      }
    }
    cx += 4 * esc;
  }
}

function png(width, height, rgba) {
  const bruto = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    bruto[y * (width * 4 + 1)] = 0;
    rgba.copy(bruto, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const tab = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tab[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = tab[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const co = Buffer.concat([Buffer.from(t, 'ascii'), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(co));
    return Buffer.concat([l, co, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bruto, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function comporSobre(dst, W, H, px, py, src, sw, sh, sx0, aW, aH, srcW) {
  for (let dy = 0; dy < aH; dy++) for (let dx = 0; dx < aW; dx++) {
    const ix = sx0 + Math.floor((dx / aW) * sw), iy = Math.floor((dy / aH) * sh);
    const si = (iy * srcW + ix) * 4, a = src[si + 3] / 255;
    if (a <= 0.02) continue;
    const X = px + dx, Y = py + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const di = (Y * W + X) * 4;
    for (let c = 0; c < 3; c++) dst[di + c] = Math.round(dst[di + c] * (1 - a) + src[si + c] * a);
  }
}

function disco(dst, W, H, cx, cy, r, cor) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    if (x * x + y * y > r * r) continue;
    const X = Math.round(cx + x), Y = Math.round(cy + y);
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const i = (Y * W + X) * 4;
    dst[i] = cor[0]; dst[i + 1] = cor[1]; dst[i + 2] = cor[2];
  }
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('uso: node scripts/harness/folha-de-candidatos-vfx.mjs saida.png <arquivo.png@quadros> ...');
  process.exit(1);
}
const saida = args[0];
const itens = args.slice(1).map((a) => {
  const corte = a.lastIndexOf('@');
  const caminho = a.slice(0, corte);
  return {
    arquivo: isAbsolute(caminho) ? caminho : join(RAIZ, caminho),
    quadros: Number(a.slice(corte + 1)),
    rotulo: caminho.split(/[\\/]/).pop().replace(/\.png$/i, ''),
  };
});

const linhas = Math.ceil(itens.length / COLUNAS);
const W = CELULA_W * COLUNAS * ZOOM, H = CELULA_H * linhas * ZOOM;
const buf = Buffer.alloc(W * H * 4);
// Fundo escuro de hunt, nunca cinza neutro: cinza ja aprovou arte invisivel
// neste projeto duas vezes (assets/move-vfx/NOTAS.txt).
for (let i = 0; i < W * H; i++) {
  const y = Math.floor(i / W), t = (y / H) * 20;
  buf[i * 4] = 26 + t; buf[i * 4 + 1] = 30 + t; buf[i * 4 + 2] = 24 + t; buf[i * 4 + 3] = 255;
}

for (const [idx, it] of itens.entries()) {
  const col = idx % COLUNAS, row = Math.floor(idx / COLUNAS);
  const ox = col * CELULA_W * ZOOM, oy = row * CELULA_H * ZOOM;
  const { width, height, rgba } = decodePng(readFileSync(it.arquivo));
  const sw = Math.floor(width / it.quadros);
  const aH = IMPACT_BASE_SIZE * ESCALA_VFX_SINGLE, aW = aH * (sw / height);
  const baseY = oy + (CELULA_H / 2) * ZOOM + 10;
  const ax = ox + 26 * ZOOM, tx = ax + ALCANCE * ZOOM;
  disco(buf, W, H, ax, baseY, POKE_RAIO * ZOOM, [70, 90, 130]);
  disco(buf, W, H, tx, baseY, POKE_RAIO * ZOOM, [130, 70, 70]);
  for (let k = 0; k < QUADROS; k++) {
    const f = Math.min(it.quadros - 1, Math.round((k / (QUADROS - 1)) * (it.quadros - 1)));
    const px = ox + (95 + k * 25) * ZOOM;
    comporSobre(
      buf, W, H,
      Math.round(px - (aW * ZOOM) / 2), Math.round(baseY - (aH * ZOOM) / 2),
      rgba, sw, height, f * sw, Math.round(aW * ZOOM), Math.round(aH * ZOOM), width,
    );
  }
  texto(buf, W, H, ox + 6, oy + 6, it.rotulo, 3, [255, 240, 90]);
  texto(buf, W, H, ox + 6, oy + 26, `${it.quadros}-${sw}-${height}`, 2, [150, 200, 255]);
  for (let x = 0; x < CELULA_W * ZOOM; x++) { const i = (oy * W + ox + x) * 4; buf[i] = 70; buf[i + 1] = 70; buf[i + 2] = 70; }
  for (let y = 0; y < CELULA_H * ZOOM; y++) { const i = ((oy + y) * W + ox) * 4; buf[i] = 70; buf[i + 1] = 70; buf[i + 2] = 70; }
}

mkdirSync(dirname(isAbsolute(saida) ? saida : join(RAIZ, saida)), { recursive: true });
writeFileSync(isAbsolute(saida) ? saida : join(RAIZ, saida), png(W, H, buf));
console.log(`${itens.length} candidatos -> ${saida} (${W}x${H})`);
console.log('Disco azul = atacante, vermelho = alvo, 39px de mundo entre os dois.');
console.log('Rotulo amarelo = nome do arquivo; azul = quadros-largura-altura do quadro.');
