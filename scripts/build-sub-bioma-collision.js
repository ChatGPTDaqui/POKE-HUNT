// Deriva grade de colisao + ponto de spawn POR SUB-BIOMA a partir de
// referencias pintadas a mao pelo usuario
// (assets/hunt-backgrounds/body-block/<slug>.png), diferente do
// build-collision-grids.js antigo (heuristica de pixel escuro/agua) e do
// build-water-collision-mask.js (mascara por bioma inteiro, nao por sala).
//
// Convencao da referencia (spec do usuario, confirmada):
//   VERMELHO = area onde NAO deve andar. E a UNICA cor que bloqueia.
//   Sem vermelho = pode andar — inclui o lilas/rosa (guia visual do
//     caminho, pintado pelo usuario por cima) e a arte original sem
//     pintura nenhuma ao redor dele.
//   AMARELO = marcador de spawn do jogador (centroide).
//
// Escopo: TESTE, so o bioma Sombrio (subs 'abyss'/'space', que
// compartilham a mesma arte real assets/hunt-backgrounds/abyss.jpg — ver
// data/biomas.ts). Generalizavel: acrescentar entradas no MANIFESTO abaixo
// aplica o mesmo pipeline a outro sub-bioma, desde que exista uma
// referencia body-block/<nome>.png pixel-alinhada com a arte real dela.
//
// Precisa espelhar EXATAMENTE a transformacao mundo<->imagem de
// render/sprites.ts#drawMapBackground (HUNT_BG_TILE_SCALE,
// HUNT_BG_COVERAGE_MARGIN, ancora pelo centro do mapa) — senao a grade
// gerada nao bate com o que e desenhado na tela. Rodar com:
//   node scripts/build-sub-bioma-collision.js
'use strict';

const fs = require('fs');
const path = require('path');
const { decodePng } = require('./lib/png');

const HUNT_BG_TILE_SCALE = 0.8; // deve bater com src/render/sprites.ts
const HUNT_BG_COVERAGE_MARGIN = 1.15; // idem
const MAP_BOUNDS = { width: 1400, height: 900 }; // deve bater com GEOMETRIA.bounds (data/biomas.ts)
const CELL_SIZE = 40; // deve bater com COLLISION_GRID_CELL_SIZE (generated/collisionGrids.generated.ts)
const SAMPLE_STRIDE = 5;
// A area jogavel de QUALQUER hunt e um circulo inscrito na menor dimensao
// dos bounds (data/maps.ts#mapWalkRadius), nao o retangulo inteiro — regra
// que ja existia antes deste script, pra toda hunt. min(1400,900)/2 = 450.
const MAP_CX = MAP_BOUNDS.width / 2;
const MAP_CY = MAP_BOUNDS.height / 2;
const MAP_RADIUS = Math.min(MAP_BOUNDS.width, MAP_BOUNDS.height) / 2;

// Vermelho saturado (amostrado no arquivo real: ~[227,24,44]) — mesmo
// criterio do build-water-collision-mask.js (R domina G e B claramente).
function isYellow(r, g, b) {
  return r > 180 && g > 180 && b < 100;
}
function isRed(r, g, b) {
  return r > 120 && r > g * 1.5 && r > b * 1.5;
}
// Maioria simples: celula bloqueada quando metade ou mais das amostras
// caem no vermelho — mesmo RED_CELL_RATIO do build-water-collision-mask.js
// (nao precisa do ajuste fino que o LILAC_CELL_RATIO antigo precisou: aqui
// e a AUSENCIA de vermelho que conta como andavel, entao uma celula de
// transicao/borda cai pro lado seguro sozinha).
const RED_CELL_RATIO = 0.5;

const refDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds', 'body-block');
const bgDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds');
const outFile = path.join(__dirname, '..', 'src', 'data', 'generated', 'subBiomaCollision.generated.ts');

// arquivo de referencia (body-block/<arquivo>) -> chaves de sub-bioma que
// devem usar essa grade (mais de uma quando varios subs reaproveitam a
// mesma arte real, ex. abyss+space reaproveitam abyss.jpg).
const MANIFESTO = {
  'abismo.png': { chaves: ['abyss', 'space'], bg: 'abyss.jpg' },
};

const cols = Math.ceil(MAP_BOUNDS.width / CELL_SIZE);
const rows = Math.ceil(MAP_BOUNDS.height / CELL_SIZE);
const mapCx = MAP_BOUNDS.width / 2;
const mapCy = MAP_BOUNDS.height / 2;

const SHARED_SPAWN_POINTS = [
  { x: 500, y: 320 }, { x: 900, y: 320 }, { x: 500, y: 580 },
  { x: 900, y: 580 }, { x: 700, y: 250 }, { x: 700, y: 650 },
];

function transformFor(imgWidth, imgHeight) {
  const escalaMinima = Math.max(
    (MAP_BOUNDS.width * HUNT_BG_COVERAGE_MARGIN) / imgWidth,
    (MAP_BOUNDS.height * HUNT_BG_COVERAGE_MARGIN) / imgHeight,
  );
  const escala = Math.max(HUNT_BG_TILE_SCALE, escalaMinima);
  const iw = imgWidth * escala;
  const ih = imgHeight * escala;
  const originX = mapCx - iw / 2;
  const originY = mapCy - ih / 2;
  return { escala, originX, originY };
}

const results = {};

for (const [refFile, { chaves, bg }] of Object.entries(MANIFESTO)) {
  const refPath = path.join(refDir, refFile);
  const bgPath = path.join(bgDir, bg);
  if (!fs.existsSync(refPath)) { console.warn(`Pulando ${refFile}: referencia nao encontrada`); continue; }
  if (!fs.existsSync(bgPath)) { console.warn(`Pulando ${refFile}: arte real ${bg} nao encontrada`); continue; }

  const ref = decodePng(fs.readFileSync(refPath));
  // A referencia precisa estar pixel-alinhada com a arte real (mesma
  // transformacao mundo<->imagem) — checagem de dimensao real vem do
  // PowerShell de conversao JPG->PNG desta rodada (confirmado 2048x2048
  // nos dois arquivos); aqui so travamos que a referencia decodifica.
  const { width, height, rgba } = ref;
  const { escala, originX, originY } = transformFor(width, height);

  // 1) Centroide do marcador amarelo (spawn).
  let ySumX = 0, ySumY = 0, yCount = 0;
  for (let iy = 0; iy < height; iy++) {
    for (let ix = 0; ix < width; ix++) {
      const idx = (iy * width + ix) * 4;
      const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
      if (alpha < 10) continue;
      if (isYellow(r, g, b)) { ySumX += ix; ySumY += iy; yCount++; }
    }
  }
  if (yCount === 0) throw new Error(`${refFile}: nenhum marcador amarelo de spawn encontrado.`);
  const yImgX = ySumX / yCount, yImgY = ySumY / yCount;
  let spawnWorldX = originX + yImgX * escala;
  let spawnWorldY = originY + yImgY * escala;

  // 2) Grade de colisao: bloqueada SO onde a MAIORIA das amostras da celula
  // e vermelha — tudo mais (lilas ou arte original sem pintura) e andavel
  // por omissao (ver nota de topo do arquivo).
  const rowStrings = [];
  let walkableCount = 0;
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const wx0 = col * CELL_SIZE, wy0 = row * CELL_SIZE;
      let redSamples = 0, samples = 0;
      for (let sy = 0; sy < SAMPLE_STRIDE; sy++) {
        for (let sx = 0; sx < SAMPLE_STRIDE; sx++) {
          const wx = wx0 + ((sx + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const wy = wy0 + ((sy + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const ix = Math.round((wx - originX) / escala);
          const iy = Math.round((wy - originY) / escala);
          samples++;
          if (ix < 0 || iy < 0 || ix >= width || iy >= height) { redSamples++; continue; } // fora da imagem = bloqueado
          const idx = (iy * width + ix) * 4;
          const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
          if (alpha < 10 || isRed(r, g, b)) redSamples++;
        }
      }
      const walkable = samples > 0 && redSamples / samples < RED_CELL_RATIO;
      if (walkable) walkableCount++;
      line += walkable ? '0' : '1';
    }
    rowStrings.push(line);
  }

  function cellBlocked(wx, wy) {
    const col = Math.floor(wx / CELL_SIZE), row = Math.floor(wy / CELL_SIZE);
    if (row < 0 || row >= rowStrings.length || col < 0 || col >= rowStrings[0].length) return true;
    return rowStrings[row][col] === '1';
  }

  // O marcador amarelo pode cair fora da JANELA VISIVEL do mapa (a arte e
  // quase quadrada mas os bounds sao paisagem, corta ~45% da altura), OU
  // fora do CIRCULO JOGAVEL que toda hunt ja aplica (raio 450 do centro —
  // ver mapWalkRadius/clampToMapCircle; nada fora dele e alcancavel, entao
  // nascer la equivaleria a nascer bloqueado). Em vez de abortar, busca a
  // celula andavel E dentro do circulo mais proxima do marcador (espiral
  // quadrada crescente) e nasce ali — mantem a intencao (o mais perto
  // possivel do marcador do usuario) sem travar o build.
  const dentroDoCirculo = (wx, wy) => Math.hypot(wx - MAP_CX, wy - MAP_CY) <= MAP_RADIUS;
  const celulaValida = (c, r) => {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
    if (rowStrings[r][c] !== '0') return false;
    return dentroDoCirculo(c * CELL_SIZE + CELL_SIZE / 2, r * CELL_SIZE + CELL_SIZE / 2);
  };
  let spawnCol = Math.floor(spawnWorldX / CELL_SIZE);
  let spawnRow = Math.floor(spawnWorldY / CELL_SIZE);
  if (!celulaValida(spawnCol, spawnRow)) {
    let found = null;
    for (let radius = 1; radius <= Math.max(cols, rows) && !found; radius++) {
      for (let dr = -radius; dr <= radius && !found; dr++) {
        for (let dc = -radius; dc <= radius && !found; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue; // so o aro deste raio
          const c = spawnCol + dc, r = spawnRow + dr;
          if (celulaValida(c, r)) found = { c, r };
        }
      }
    }
    if (!found) {
      throw new Error(`${refFile}: nenhuma celula andavel DENTRO do circulo jogavel (raio ${MAP_RADIUS} do centro) encontrada perto do marcador — anel pintado vazio ali, ou area andavel inteira fora do circulo.`);
    }
    console.warn(
      `  AVISO: marcador de spawn (${spawnWorldX.toFixed(1)}, ${spawnWorldY.toFixed(1)}) caiu fora da janela ` +
      `visivel/do circulo jogavel/em celula bloqueada — realocado pra celula andavel mais proxima DENTRO do circulo (${found.c},${found.r}).`,
    );
    spawnCol = found.c;
    spawnRow = found.r;
    spawnWorldX = spawnCol * CELL_SIZE + CELL_SIZE / 2;
    spawnWorldY = spawnRow * CELL_SIZE + CELL_SIZE / 2;
  }

  // BFS de conectividade a partir do spawn: garante que o anel pintado
  // forma um caminho continuo (celula isolada por uma amostragem ruim numa
  // borda fina fecharia o anel em silencio, sem nenhum erro visivel ate
  // alguem esbarrar na parede invisivel em jogo). Mesma regra de adjacencia
  // do pathfinder real (core/pathfinding.ts): 8 direcoes, mas NUNCA corta a
  // quina entre dois vizinhos ortogonais bloqueados — usar so 4 direcoes
  // aqui reportaria fragmentacao que o jogo real nem tem (o anel conecta
  // na diagonal em varios pontos da curva).
  function blocked(c, r) {
    return r < 0 || r >= rows || c < 0 || c >= cols || rowStrings[r][c] === '1';
  }
  const startCol = Math.floor(spawnWorldX / CELL_SIZE), startRow = Math.floor(spawnWorldY / CELL_SIZE);
  const seen = new Set([`${startCol},${startRow}`]);
  const queue = [[startCol, startRow]];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr, key = `${nc},${nr}`;
      if (seen.has(key) || blocked(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (blocked(c + dc, r) || blocked(c, r + dr))) continue;
      seen.add(key);
      queue.push([nc, nr]);
    }
  }
  const reachablePct = ((seen.size / walkableCount) * 100).toFixed(1);
  if (seen.size / walkableCount < 0.8) {
    console.warn(`  AVISO: so ${reachablePct}% das celulas andaveis sao alcancaveis do spawn — o anel pode estar quebrado em algum ponto.`);
  }
  // Poda os BOLSOES ISOLADOS: uma celula pintada de lilas mas fora do
  // componente conectado ao spawn NUNCA e alcancavel de verdade (nem pelo
  // jogador, nem por A* real) — mas `randomSpawnPoint`/o alvo mais proximo
  // ainda a tratavam como "andavel" e colocavam inimigo la dentro. O
  // jogador travava perseguindo pra sempre o unico inimigo que nunca
  // conseguiria alcancar (bug real, achado ao vivo simulando 1200s: ficou
  // parado a partir dos 100s). Virar bloqueada aqui garante o mesmo em
  // TODO consumidor (spawn, targeting, pathfinding) de graca, sem precisar
  // ensinar cada um deles sobre "ilha desconectada".
  let podadas = 0;
  for (let row = 0; row < rows; row++) {
    let linhaNova = '';
    for (let col = 0; col < cols; col++) {
      const eraAndavel = rowStrings[row][col] === '0';
      const alcancavel = seen.has(`${col},${row}`);
      if (eraAndavel && !alcancavel) podadas++;
      linhaNova += (eraAndavel && alcancavel) ? '0' : '1';
    }
    rowStrings[row] = linhaNova;
  }
  const walkableFinal = walkableCount - podadas;
  console.log(`${refFile}: ${walkableFinal}/${cols * rows} celulas andaveis (${podadas} isoladas podadas), spawn OK, 100% conectado`);

  const stranded = SHARED_SPAWN_POINTS.filter((p) => cellBlocked(p.x, p.y));
  if (stranded.length > 0) {
    console.warn(
      `  AVISO: ${stranded.length}/6 pontos de spawn/wander de inimigo compartilhados caem fora do anel pintado: ` +
      `${JSON.stringify(stranded)}. Sao os mesmos 6 pontos usados por TODA hunt (data/biomas.ts#GEOMETRIA.spawnPoints) ` +
      `— fora do escopo mover aqui; inimigos que nascerem la vao ficar visualmente dentro da fenda ate vagarem pra perto do jogador.`,
    );
  }

  for (const chave of chaves) {
    results[chave] = { grid: rowStrings, spawnPoint: { x: spawnWorldX, y: spawnWorldY } };
  }
}

const header = `// AUTO-GERADO por \`node scripts/build-sub-bioma-collision.js\` a partir das
// referencias pintadas a mao em assets/hunt-backgrounds/body-block/*.png
// (lilas = andavel, amarelo = spawn, tudo mais = bloqueado). Nao editar a
// mao — rode o script de novo apos repintar uma referencia. Ver o proprio
// script pra convencao de cor e a lista de sub-biomas cobertos.
export interface SubBiomaColisao {
  grid: string[];
  spawnPoint: { x: number; y: number };
}

export const SUB_BIOMA_COLLISION: Record<string, SubBiomaColisao> = ${JSON.stringify(results, null, 2)};
`;
fs.writeFileSync(outFile, header);
console.log(`Escrito ${outFile}`);
