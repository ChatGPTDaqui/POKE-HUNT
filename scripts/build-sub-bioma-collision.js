// Deriva grade de colisao + ponto de spawn A PARTIR DA ARTE de fundo, usando
// referencias pintadas a mao pelo usuario (scripts/body-block-refs/<arte>.png).
//
// ---------------------------------------------------------------------------
// POR QUE A CHAVE E A ARTE, E NAO O SUB-BIOMA
// ---------------------------------------------------------------------------
// Ate a leva 2026-08-18 esta tabela era indexada por CHAVE DE SUB-BIOMA
// ('forest', 'meadow', ...). Isso tinha um furo silencioso: quem decide o
// desenho na tela e `render/renderer.ts`, com
// `SUB_BIOMA_POR_CHAVE[chave]?.sub.bg || mapDef.bg` — ou seja, ARTE. Toda
// hunt que nao passa pelo sistema de salas (Modo Pesadelo, BOSS, Campeao
// Lance, treino, e qualquer conteudo futuro) desenha a arte do BIOMA e nunca
// tem `sala.chave` nenhuma pra casar aqui, entao rodava sem body-block
// nenhum: os POKE atravessavam predio, agua e parede que a MESMA imagem
// bloqueia na hunt normal. Nao dava erro, so parecia "o Pesadelo nao tem
// wall block".
//
// A regra agora e a que o usuario pediu: o walk-block e propriedade do
// DESENHO. Sub-bioma com arte propria herda a grade dela; sub-bioma sem arte
// propria herda a do bioma (a mesma imagem que ele mostra); hunt sem salas
// herda a da arte que ela mostra. Ninguem precisa lembrar de cadastrar uma
// sala nova em lugar nenhum — se a imagem tem referencia pintada, a grade
// vem junto. `data/maps.ts#mapDefParaSala` faz essa resolucao.
//
// ---------------------------------------------------------------------------
// DUAS CONVENCOES DE COR + DUAS FONTES DE SPAWN
// ---------------------------------------------------------------------------
// `modo` (o que a cor significa):
//   'vermelho_bloqueia' (so abismo.png, a 1a rodada):
//     VERMELHO = area onde NAO se anda; e a UNICA cor que bloqueia. Todo o
//     resto e andavel, inclusive o lilas (ali era guia visual decorativo).
//   'rosa_anda' (todas as demais — spec do usuario: "pintei de lilas/rosa o
//   UNICO lugar onde pokemons podem spawnar e transitar"):
//     ROSA/LILAS = UNICA area andavel. Todo o resto e bloqueado.
//
// `spawn` (de onde sai o ponto de nascimento do jogador):
//   'amarelo': o usuario pintou um CIRCULO AMARELO deliberado. Usamos o
//     MAIOR BLOB CONTIGUO de amarelo, nunca o centroide global — varias
//     artes tem amarelo incidental espalhado (cogumelo, flor, lampada,
//     lava), e a media de "todo pixel amarelo da imagem" cai num ponto que
//     nao existe. Um blob de milhares de pixels vizinhos so pode ser
//     pintura.
//   'centroide-rosa': sem marcador dedicado — nasce no centroide da propria
//     area rosa (a unica andavel naquele modo).
//
// A conversao dos .jpg/.png originais ("POKE/Assets/hunt background body
// block/") pra .png aqui e por System.Drawing no PowerShell, sem reescala:
// a referencia PRECISA continuar pixel-alinhada com a arte real, senao a
// grade nao bate com o que e desenhado.
//
// Precisa espelhar EXATAMENTE a transformacao mundo<->imagem de
// render/sprites.ts#drawMapBackground (HUNT_BG_TILE_SCALE,
// HUNT_BG_COVERAGE_MARGIN, ancora pelo centro do mapa). Rodar com:
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
const MAP_CX = MAP_BOUNDS.width / 2;
const MAP_CY = MAP_BOUNDS.height / 2;

// Vermelho saturado (amostrado no arquivo real: ~[227,24,44]).
function isRed(r, g, b) {
  return r > 120 && r > g * 1.5 && r > b * 1.5;
}
// Amarelo do marcador de spawn (amostrado: ~[255,222,0]).
function isYellow(r, g, b) {
  return r > 180 && g > 180 && b < 100;
}
// Rosa/lilas saturado (amostrado nos arquivos reais: ~[255,115,255] — pico
// em R e B, G bem mais baixo que os dois). Distinto de vermelho puro (isRed:
// B tambem baixo) e do magenta/roxo incidental da arte (cogumelo, flor,
// neon), que nao chega tao alto nos dois canais ao mesmo tempo.
function isPink(r, g, b) {
  return r > 180 && b > 150 && g < r - 60 && g < b - 60;
}
// Maioria simples: a celula de borda do traco vermelho cai pro lado seguro
// (bloqueada) sozinha.
const RED_CELL_RATIO = 0.5;

// Quanto de uma celula (40px de mundo = 50px de imagem) precisa estar pintada
// de rosa pra ela ser andavel.
//
// ERA 0.5 e ISSO QUEBRAVA AS ARTES URBANAS. Rua de cidade tem cerca de UMA
// celula de largura, entao qualquer estreitamento derrubava a celula abaixo
// da maioria e CORTAVA a malha em pedacos; o passo de poda (que remove o que
// nao conecta ao spawn) entao apagava tudo do outro lado do corte. Medido nas
// 29 referencias, em celulas podadas por desconexao:
//
//   ratio | metropolis | town-night | ice-cave
//   0.5   |    116     |    224     |    35
//   0.4   |      4     |    229     |    38
//   0.3   |      1     |      0     |     0
//   0.2   |      2     |      0     |     0
//
// 0.3 e o joelho da curva: resolve a fragmentacao inteira e 0.2 nao conserta
// mais nada, so afrouxa parede. Custo aceito e conhecido: as 18 referencias
// da leva anterior tambem ficam um pouco mais permissivas (beach 66%->71%,
// forest 34%->40% de area andavel) — uma celula 30% pintada agora passa, e o
// POKE pode encostar ate ~28px dentro do que a arte mostra como parede. Vale
// menos que ter metade do mapa inalcancavel.
//
// `PINK_RATIO` no ambiente sobrescreve, so pra repetir essa medicao.
const PINK_CELL_RATIO = Number(process.env.PINK_RATIO || 0.3);

const refDir = path.join(__dirname, 'body-block-refs');
const bgDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds');
const outFile = path.join(__dirname, '..', 'src', 'data', 'generated', 'subBiomaCollision.generated.ts');

// referencia pintada -> arte real que ela cobre. A arte e a CHAVE do
// resultado: quem usa a imagem herda a grade, seja sub-bioma com arte
// propria, sub-bioma sem arte (herda a do bioma) ou hunt sem salas.
const MANIFESTO = {
  'abismo.png': { bg: 'abyss.jpg', modo: 'vermelho_bloqueia', spawn: 'amarelo' },
  'meadow.png': { bg: 'meadow.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'desert.png': { bg: 'desert.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'badlands.png': { bg: 'badlands.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'burnt-forest.png': { bg: 'burnt-forest.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'tall-grass.png': { bg: 'tall-grass.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'forest.png': { bg: 'forest.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'industrial.png': { bg: 'industrial.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'sea.png': { bg: 'sea.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'ice-mountain.png': { bg: 'ice-mountain.png', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'mountain.png': { bg: 'mountain.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'construction-site.png': { bg: 'construction-site.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'swamp.png': { bg: 'swamp.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'plains.png': { bg: 'plains.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'beach.png': { bg: 'beach.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'ruins.png': { bg: 'ruins.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'jungle.png': { bg: 'jungle.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  'temple.png': { bg: 'temple.png', modo: 'rosa_anda', spawn: 'centroide-rosa' },
  // Pintada junto com as 17 acima mas nunca cadastrada — a sala 'cave' ficou
  // sem grade por esquecimento, nao por decisao. Sem marcador amarelo (a
  // arte e lava: amarelo incidental demais pra confiar num blob).
  'cave-volcanic.png': { bg: 'cave-volcanic.jpg', modo: 'rosa_anda', spawn: 'centroide-rosa' },

  // Leva 2026-08-18: 10 referencias novas, todas com circulo amarelo de
  // spawn pintado.
  'ice-cave.png': { bg: 'ice-cave.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'fairy-cave.png': { bg: 'fairy-cave.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'island.png': { bg: 'island.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'lake.png': { bg: 'lake.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'metropolis.png': { bg: 'metropolis.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'slum.png': { bg: 'slum.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'wasteland.png': { bg: 'wasteland.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'town-night.png': { bg: 'town-night.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'town.png': { bg: 'town.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
  'volcano.png': { bg: 'volcano.jpg', modo: 'rosa_anda', spawn: 'amarelo' },
};

const cols = Math.ceil(MAP_BOUNDS.width / CELL_SIZE);
const rows = Math.ceil(MAP_BOUNDS.height / CELL_SIZE);

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
  return {
    escala,
    originX: MAP_CX - (imgWidth * escala) / 2,
    originY: MAP_CY - (imgHeight * escala) / 2,
  };
}

// Varre numa grade reduzida porque a imagem e 2048^2 e o marcador tem raio de
// dezenas de pixels — nao precisa de resolucao cheia, e a reducao mantem o
// flood fill barato.
const BLOB_STRIDE = 4;

/**
 * Centroide do MAIOR blob CONTIGUO da cor dada, em coordenadas de imagem, com
 * o tamanho dele em pixels — e o tamanho que separa pintura deliberada de
 * ruido da propria arte.
 */
function maiorBlob(width, height, rgba, testeDeCor) {
  const gw = Math.ceil(width / BLOB_STRIDE);
  const gh = Math.ceil(height / BLOB_STRIDE);
  const marcado = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = (gy * BLOB_STRIDE * width + gx * BLOB_STRIDE) * 4;
      if (rgba[i + 3] >= 10 && testeDeCor(rgba[i], rgba[i + 1], rgba[i + 2])) marcado[gy * gw + gx] = 1;
    }
  }
  const visto = new Uint8Array(gw * gh);
  let melhor = null;
  for (let inicio = 0; inicio < gw * gh; inicio++) {
    if (!marcado[inicio] || visto[inicio]) continue;
    const pilha = [inicio];
    visto[inicio] = 1;
    let n = 0, somaX = 0, somaY = 0;
    while (pilha.length) {
      const c = pilha.pop();
      const cx = c % gw, cy = (c / gw) | 0;
      n++; somaX += cx; somaY += cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const k = ny * gw + nx;
        if (marcado[k] && !visto[k]) { visto[k] = 1; pilha.push(k); }
      }
    }
    if (!melhor || n > melhor.n) melhor = { x: (somaX / n) * BLOB_STRIDE, y: (somaY / n) * BLOB_STRIDE, n };
  }
  return melhor && { x: melhor.x, y: melhor.y, pixels: melhor.n * BLOB_STRIDE * BLOB_STRIDE };
}

/** Centroide de TODOS os pixels da cor — usado pela area rosa, que e uma so. */
function centroide(width, height, rgba, testeDeCor) {
  let somaX = 0, somaY = 0, n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 10) continue;
      if (testeDeCor(rgba[i], rgba[i + 1], rgba[i + 2])) { somaX += x; somaY += y; n++; }
    }
  }
  return n > 0 ? { x: somaX / n, y: somaY / n, n } : null;
}

// Um blob amarelo menor que isto e ruido da propria arte (flor, lampada,
// reflexo), nao o circulo que o usuario pintou — os circulos reais medem de
// 2200 a 4700 px nesta leva, e o maior ruido medido numa referencia SEM
// marcador (meadow.png) fica na casa das centenas.
const MIN_PIXELS_DO_MARCADOR = 1200;

const resultados = {};
const avisos = [];

for (const [refFile, { bg, modo, spawn }] of Object.entries(MANIFESTO)) {
  const refPath = path.join(refDir, refFile);
  const bgPath = path.join(bgDir, bg);
  if (!fs.existsSync(refPath)) { console.warn(`Pulando ${refFile}: referencia nao encontrada`); continue; }
  if (!fs.existsSync(bgPath)) { console.warn(`Pulando ${refFile}: arte real ${bg} nao encontrada`); continue; }

  const { width, height, rgba } = decodePng(fs.readFileSync(refPath));
  const { escala, originX, originY } = transformFor(width, height);
  const paraMundo = (ix, iy) => ({ x: originX + ix * escala, y: originY + iy * escala });
  const dentroDoMapa = (p) => p.x >= 0 && p.x <= MAP_BOUNDS.width && p.y >= 0 && p.y <= MAP_BOUNDS.height;

  // 1) Grade de colisao. Criterio invertido por modo; fora da imagem bloqueia
  //    nos dois.
  const rowStrings = [];
  let walkableCount = 0;
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      let matchSamples = 0, samples = 0;
      for (let sy = 0; sy < SAMPLE_STRIDE; sy++) {
        for (let sx = 0; sx < SAMPLE_STRIDE; sx++) {
          const wx = col * CELL_SIZE + ((sx + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const wy = row * CELL_SIZE + ((sy + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const ix = Math.round((wx - originX) / escala);
          const iy = Math.round((wy - originY) / escala);
          samples++;
          if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
            // Fora da imagem: bloqueado nos dois modos. No modo vermelho isso
            // e "conta como vermelho"; no modo rosa e simplesmente "nao e
            // rosa", que ja bloqueia por ausencia.
            if (modo !== 'rosa_anda') matchSamples++;
            continue;
          }
          const idx = (iy * width + ix) * 4;
          const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
          if (modo === 'rosa_anda') {
            if (alpha >= 10 && isPink(r, g, b)) matchSamples++;
          } else if (alpha < 10 || isRed(r, g, b)) {
            matchSamples++;
          }
        }
      }
      const ratio = samples > 0 ? matchSamples / samples : 0;
      const walkable = modo === 'rosa_anda' ? ratio >= PINK_CELL_RATIO : ratio < RED_CELL_RATIO;
      if (walkable) walkableCount++;
      line += walkable ? '0' : '1';
    }
    rowStrings.push(line);
  }
  if (walkableCount === 0) {
    throw new Error(`${refFile}: nenhuma celula andavel — nada pintado dentro da janela visivel do mapa.`);
  }

  // 2) Ponto de spawn. O marcador amarelo so vale se for um blob grande o
  //    bastante pra ser pintura E cair dentro do mapa: o usuario pinta na
  //    imagem inteira (2048^2), mas so a faixa central dela vira mundo (o
  //    aviso abaixo diz qual faixa e). Marcador invalido cai no centroide
  //    rosa, que e sempre uma area de verdade.
  const areaRosa = centroide(width, height, rgba, isPink);
  let spawnImg = null;
  let origemDoSpawn = 'centroide rosa';
  if (spawn === 'amarelo') {
    const blob = maiorBlob(width, height, rgba, isYellow);
    const mundo = blob && paraMundo(blob.x, blob.y);
    if (!blob || blob.pixels < MIN_PIXELS_DO_MARCADOR) {
      avisos.push(`${refFile}: marcador amarelo ausente ou pequeno demais (${blob ? blob.pixels : 0}px < ${MIN_PIXELS_DO_MARCADOR}px) — caiu no centroide da area rosa.`);
    } else if (!dentroDoMapa(mundo)) {
      avisos.push(
        `${refFile}: circulo amarelo em img(${blob.x | 0},${blob.y | 0}) cai FORA do mundo — daria (${mundo.x.toFixed(0)},${mundo.y.toFixed(0)}) ` +
        `num mapa de ${MAP_BOUNDS.width}x${MAP_BOUNDS.height}. Caiu no centroide da area rosa. ` +
        `So o recorte x[${Math.round((0 - originX) / escala)}..${Math.round((MAP_BOUNDS.width - originX) / escala)}] ` +
        `y[${Math.round((0 - originY) / escala)}..${Math.round((MAP_BOUNDS.height - originY) / escala)}] da imagem vira mundo.`,
      );
    } else {
      spawnImg = blob;
      origemDoSpawn = 'amarelo';
    }
  }
  if (!spawnImg) {
    if (!areaRosa) throw new Error(`${refFile}: sem marcador amarelo valido e sem area rosa pra cair de volta.`);
    spawnImg = areaRosa;
  }
  let { x: spawnWorldX, y: spawnWorldY } = paraMundo(spawnImg.x, spawnImg.y);

  // 3) Snap: o ponto acima e um centroide, entao pode cair numa reentrancia
  //    bloqueada do proprio traco (ou fora do retangulo). Busca a celula
  //    andavel mais proxima em espiral quadrada — mantem a intencao (o mais
  //    perto possivel do que o usuario marcou) sem travar o build.
  const celulaValida = (c, r) => r >= 0 && r < rows && c >= 0 && c < cols && rowStrings[r][c] === '0';
  let spawnCol = Math.floor(spawnWorldX / CELL_SIZE);
  let spawnRow = Math.floor(spawnWorldY / CELL_SIZE);
  if (!celulaValida(spawnCol, spawnRow)) {
    let achou = null;
    for (let radius = 1; radius <= Math.max(cols, rows) && !achou; radius++) {
      for (let dr = -radius; dr <= radius && !achou; dr++) {
        for (let dc = -radius; dc <= radius && !achou; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          if (celulaValida(spawnCol + dc, spawnRow + dr)) achou = { c: spawnCol + dc, r: spawnRow + dr };
        }
      }
    }
    if (!achou) throw new Error(`${refFile}: nenhuma celula andavel perto do ponto de spawn.`);
    spawnCol = achou.c; spawnRow = achou.r;
  }
  spawnWorldX = spawnCol * CELL_SIZE + CELL_SIZE / 2;
  spawnWorldY = spawnRow * CELL_SIZE + CELL_SIZE / 2;

  // 4) BFS de conectividade a partir do spawn, com a MESMA adjacencia do
  //    pathfinder real (core/pathfinding.ts): 8 direcoes, mas nunca cortando
  //    a quina entre dois vizinhos ortogonais bloqueados. Bolsao pintado que
  //    nao conecta ao spawn NUNCA e alcancavel de verdade, mas
  //    `randomSpawnPoint`/o alvo mais proximo ainda o tratariam como andavel
  //    e poriam inimigo la dentro — o jogador travava perseguindo pra sempre
  //    o unico inimigo que nunca alcancaria (bug real, achado ao vivo).
  //    Virar bloqueada aqui resolve pra TODO consumidor de uma vez.
  const bloqueada = (c, r) => r < 0 || r >= rows || c < 0 || c >= cols || rowStrings[r][c] === '1';
  const visto = new Set([`${spawnCol},${spawnRow}`]);
  const fila = [[spawnCol, spawnRow]];
  while (fila.length) {
    const [c, r] = fila.shift();
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nc = c + dc, nr = r + dr, key = `${nc},${nr}`;
      if (visto.has(key) || bloqueada(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (bloqueada(c + dc, r) || bloqueada(c, r + dr))) continue;
      visto.add(key);
      fila.push([nc, nr]);
    }
  }
  let podadas = 0;
  for (let row = 0; row < rows; row++) {
    let linhaNova = '';
    for (let col = 0; col < cols; col++) {
      const manter = rowStrings[row][col] === '0' && visto.has(`${col},${row}`);
      if (rowStrings[row][col] === '0' && !manter) podadas++;
      linhaNova += manter ? '0' : '1';
    }
    rowStrings[row] = linhaNova;
  }
  const walkableFinal = walkableCount - podadas;
  const pct = ((walkableFinal / (cols * rows)) * 100).toFixed(0);
  console.log(
    `${bg.padEnd(24)} ${String(walkableFinal).padStart(4)}/${cols * rows} andaveis (${pct.padStart(2)}%), ` +
    `${String(podadas).padStart(3)} isoladas podadas, spawn (${spawnWorldX},${spawnWorldY}) [${origemDoSpawn}]`,
  );

  const presos = SHARED_SPAWN_POINTS.filter((p) => rowStrings[Math.floor(p.y / CELL_SIZE)][Math.floor(p.x / CELL_SIZE)] === '1');
  if (presos.length > 0) {
    avisos.push(
      `${refFile}: ${presos.length}/6 pontos de spawn de inimigo compartilhados (data/biomas.ts#GEOMETRIA.spawnPoints) caem em area bloqueada. ` +
      'Sao os mesmos 6 pontos de TODA hunt; inimigo que nascer la e reposicionado pro ponto andavel mais proximo em runtime.',
    );
  }

  resultados[`assets/hunt-backgrounds/${bg}`] = { grid: rowStrings, spawnPoint: { x: spawnWorldX, y: spawnWorldY } };
}

if (avisos.length) {
  console.log('\nAVISOS:');
  for (const a of avisos) console.log(`  - ${a}`);
}

const header = `// AUTO-GERADO por \`node scripts/build-sub-bioma-collision.js\` a partir das
// referencias pintadas a mao em scripts/body-block-refs/*.png.
//
// A CHAVE E O CAMINHO DA ARTE DE FUNDO, nao a chave do sub-bioma: o
// walk-block e propriedade do DESENHO, entao quem mostra a imagem herda a
// grade — sub-bioma com arte propria, sub-bioma sem arte (que mostra a do
// bioma) e hunt sem salas (Modo Pesadelo, BOSS, treino) igualmente. Ver o
// cabecalho do script pro bug que essa mudanca de chave corrigiu.
//
// Nao editar a mao — rode o script de novo apos repintar uma referencia.
export interface ColisaoPintada {
  grid: string[];
  spawnPoint: { x: number; y: number };
}

export const COLISAO_POR_ARTE: Record<string, ColisaoPintada> = ${JSON.stringify(resultados, null, 2)};
`;
fs.writeFileSync(outFile, header);
console.log(`\nEscrito ${outFile} (${Object.keys(resultados).length} artes)`);
