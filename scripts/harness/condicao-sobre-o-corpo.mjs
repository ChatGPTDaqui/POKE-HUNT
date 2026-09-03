// Bancada da PH-370: o simbolo de condicao (paralisia, queimadura) composto
// SOBRE O CORPO REAL do POKE, com a tinta de status ja aplicada, no tamanho de
// jogo, em varias opacidades lado a lado.
//
// POR QUE ELA EXISTE. A justificativa da feature e uma frase muito especifica:
// "tinta amarela a 45% num POKE que ja e amarelo nao comunica nada". Nenhuma
// ferramenta do projeto respondia isso — `conferir-vfx-visual.mjs` desenha a
// arte sobre FUNDO, e o problema aqui e a arte sobre CORPO. Julgar a tira
// sozinha diz que ela e visivel, o que e verdade e irrelevante.
//
// O que ela achou: a `OPACIDADE_DA_CONDICAO` que eu tinha escolhido por
// raciocinio (0.5, "condicao e estado de fundo") deixa a faisca de paralisia
// sobre o Pikachu como um risco esverdeado quase invisivel — o caso exato que a
// feature ia resolver. Em 0.9 as brasas cobrem metade da sprite. O valor que
// entrou no codigo, 0.75, e o que le nos dois sem apagar o POKE.
//
// A primeira linha de cada bloco tem opacidade ZERO de proposito: e o estado
// ANTERIOR (so tinta), e sem ele nao ha com o que comparar.
//
//   node scripts/harness/condicao-sobre-o-corpo.mjs pikachu saida.png
//   node scripts/harness/condicao-sobre-o-corpo.mjs charizard saida.png
//
// Os POKE que interessam sao os que tem a cor do proprio status: pra paralisia
// (amarelo) pikachu, raichu, jolteon, ampharos, elekid, electabuzz; pra
// queimadura (laranja) charizard, charmander, magmar, flareon, growlithe.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const { decodePng } = require(join(RAIZ, 'scripts', 'lib', 'png.js'));

// KNOBS. Existem porque a folha completa (4 condicoes x 4 opacidades x 5
// quadros) sai em 1800x5120, e nesse tamanho qualquer visualizador reduz a
// imagem — o corpo volta pra ~50px e a pergunta "o glifo tapa a cara do POKE?"
// deixa de ser respondivel justamente na bancada que existe pra responder ela.
//
//   ZOOM=8 OPACIDADES=0.75 QUADROS=2 node scripts/harness/condicao-sobre-o-corpo.mjs pikachu
//   CONDICOES=veneno,congelamento node scripts/harness/condicao-sobre-o-corpo.mjs gengar
const ZOOM = Number(process.env.ZOOM ?? 4);
const QUADROS = Number(process.env.QUADROS ?? 5);
const CELULA_W = 90, CELULA_H = 80;
// Altura com que o corpo aparece em jogo. Nao e o raio da entidade (14-15): a
// sprite de batalha e desenhada maior que a caixa de colisao.
const ALTURA_CORPO = Number(process.env.ALTURA_CORPO ?? 34);
// Copia de render/sprites.ts. Ver COR_DE_STATUS_NO_CORPO e
// FORCA_DA_TINTA_DE_STATUS em src/data/vfxTiras.ts.
const FORCA_DA_TINTA = 0.45;
const OPACIDADES = (process.env.OPACIDADES ?? '0,0.5,0.75,0.9').split(',').map(Number);

// AS QUATRO CONDICOES DO CANAL DE CORPO (PH-416). Veneno e congelamento
// entraram nesta lista junto com a arte deles: ate a PH-370 os dois eram lidos
// so pela tinta, e a pergunta que esta bancada faz — "a tinta sozinha comunica?"
// — tem a MESMA resposta ruim para eles que tinha para paralisia e queimadura,
// so muda o elenco que colide (Gengar e Nidoking sao roxos; Articuno e Lapras
// sao ciano).
//
// `quadros: 16` nos quatro nao e coincidencia: e o `QUADROS` de
// scripts/gerar-status-vfx.mjs, que gera os seis com a mesma contagem. Antes
// eram 20 e 6, porque as artes vinham de dois efeitos diferentes do banco.
const TODAS_AS_CONDICOES = [
  { nome: 'veneno', arquivo: 'assets/status-vfx/veneno.png', quadros: 16, tinta: '#a040c8' },
  { nome: 'queimadura', arquivo: 'assets/status-vfx/queimadura.png', quadros: 16, tinta: '#ff8a2b' },
  { nome: 'paralisia', arquivo: 'assets/status-vfx/paralisia.png', quadros: 16, tinta: '#ffdd33' },
  { nome: 'congelamento', arquivo: 'assets/status-vfx/congelamento.png', quadros: 16, tinta: '#3fe0ff' },
  // AS DUAS DE CURA (PH-416, segunda leva). Elas nao tem tinta de corpo — cura
  // nao pinta o POKE —, entao `tinta: null` desliga a multiplicacao e a linha de
  // opacidade 0 mostra o corpo CRU. Continuam valendo a pena aqui: a pergunta
  // desta bancada e "o glifo sobrevive sobre o corpo, no tamanho de jogo?", e
  // ela nao depende de haver tinta.
  { nome: 'cura-hp', arquivo: 'assets/status-vfx/cura-hp.png', quadros: 16, tinta: null },
  { nome: 'cura-status', arquivo: 'assets/status-vfx/cura-status.png', quadros: 16, tinta: null },
];
const CONDICOES = process.env.CONDICOES
  ? process.env.CONDICOES.split(',').map((n) => {
    const c = TODAS_AS_CONDICOES.find((x) => x.nome === n.trim());
    if (!c) throw new Error(`condicao desconhecida: ${n} (use ${TODAS_AS_CONDICOES.map((x) => x.nome).join('/')})`);
    return c;
  })
  : TODAS_AS_CONDICOES;

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

function comp(dst, W, H, px, py, src, srcW, sx0, sy0, sw, sh, aW, aH, alpha) {
  for (let dy = 0; dy < aH; dy++) for (let dx = 0; dx < aW; dx++) {
    const ix = sx0 + Math.floor((dx / aW) * sw), iy = sy0 + Math.floor((dy / aH) * sh);
    const si = (iy * srcW + ix) * 4;
    const a = (src[si + 3] / 255) * alpha;
    if (a <= 0.02) continue;
    const X = px + dx, Y = py + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const di = (Y * W + X) * 4;
    for (let c = 0; c < 3; c++) dst[di + c] = Math.round(dst[di + c] * (1 - a) + src[si + c] * a);
  }
}

const especie = process.argv[2] || 'pikachu';
const saida = process.argv[3] || 'condicao-sobre-o-corpo.png';
const idle = decodePng(readFileSync(join(RAIZ, 'assets', 'battle-sprites', especie, 'Idle-Anim.png')));
// A folha do PMD e uma grade de 8 fileiras (uma por direcao). O quadro parado
// virado pra frente e a celula 0,0 — e a unica de que esta bancada precisa.
const CEL = Math.floor(idle.height / 8);

const linhas = CONDICOES.length * OPACIDADES.length;
const W = CELULA_W * QUADROS * ZOOM, H = CELULA_H * linhas * ZOOM;
const buf = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const y = Math.floor(i / W), t = (y / H) * 18;
  buf[i * 4] = 24 + t; buf[i * 4 + 1] = 28 + t; buf[i * 4 + 2] = 22 + t; buf[i * 4 + 3] = 255;
}

let linha = 0;
for (const cond of CONDICOES) {
  const tira = decodePng(readFileSync(join(RAIZ, cond.arquivo)));
  const L = Math.floor(tira.width / cond.quadros);
  // `tinta: null` = efeito que nao pinta o corpo (as duas de cura). Multiplicar
  // por branco e identidade, entao o mesmo caminho serve pros dois casos sem
  // ramo extra — e a linha de opacidade 0 vira "corpo cru", que e o estado
  // anterior correto pra elas.
  const rgb = cond.tinta
    ? [1, 3, 5].map((i) => parseInt(cond.tinta.slice(i, i + 2), 16))
    : [255, 255, 255];
  // A tinta MULTIPLICA os pixels opacos e mistura com o original, igual ao
  // desenho — pintar por cima daria outra coisa e a comparacao mentiria.
  const corpo = Buffer.from(idle.rgba);
  for (let i = 0; i < corpo.length; i += 4) {
    if (!corpo[i + 3]) continue;
    for (let c = 0; c < 3; c++) {
      corpo[i + c] = Math.round(corpo[i + c] * (1 - FORCA_DA_TINTA) + (corpo[i + c] * rgb[c] / 255) * FORCA_DA_TINTA);
    }
  }
  for (const op of OPACIDADES) {
    const oy = linha * CELULA_H * ZOOM;
    for (let k = 0; k < QUADROS; k++) {
      const ox = k * CELULA_W * ZOOM;
      const cx = ox + (CELULA_W / 2) * ZOOM, cy = oy + (CELULA_H / 2) * ZOOM;
      const a = ALTURA_CORPO * ZOOM;
      comp(buf, W, H, Math.round(cx - a / 2), Math.round(cy - a / 2), corpo, idle.width, 0, 0, CEL, CEL, a, a, 1);
      if (!op) continue;
      const f = Math.min(cond.quadros - 1, Math.round((k / (QUADROS - 1)) * (cond.quadros - 1)));
      const hh = Math.max(24, ALTURA_CORPO * 0.9) * ZOOM;
      const ww = hh * (L / tira.height);
      comp(buf, W, H, Math.round(cx - ww / 2), Math.round(cy - hh / 2), tira.rgba, tira.width, f * L, 0, L, tira.height, Math.round(ww), Math.round(hh), op);
    }
    linha++;
  }
}

const destino = isAbsolute(saida) ? saida : join(RAIZ, saida);
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, png(W, H, buf));
console.log(`${especie} -> ${saida} (${W}x${H})`);
console.log(`Blocos, de cima pra baixo: ${CONDICOES.map((c) => c.nome).join(', ')}.`);
console.log(`Dentro de cada bloco, uma linha por opacidade: ${OPACIDADES.join(', ')} (0 = so a tinta, o estado anterior).`);
