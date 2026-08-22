// Gera uma imagem de CONFERENCIA por arte: a referencia pintada, recortada
// exatamente na janela que vira mundo, com a grade de colisao gerada por
// cima (vermelho = bloqueado). E o unico jeito de ver, sem entrar no jogo,
// se a grade esta ALINHADA com a pintura — desalinhamento nao lanca erro
// nenhum, so vira parede invisivel no lugar errado.
//
// Gera DUAS imagens por arte:
//
//   _conferencia/<arte>.png           a janela que vira mundo, com a grade
//                                     por cima. Serve pra conferir o que ja
//                                     foi pintado.
//   _conferencia/gabarito/<arte>.png  a referencia INTEIRA, com tudo que
//                                     fica fora da janela escurecido e a
//                                     moldura marcada. Serve pra pintar o
//                                     proximo circulo NO LUGAR CERTO.
//
// O gabarito existe porque a arte e maior que o mundo: um PNG de 2048x2048
// vira 1638x1638 de mundo contra um mapa de 1400x900, entao sobra imagem
// nos quatro lados e SO a faixa central aparece na tela. Quem pinta olhando
// a imagem inteira nao tem como adivinhar onde essa faixa termina — foi o
// que aconteceu com os 10 circulos de spawn da leva 2026-08-18, todos
// pintados de 30 a 370 px fora dela. O jogo agora projeta o circulo pra
// borda mais proxima e a direcao vale, mas dentro da moldura o ponto e
// exato.
//
// A pasta comeca com "_" e fica fora de assets/ de proposito: e material de
// diagnostico, nao entra no site publicado.
//
//   node scripts/conferir-walk-block.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { decodePng } = require('./lib/png.js');
const raiz = dirname(dirname(fileURLToPath(import.meta.url)));
const refDir = join(raiz, 'scripts', 'body-block-refs');
const saidaDir = join(refDir, '_conferencia');

// A transformacao imagem<->mundo NAO e recalculada aqui: desde PH-80 ela vem
// pronta no arquivo gerado (`bounds` + `arte`), porque depende de onde a tinta
// esta na imagem. Este script existe justamente pra flagrar desalinhamento —
// se ele deduzisse a conta por conta propria, concordaria com o proprio erro.
const CELULA = 40;
const ESCALA_SAIDA = 2; // mundo -> pixel de saida

const gerado = readFileSync(join(raiz, 'src', 'data', 'generated', 'subBiomaCollision.generated.ts'), 'utf8');
const COLISAO = JSON.parse(gerado.slice(gerado.indexOf('= {') + 2, gerado.lastIndexOf('}') + 1));

// ref -> arte, so o suficiente pra achar o par (mesma lista do MANIFESTO).
const PARES = {
  'abismo.png': 'abyss.jpg', 'meadow.png': 'meadow.jpg', 'desert.png': 'desert.jpg',
  'badlands.png': 'badlands.jpg', 'burnt-forest.png': 'burnt-forest.jpg',
  'tall-grass.png': 'tall-grass.jpg', 'forest.png': 'forest.jpg',
  'industrial.png': 'industrial.jpg', 'sea.png': 'sea.jpg',
  'ice-mountain.png': 'ice-mountain.png', 'mountain.png': 'mountain.jpg',
  'construction-site.png': 'construction-site.jpg', 'swamp.png': 'swamp.jpg',
  'plains.png': 'plains.jpg', 'beach.png': 'beach.jpg', 'ruins.png': 'ruins.jpg',
  'jungle.png': 'jungle.jpg', 'temple.png': 'temple.png',
  'cave-volcanic.png': 'cave-volcanic.jpg', 'ice-cave.png': 'ice-cave.jpg',
  'fairy-cave.png': 'fairy-cave.jpg', 'island.png': 'island.jpg', 'lake.png': 'lake.jpg',
  'metropolis.png': 'metropolis.jpg', 'slum.png': 'slum.jpg', 'wasteland.png': 'wasteland.jpg',
  'town-night.png': 'town-night.jpg', 'town.png': 'town.jpg', 'volcano.png': 'volcano.jpg',
  'dojo.png': 'dojo.png', 'dragon.png': 'dragon.png',
};

function png(width, height, rgba) {
  const bruto = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    bruto[y * (width * 4 + 1)] = 0;
    rgba.copy(bruto, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = tabela[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (tipo, dados) => {
    const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(corpo));
    return Buffer.concat([tam, corpo, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bruto, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const gabaritoDir = join(saidaDir, 'gabarito');
mkdirSync(saidaDir, { recursive: true });
mkdirSync(gabaritoDir, { recursive: true });

// Largura da borda da moldura, em pixels da imagem de saida.
const BORDA = 3;

// A imagem inteira reduzida pra caber num visualizador sem esforco. 1024 de
// lado maior mantem o circulo (52-76 px na original) visivel com folga.
const GABARITO_LADO = 1024;
const alvos = process.argv.slice(2);

for (const [ref, arte] of Object.entries(PARES)) {
  const chave = `assets/hunt-backgrounds/${arte}`;
  if (!COLISAO[chave]) continue;
  if (alvos.length && !alvos.some((a) => ref.includes(a))) continue;

  const { width, height, rgba } = decodePng(readFileSync(join(refDir, ref)));
  const { escala, x: ox, y: oy } = COLISAO[chave].arte;
  const LARGURA = COLISAO[chave].bounds.width, ALTURA = COLISAO[chave].bounds.height;

  const grid = COLISAO[chave].grid;
  const spawn = COLISAO[chave].spawnPoint;
  const W = Math.floor(LARGURA / ESCALA_SAIDA), H = Math.floor(ALTURA / ESCALA_SAIDA);
  const saida = Buffer.alloc(W * H * 4);

  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      const wx = sx * ESCALA_SAIDA, wy = sy * ESCALA_SAIDA;
      const ix = Math.round((wx - ox) / escala), iy = Math.round((wy - oy) / escala);
      let r = 0, g = 0, b = 0;
      if (ix >= 0 && iy >= 0 && ix < width && iy < height) {
        const i = (iy * width + ix) * 4;
        r = rgba[i]; g = rgba[i + 1]; b = rgba[i + 2];
      }
      const col = Math.floor(wx / CELULA), row = Math.floor(wy / CELULA);
      const bloqueada = row < 0 || row >= grid.length || col < 0 || col >= grid[0].length || grid[row][col] === '1';
      // Bloqueado escurece e puxa pro vermelho; andavel fica como esta.
      if (bloqueada) { r = (r * 0.35 + 90) | 0; g = (g * 0.35) | 0; b = (b * 0.35) | 0; }
      // Linha da grade, pra dar pra contar celula.
      if (wx % CELULA < ESCALA_SAIDA || wy % CELULA < ESCALA_SAIDA) { r = (r + 60) | 0; g = (g + 60) | 0; b = (b + 60) | 0; }
      // Cruz no ponto de spawn.
      if (Math.abs(wx - spawn.x) < 30 && Math.abs(wy - spawn.y) < 4) { r = 255; g = 255; b = 0; }
      if (Math.abs(wy - spawn.y) < 30 && Math.abs(wx - spawn.x) < 4) { r = 255; g = 255; b = 0; }
      const o = (sy * W + sx) * 4;
      saida[o] = Math.min(255, r); saida[o + 1] = Math.min(255, g); saida[o + 2] = Math.min(255, b); saida[o + 3] = 255;
    }
  }
  writeFileSync(join(saidaDir, `${arte.replace(/\.(jpg|png)$/, '')}.png`), png(W, H, saida));

  // --- Gabarito: a imagem INTEIRA, com a janela visivel emoldurada. ---
  //
  // A janela em coordenadas de IMAGEM e o retangulo cujos cantos, levados
  // pro mundo pela mesma transformacao do desenho, dao (0,0) e
  // (LARGURA, ALTURA). Invertendo: ix = (wx - ox) / escala.
  const janela = {
    x0: (0 - ox) / escala, y0: (0 - oy) / escala,
    x1: (LARGURA - ox) / escala, y1: (ALTURA - oy) / escala,
  };
  const reducao = Math.max(width, height) / GABARITO_LADO;
  const GW = Math.round(width / reducao), GH = Math.round(height / reducao);
  const gab = Buffer.alloc(GW * GH * 4);
  for (let sy = 0; sy < GH; sy++) {
    for (let sx = 0; sx < GW; sx++) {
      const ix = Math.round(sx * reducao), iy = Math.round(sy * reducao);
      let r = 0, g = 0, b = 0;
      if (ix < width && iy < height) {
        const i = (iy * width + ix) * 4;
        r = rgba[i]; g = rgba[i + 1]; b = rgba[i + 2];
      }
      const dentro = ix >= janela.x0 && ix <= janela.x1 && iy >= janela.y0 && iy <= janela.y1;
      // Fora da janela: escurece forte. Nao apaga — o usuario precisa ver o
      // que ele pintou la fora pra entender que aquilo nao chega na tela.
      if (!dentro) { r = (r * 0.28) | 0; g = (g * 0.28) | 0; b = (b * 0.28) | 0; }
      // Moldura ciano: cor que nao existe nem na tinta rosa nem na amarela.
      const naBorda =
        (Math.abs(ix - janela.x0) < BORDA * reducao || Math.abs(ix - janela.x1) < BORDA * reducao)
          ? iy >= janela.y0 - BORDA * reducao && iy <= janela.y1 + BORDA * reducao
          : (Math.abs(iy - janela.y0) < BORDA * reducao || Math.abs(iy - janela.y1) < BORDA * reducao)
            && ix >= janela.x0 - BORDA * reducao && ix <= janela.x1 + BORDA * reducao;
      if (naBorda) { r = 0; g = 255; b = 255; }
      const o = (sy * GW + sx) * 4;
      gab[o] = Math.min(255, r); gab[o + 1] = Math.min(255, g); gab[o + 2] = Math.min(255, b); gab[o + 3] = 255;
    }
  }
  writeFileSync(join(gabaritoDir, `${arte.replace(/\.(jpg|png)$/, '')}.png`), png(GW, GH, gab));

  const origem = COLISAO[chave].spawnOrigem ?? '?';
  console.log(`${arte.padEnd(24)} spawn ${String(origem).padEnd(18)} -> _conferencia/ + gabarito/`);
}

console.log('\nNo gabarito, a moldura ciano e o que aparece na tela. Circulo amarelo');
console.log('pintado FORA dela e projetado pra borda mais proxima: a direcao vale, o');
console.log('ponto e aproximado.');
