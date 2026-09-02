// Desenha as tiras de efeito NO TAMANHO DE JOGO, lado a lado com um disco do
// tamanho de um POKE, sobre o fundo real de uma hunt.
//
// Existe porque `conferir-direcao-vfx.mjs` responde "quanto" e nao "o que": ele
// diz que o FIRE aparece com 143px e o FLYING com 51, mas nao mostra que um e
// um jato comprido que atravessa o atacante e o outro e uma coluna vertical. As
// duas decisoes desta leva — girar ou nao girar, e qual `escala` — dependem de
// olhar a forma, e julgar em folha de contato sobre fundo cinza ja aprovou duas
// artes invisiveis em jogo neste projeto.
//
// Sai em assets/../scripts/body-block-refs/_conferencia/vfx/ (mesma pasta de
// diagnostico do walk-block, ignorada pelo git).
//
//   node scripts/conferir-vfx-visual.mjs            todas, contato unico
//   node scripts/conferir-vfx-visual.mjs fire dark  so essas, uma por arquivo
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { decodePng } = require('./lib/png.js');
const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const SAIDA = join(RAIZ, 'scripts', 'body-block-refs', '_conferencia', 'vfx');

// Lidas de render/sprites.ts, nao copiadas: numero copiado envelhece calado, e
// era o proprio caso desta leva — a escala base mudou de 1.6 pra 1.05.
//
// A REGEX VAI EM LITERAL, e nao montada com string (PH-409). Ela ja foi
// `new RegExp('const ' + nome + '\s*=\s*([\d.]+)')`, e dentro de aspas simples
// `\s` nao e a classe de espaco: e a letra `s`. O que chegava ao RegExp era
// `const NOME s*=s*([d.]+)`, que nao casa com linha nenhuma do fonte — entao
// esta funcao devolvia o `padrao` SEMPRE, e a conferencia media contra o numero
// copiado que ela existe pra nao usar. `oxlint` avisava (`no-useless-escape`) e
// o aviso vinha sendo lido como estilo.
function constanteDoDesenho(nome, padrao) {
  const src = readFileSync(join(RAIZ, 'src', 'render', 'sprites.ts'), 'utf8');
  const m = new RegExp(`const ${nome}\\s*=\\s*([\\d.]+)`).exec(src);
  if (!m) {
    // Alto e claro: cair no padrao significa que a conferencia deixou de medir o
    // codigo. Silenciar aqui e como o defeito passou despercebido.
    console.warn(`  AVISO: ${nome} nao encontrada em render/sprites.ts — usando o padrao ${padrao}`);
    return padrao;
  }
  return Number(m[1]);
}
const IMPACT_BASE_SIZE = constanteDoDesenho('IMPACT_BASE_SIZE', 44);
const ESCALA_VFX_SINGLE = constanteDoDesenho('ESCALA_VFX_SINGLE', 1.05);
const RECUO_DO_IMPACTO = constanteDoDesenho('RECUO_DO_IMPACTO', 8);
// Raio de entidade em engine/entity.ts fica em 14-15.
const POKE_RAIO = 14.5;
// O combate acontece a esta distancia: raio 14 + raio 15 + padding 10.
const ALCANCE = 39;

const ZOOM = 3;          // px de imagem por px de mundo
const QUADROS_MOSTRADOS = 5;
const CELULA_W = 260, CELULA_H = 120;   // em px de mundo
const COLUNAS = 2;

const LINHA = String.fromCharCode(10);

function tirasCadastradas() {
  const src = readFileSync(join(RAIZ, 'src', 'data', 'vfxTiras.ts'), 'utf8');
  const saida = [];
  const re = /(\w+):\s*\{\s*url:\s*`\$\{(RAIZ|RAIZ_STATUS)\}\/([\w-]+\.png)`,\s*quadros:\s*(\d+)([^}]*)/g;
  for (const m of src.matchAll(re)) {
    if (m[2] !== 'RAIZ') continue; // só o lote por tipo; status é outra coisa
    // Tira COMENTARIO antes de procurar o campo: o bloco entre `quadros:` e o
    // fim da entrada tem justificativa em prosa, e a justificativa cita os
    // proprios valores ("a `escala: 1.15` que estava aqui foi posta a olho").
    // Sem isto o medidor lia o comentario e reportava um valor que o codigo
    // nao tem mais — errando sobre o campo que ele existe pra auditar.
    const corpo = (m[5] ?? '').split(LINHA).filter((l) => !l.trim().startsWith('//')).join(LINHA);
    const escala = /escala:\s*([\d.]+)/.exec(corpo);
    const direcional = /direcional:\s*\{\s*anguloBaseGraus:\s*(-?[\d.]+)/.exec(corpo);
    const rec = /recorteX:\s*([\d.]+)/.exec(corpo);
    const anc = /ancoraX:\s*([\d.]+)/.exec(corpo);
    saida.push({
      nome: m[1],
      arquivo: join('assets', 'move-vfx', 'tiras', m[3]),
      quadros: Number(m[4]),
      escala: escala ? Number(escala[1]) : 1,
      anguloBase: direcional ? Number(direcional[1]) : null,
      recorteX: rec ? Number(rec[1]) : 1,
      ancoraX: anc ? Number(anc[1]) : 0.5,
    });
  }
  return saida;
}

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

/** Fundo escuro de hunt, para julgar contraste — nunca cinza neutro. */
function fundo(buf, W, H) {
  for (let i = 0; i < W * H; i++) {
    const y = Math.floor(i / W);
    const t = (y / H) * 20;
    buf[i * 4] = 26 + t; buf[i * 4 + 1] = 30 + t; buf[i * 4 + 2] = 24 + t; buf[i * 4 + 3] = 255;
  }
}

function comporSobre(dst, W, H, px, py, src, sw, sh, sx0, alvoW, alvoH, srcW) {
  for (let dy = 0; dy < alvoH; dy++) {
    for (let dx = 0; dx < alvoW; dx++) {
      const ix = sx0 + Math.floor((dx / alvoW) * sw);
      const iy = Math.floor((dy / alvoH) * sh);
      const si = (iy * srcW + ix) * 4;
      const a = src[si + 3] / 255;
      if (a <= 0.02) continue;
      const X = px + dx, Y = py + dy;
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const di = (Y * W + X) * 4;
      for (let c = 0; c < 3; c++) dst[di + c] = Math.round(dst[di + c] * (1 - a) + src[si + c] * a);
    }
  }
}

function disco(dst, W, H, cx, cy, r, cor) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const X = Math.round(cx + x), Y = Math.round(cy + y);
      if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const i = (Y * W + X) * 4;
      dst[i] = cor[0]; dst[i + 1] = cor[1]; dst[i + 2] = cor[2];
    }
  }
}

function linha(dst, W, H, x0, y0, x1, y1, cor) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const X = Math.round(x0 + ((x1 - x0) * i) / n);
    const Y = Math.round(y0 + ((y1 - y0) * i) / n);
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const k = (Y * W + X) * 4;
    dst[k] = cor[0]; dst[k + 1] = cor[1]; dst[k + 2] = cor[2];
  }
}

mkdirSync(SAIDA, { recursive: true });
// Um argumento com "@" e um arquivo AVULSO (caminho@quadros): serve pra julgar
// candidato a arte nova antes de cadastrar, na mesma geometria de combate em
// que a arte atual e julgada. Sem isso a escolha volta a ser feita em folha de
// contato, que ja aprovou arte invisivel e arte gigante neste projeto.
const args = process.argv.slice(2);
const avulsos = args.filter((a) => a.includes('@')).map((a) => {
  const corte = a.lastIndexOf('@');
  const caminho = a.slice(0, corte);
  return {
    nome: caminho.split(/[\\/]/).pop().replace(/\.png$/i, ''),
    arquivo: caminho, quadros: Number(a.slice(corte + 1)), escala: 1, anguloBase: null,
  };
});
const alvos = args.filter((a) => !a.includes("@")).map((a) => a.toUpperCase());
const tiras = avulsos.length
  ? avulsos
  : tirasCadastradas().filter((t) => !alvos.length || alvos.includes(t.nome));

const linhasDeGrade = Math.ceil(tiras.length / COLUNAS);
const W = CELULA_W * COLUNAS * ZOOM;
const H = CELULA_H * linhasDeGrade * ZOOM;
const saida = Buffer.alloc(W * H * 4);
fundo(saida, W, H);

for (const [idx, tira] of tiras.entries()) {
  const col = idx % COLUNAS, row = Math.floor(idx / COLUNAS);
  const ox = col * CELULA_W * ZOOM;
  const oy = row * CELULA_H * ZOOM;

  // Avulso vem com caminho absoluto; cadastrado vem relativo a raiz.
  const caminho = isAbsolute(tira.arquivo) ? tira.arquivo : join(RAIZ, tira.arquivo);
  const { width, height, rgba } = decodePng(readFileSync(caminho));
  const sw = Math.floor(width / tira.quadros);
  const alturaMundo = IMPACT_BASE_SIZE * ESCALA_VFX_SINGLE * tira.escala;
  const larguraMundo = alturaMundo * (sw / height);

  // Linha de base: o ATACANTE na esquerda, o ALVO a `ALCANCE` dele. É a
  // geometria real do combate — sem ela dá para achar que um jato de 150px cabe.
  const baseY = oy + (CELULA_H / 2) * ZOOM;
  const atacanteX = ox + 26 * ZOOM;
  const alvoX = atacanteX + ALCANCE * ZOOM;
  disco(saida, W, H, atacanteX, baseY, POKE_RAIO * ZOOM, [70, 90, 130]);
  disco(saida, W, H, alvoX, baseY, POKE_RAIO * ZOOM, [130, 70, 70]);

  // Quadros amostrados ao longo da animação, desenhados centrados no ALVO —
  // que é onde `drawImpactBurst` desenha de verdade.
  for (let k = 0; k < QUADROS_MOSTRADOS; k++) {
    const f = Math.min(tira.quadros - 1, Math.round((k / (QUADROS_MOSTRADOS - 1)) * (tira.quadros - 1)));
    const px = ox + (100 + k * 32) * ZOOM;
    comporSobre(
      saida, W, H,
      Math.round(px - (larguraMundo * ZOOM) / 2), Math.round(baseY - (alturaMundo * ZOOM) / 2),
      rgba, sw, height, f * sw,
      Math.round(larguraMundo * ZOOM), Math.round(alturaMundo * ZOOM), width,
    );
    disco(saida, W, H, px, baseY + 44 * ZOOM, 2 * ZOOM, [90, 90, 90]);
  }

  // Um quadro no lugar EXATO do jogo, com as duas correções aplicadas — é a
  // única parte desta imagem que responde "isso cabe no combate?".
  //
  //   `recorteX`  só a fatia do lado do impacto é desenhada, e a âncora é
  //               reexpressa dentro dela (mesma conta de orientacaoDaTira).
  //   recuo       arte que NÃO gira encosta na face do alvo virada pro
  //               atacante, em vez de ficar no centro exato dele.
  const recorte = tira.recorteX ?? 1;
  const larguraFatia = larguraMundo * recorte;
  const swFatia = Math.max(1, Math.round(sw * recorte));
  const sxFatia = Math.floor(tira.quadros / 2) * sw + (sw - swFatia);
  const gira = tira.anguloBase != null;
  const ancoraNaFatia = gira
    ? Math.min(1, Math.max(0, ((tira.ancoraX ?? 0.5) - (1 - recorte)) / recorte))
    : 0.5;
  // O atacante está à esquerda, então o recuo é para -x. Sem girar a arte aqui:
  // esta conferência olha forma e tamanho, e a rotação é o que já foi medido na
  // tabela de direção.
  const recuo = gira ? 0 : RECUO_DO_IMPACTO;
  comporSobre(
    saida, W, H,
    Math.round(alvoX - recuo * ZOOM - larguraFatia * ZOOM * ancoraNaFatia),
    Math.round(baseY - (alturaMundo * ZOOM) / 2),
    rgba, swFatia, height, sxFatia,
    Math.round(larguraFatia * ZOOM), Math.round(alturaMundo * ZOOM), width,
  );

  // Régua: barra do tamanho do POKE logo abaixo da linha de base.
  linha(saida, W, H, atacanteX - POKE_RAIO * ZOOM, baseY + 30 * ZOOM, atacanteX + POKE_RAIO * ZOOM, baseY + 30 * ZOOM, [255, 255, 0]);
  // Moldura da célula.
  linha(saida, W, H, ox, oy, ox + CELULA_W * ZOOM - 1, oy, [60, 60, 60]);
  linha(saida, W, H, ox, oy, ox, oy + CELULA_H * ZOOM - 1, [60, 60, 60]);
}

const nome = avulsos.length ? 'vfx-candidatos.png' : alvos.length ? `vfx-${alvos.join('-').toLowerCase()}.png` : 'vfx-contato.png';
writeFileSync(join(SAIDA, nome), png(W, H, saida));
console.log(`${tiras.length} tiras -> _conferencia/vfx/${nome}`);
console.log('Disco azul = atacante, vermelho = alvo, distancia real de combate (39px de mundo).');
console.log('A barra amarela mede um POKE. Efeito maior que ela em varias vezes esta fora de escala.');
