// Deriva grade de colisao + ponto de spawn POR SUB-BIOMA a partir de
// referencias pintadas a mao pelo usuario
// (scripts/body-block-refs/<slug>.png), diferente do build-collision-
// grids.js antigo (heuristica de pixel escuro/agua) e do build-water-
// collision-mask.js (mascara por bioma inteiro, nao por sala).
//
// As referencias moraram em assets/hunt-backgrounds/body-block/ ate a leva
// 2026-08-16 (17 arquivos novos, 111MB): `scripts/copiar-assets.mjs` copia
// TUDO que esta debaixo de assets/ pro build publicado, e nenhum codigo em
// runtime nunca le essas referencias (so este script, uma vez, no build).
// Mudaram pra scripts/body-block-refs/ (fora da arvore que vira deploy,
// mesmo espirito de scripts/usum/ e scripts/pokerogue/ ja guardarem o
// proprio insumo do build ali do lado) pra nao inflar o site publicado com
// 111MB que o jogador nunca ve.
//
// DUAS CONVENCOES DE COR, uma por referencia (`modo` no MANIFESTO abaixo) —
// a leva 2026-08-16 trouxe 17 referencias novas com a convencao INVERTIDA da
// original, e as duas convivem porque `abismo.png` (1a rodada) ja estava
// testado e publicado com a convencao antiga:
//
//   modo 'vermelho_bloqueia' (abismo.png, original):
//     VERMELHO = area onde NAO deve andar. E a UNICA cor que bloqueia.
//     Sem vermelho = pode andar — inclui o lilas/rosa (que ali era so guia
//       visual do caminho, decorativo) e a arte original sem pintura.
//     AMARELO = marcador de spawn do jogador (centroide), obrigatorio.
//
//   modo 'rosa_anda' (as 17 novas, leva 2026-08-16 — spec do usuario:
//   "pintei de lilas/rosa o UNICO lugar onde pokemons podem spawnar e
//   transitar"):
//     ROSA/LILAS = UNICA area andavel. Tudo mais (arte original sem
//       pintura, qualquer outra cor) e bloqueado.
//     Sem marcador de spawn dedicado nestas 17 (nenhuma tem um blob amarelo
//       grande e deliberado — so ruido incidental da arte em varias, ex.
//       cogumelo/flor amarela). Spawn sai do CENTROIDE da propria area rosa.
//
// Cobertura (leva 2026-08-16): as 17 referencias novas do usuario
// (scripts/body-block-refs/{meadow,desert,badlands,burnt-forest,tall-grass,
// forest,industrial,sea,ice-mountain,mountain,construction-site,swamp,
// plains,beach,ruins,jungle,temple}.png — convertidas de .jpg/.png
// originais em "POKE/Assets/hunt background body block/pintados/", mesmo
// passo de conversao JPG->PNG do abismo.png original) cobrem 19 sub-biomas
// (contando o par abyss/space da 1a rodada). Os 14 sub-biomas restantes sem
// arte propria pintada (grass, town, seabed, lake, wasteland, cave,
// ice-cave, volcano, metropolis, slum, dojo, fairy-cave — mais os 2 do
// bioma Igneo/1 sub) ficam sem grade (fallback do circulo aberto de
// sempre), ate ganharem referencia.
//
// `forest.png` cobre TAMBEM a hunt inicial (route_46): ela usa a mesma arte
// real forest.jpg (huntSpawnOverrides.ts) mas fica FORA do sistema de salas
// (temSalas() falso pra ela), entao nunca teria `sala.chave='forest'` pra
// casar aqui — `getMap()` (data/maps.ts) faz o special-case direto.
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
// Rosa/lilas saturado (amostrado nos arquivos reais das 17 novas
// referencias: ~[255,115,255] — pico em R e B, G bem mais baixo que os
// dois). Distinto de vermelho puro (isRed acima: B baixo tambem) e do
// magenta/roxo incidental da arte (cogumelo, flor), que nao chega tao alto
// nos dois canais simultaneamente na amostragem por celula.
function isPink(r, g, b) {
  return r > 180 && b > 150 && g < r - 60 && g < b - 60;
}
// Maioria simples: celula bloqueada quando metade ou mais das amostras
// caem no vermelho — mesmo RED_CELL_RATIO do build-water-collision-mask.js
// (nao precisa do ajuste fino que o LILAC_CELL_RATIO antigo precisou: aqui
// e a AUSENCIA de vermelho que conta como andavel, entao uma celula de
// transicao/borda cai pro lado seguro sozinha).
const RED_CELL_RATIO = 0.5;
// Inverso pro modo rosa_anda: andavel so quando METADE OU MAIS das amostras
// da celula sao rosa — celula de transicao/borda do traco pintado cai pro
// lado seguro (bloqueada) sozinha, mesmo espirito do RED_CELL_RATIO.
const PINK_CELL_RATIO = 0.5;

const refDir = path.join(__dirname, 'body-block-refs');
const bgDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds');
const outFile = path.join(__dirname, '..', 'src', 'data', 'generated', 'subBiomaCollision.generated.ts');

// arquivo de referencia (body-block/<arquivo>) -> chaves de sub-bioma que
// devem usar essa grade (mais de uma quando varios subs reaproveitam a
// mesma arte real, ex. abyss+space reaproveitam abyss.jpg).
const MANIFESTO = {
  'abismo.png': { chaves: ['abyss', 'space'], bg: 'abyss.jpg', modo: 'vermelho_bloqueia' },
  'meadow.png': { chaves: ['meadow'], bg: 'meadow.jpg', modo: 'rosa_anda' },
  'desert.png': { chaves: ['desert'], bg: 'desert.jpg', modo: 'rosa_anda' },
  'badlands.png': { chaves: ['badlands'], bg: 'badlands.jpg', modo: 'rosa_anda' },
  'burnt-forest.png': { chaves: ['graveyard'], bg: 'burnt-forest.jpg', modo: 'rosa_anda' },
  'tall-grass.png': { chaves: ['tall-grass'], bg: 'tall-grass.jpg', modo: 'rosa_anda' },
  'forest.png': { chaves: ['forest'], bg: 'forest.jpg', modo: 'rosa_anda' },
  'industrial.png': { chaves: ['factory', 'power-plant', 'laboratory'], bg: 'industrial.jpg', modo: 'rosa_anda' },
  'sea.png': { chaves: ['sea'], bg: 'sea.jpg', modo: 'rosa_anda' },
  'ice-mountain.png': { chaves: ['snowy-forest'], bg: 'ice-mountain.png', modo: 'rosa_anda' },
  'mountain.png': { chaves: ['mountain'], bg: 'mountain.jpg', modo: 'rosa_anda' },
  'construction-site.png': { chaves: ['construction-site'], bg: 'construction-site.jpg', modo: 'rosa_anda' },
  'swamp.png': { chaves: ['swamp'], bg: 'swamp.jpg', modo: 'rosa_anda' },
  'plains.png': { chaves: ['plains'], bg: 'plains.jpg', modo: 'rosa_anda' },
  'beach.png': { chaves: ['beach'], bg: 'beach.jpg', modo: 'rosa_anda' },
  'ruins.png': { chaves: ['ruins'], bg: 'ruins.jpg', modo: 'rosa_anda' },
  'jungle.png': { chaves: ['jungle'], bg: 'jungle.jpg', modo: 'rosa_anda' },
  'temple.png': { chaves: ['temple'], bg: 'temple.png', modo: 'rosa_anda' },
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

for (const [refFile, { chaves, bg, modo }] of Object.entries(MANIFESTO)) {
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

  // 1) Marcador de spawn — fonte depende do modo.
  //    'vermelho_bloqueia': centroide do marcador AMARELO, obrigatorio
  //      (mesma regra desde a 1a rodada, abismo.png).
  //    'rosa_anda': sem marcador dedicado — centroide da propria area ROSA
  //      (a UNICA area andavel neste modo, entao o meio dela e sempre um
  //      ponto razoavel pra nascer; o snap-pra-celula-valida abaixo cobre o
  //      caso do centroide cair numa reentrancia bloqueada do proprio traco).
  let sumX = 0, sumY = 0, count = 0;
  const corDoMarcador = modo === 'rosa_anda' ? isPink : isYellow;
  for (let iy = 0; iy < height; iy++) {
    for (let ix = 0; ix < width; ix++) {
      const idx = (iy * width + ix) * 4;
      const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
      if (alpha < 10) continue;
      if (corDoMarcador(r, g, b)) { sumX += ix; sumY += iy; count++; }
    }
  }
  if (count === 0) {
    throw new Error(
      modo === 'rosa_anda'
        ? `${refFile}: nenhum pixel rosa/lilas encontrado — referencia sem area andavel marcada.`
        : `${refFile}: nenhum marcador amarelo de spawn encontrado.`,
    );
  }
  const markerImgX = sumX / count, markerImgY = sumY / count;
  let spawnWorldX = originX + markerImgX * escala;
  let spawnWorldY = originY + markerImgY * escala;

  // 2) Grade de colisao — criterio inverso por modo:
  //    'vermelho_bloqueia': bloqueada SO onde a MAIORIA das amostras da
  //      celula e vermelha; tudo mais (lilas decorativo ou arte original) e
  //      andavel por omissao.
  //    'rosa_anda': ANDAVEL SO onde a MAIORIA das amostras da celula e
  //      rosa/lilas; tudo mais (arte original sem pintura, qualquer outra
  //      cor) e bloqueado por omissao — exatamente invertido.
  const rowStrings = [];
  let walkableCount = 0;
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < cols; col++) {
      const wx0 = col * CELL_SIZE, wy0 = row * CELL_SIZE;
      let matchSamples = 0, samples = 0;
      for (let sy = 0; sy < SAMPLE_STRIDE; sy++) {
        for (let sx = 0; sx < SAMPLE_STRIDE; sx++) {
          const wx = wx0 + ((sx + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const wy = wy0 + ((sy + 0.5) / SAMPLE_STRIDE) * CELL_SIZE;
          const ix = Math.round((wx - originX) / escala);
          const iy = Math.round((wy - originY) / escala);
          samples++;
          if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
            // Fora da imagem: sempre bloqueado, nos dois modos.
            if (modo !== 'rosa_anda') matchSamples++; // "e vermelho" -> conta como match (bloqueia)
            continue; // modo rosa_anda: "e rosa" fica false (nao soma) -> bloqueia por ausencia de match
          }
          const idx = (iy * width + ix) * 4;
          const r = rgba[idx], g = rgba[idx + 1], b = rgba[idx + 2], alpha = rgba[idx + 3];
          const cor = alpha >= 10 && (modo === 'rosa_anda' ? isPink(r, g, b) : isRed(r, g, b));
          if (modo === 'rosa_anda') { if (cor) matchSamples++; }
          else { if (alpha < 10 || cor) matchSamples++; }
        }
      }
      const ratio = samples > 0 ? matchSamples / samples : 0;
      const walkable = modo === 'rosa_anda' ? ratio >= PINK_CELL_RATIO : ratio < RED_CELL_RATIO;
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
// referencias pintadas a mao em assets/hunt-backgrounds/body-block/*.png.
// DUAS convencoes de cor coexistem (\`modo\` por arquivo no MANIFESTO do
// proprio script): abismo.png e vermelho=bloqueia/amarelo=spawn (original);
// as 17 demais sao rosa/lilas=UNICA area andavel, tudo mais bloqueado, spawn
// no centroide da propria area rosa. Nao editar a mao — rode o script de
// novo apos repintar uma referencia. Ver o proprio script pra detalhe.
export interface SubBiomaColisao {
  grid: string[];
  spawnPoint: { x: number; y: number };
}

export const SUB_BIOMA_COLLISION: Record<string, SubBiomaColisao> = ${JSON.stringify(results, null, 2)};
`;
fs.writeFileSync(outFile, header);
console.log(`Escrito ${outFile}`);
