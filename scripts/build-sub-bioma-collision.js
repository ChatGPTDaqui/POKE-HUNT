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

// Escala de desenho da arte: 1 pixel de imagem = 0,8 unidades de mundo. Deixou
// de ser "o minimo pra cobrir 1400x900" e virou constante de verdade — o mundo
// agora e recortado DE DENTRO da arte (ver `enquadrar`), entao nunca falta
// imagem pra cobrir e nao ha mais o que esticar.
const HUNT_BG_TILE_SCALE = 0.8;

/**
 * Tamanho da celula, LIDO de `src/data/collisionConstants.ts` em vez de
 * repetido aqui.
 *
 * Era um `40` literal com um comentario pedindo "deve bater com
 * COLLISION_GRID_CELL_SIZE". Pedido nao e mecanismo: divergir os dois faz a
 * grade de colisao ser de uma resolucao e o consumidor (pathfinding,
 * `isCellBlocked`, o passo de `movementSystem`) ler outra — ou seja, o POKE
 * colide com uma parede que nao esta onde a tela mostra. O cabecalho de
 * `data/maps.ts` chama isso de "a classe de bug mais cara deste sistema", e
 * era a unica constante compartilhada que ainda dependia de alguem lembrar.
 *
 * `CELL` no ambiente sobrescreve, so pra repetir a medicao de limiar do
 * PH-94 sem editar arquivo nenhum.
 */
function lerConstante(nome) {
  const arquivo = path.join(__dirname, '..', 'src', 'data', 'collisionConstants.ts');
  const fonte = fs.readFileSync(arquivo, 'utf8');
  const m = fonte.match(new RegExp(`export const ${nome}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`nao achei ${nome} em ${arquivo}`);
  return Number(m[1]);
}
const CELL_SIZE = Number(process.env.CELL || lerConstante('COLLISION_GRID_CELL_SIZE'));

/**
 * Pegada de colisao do POKE, em unidades de mundo.
 *
 * "A pegada de colisao de um POKE e exatamente 1 caixa da grade por pedido
 * explicito do usuario" — `movementSystem.ts#canOccupy`. Enquanto a celula
 * tinha 40, a pegada e o tamanho da celula eram o MESMO numero, e o pedido
 * ficava satisfeito por acidente. Separadas, a pegada continua valendo 40 e
 * passa a ser aplicada por erosao na geracao (ver o passo 1.5).
 *
 * `PEGADA` no ambiente sobrescreve, so pra medicao.
 */
const POKE_FOOTPRINT = Number(process.env.PEGADA || lerConstante('POKE_COLLISION_FOOTPRINT'));

// Amostras por eixo dentro de uma celula (25 por celula). Independe do tamanho
// da celula de proposito: e ele que decide a GRANULARIDADE do limiar (1/25 =
// 4%), nao a resolucao da imagem. Com celula de 20 unidades de mundo (25px de
// imagem na escala 0,8) o passo entre amostras e de 5px de imagem — longe de
// sub-pixel, onde a amostragem viraria ruido.
const SAMPLE_STRIDE = 5;
// Folga em volta da area pintada. Sem ela o POKE encosta na borda do mundo no
// mesmo pixel em que encosta na parede pintada, e a leitura fica de mapa
// cortado em vez de mapa que acabou.
const MARGEM_DE_MUNDO = CELL_SIZE;

// Vermelho saturado (amostrado no arquivo real: ~[227,24,44]).
function isRed(r, g, b) {
  return r > 120 && r > g * 1.5 && r > b * 1.5;
}
// Amarelo do marcador de spawn. A tinta e CHAPADA e sempre a mesma: amostrada
// no centro dos 10 circulos desta leva, da (254,242,0) em 150+ de 189 pixels
// lidos, com o resto a um ou dois niveis de distancia.
//
// O teste ANTERIOR era "r>180 && g>180 && b<100", e isso pegava a arte: areia
// de praia, luz de poste, lava, grama seca. Numa referencia como fairy-cave o
// "amarelo" detectado cobria x[122..1976] y[502..1998] — praticamente a imagem
// inteira. O maior blob contiguo ainda costumava ser o circulo, mas isso era
// sorte, e sorte nao aguenta as referencias novas que o usuario vai pintar.
//
// Medido com o teste estrito nas 29 referencias: quem tem circulo tem UM blob
// de 2144 a 4512 px e o segundo maior fica em 0-16 px; quem nao tem circulo
// (meadow, forest, ...) nao tem blob nenhum. Separacao de duas ordens de
// grandeza — e por isso que a deteccao pode ser automatica.
function isYellow(r, g, b) {
  return r >= 235 && g >= 215 && b <= 45 && Math.abs(r - g) <= 45;
}
// Rosa/lilas saturado (amostrado nos arquivos reais: ~[255,115,255] — pico
// em R e B, G bem mais baixo que os dois). Distinto de vermelho puro (isRed:
// B tambem baixo) e do magenta/roxo incidental da arte (cogumelo, flor,
// neon), que nao chega tao alto nos dois canais ao mesmo tempo.
function isPink(r, g, b) {
  return r > 180 && b > 150 && g < r - 60 && g < b - 60;
}
// Verde do marcador de ENTRADA DO INIMIGO — a convencao nova da leva
// 2026-08-22 (dojo/dragon), irma do circulo amarelo: amarelo e por onde entra
// o POKE do jogador, verde e por onde entra todo POKE novo do outro lado.
//
// A tinta e chapada e igual nas duas referencias: (48,248,104) em praticamente
// todo pixel lido. O teste e estrito pelo MESMO motivo de `isYellow`, e aqui a
// pressao e maior: verde e a cor mais comum da arte deste jogo (grama, folha,
// arbusto, musgo). Exigir G alto E os dois outros canais bem abaixo derruba a
// vegetacao inteira — medido nas duas referencias, o verde da arte fica em
// (104,168,56) e parecidos, que tem R alto demais pra passar.
function isGreen(r, g, b) {
  return g >= 200 && r <= g - 120 && b <= g - 100 && b >= 40;
}
// Marcador pintado esta SOBRE a area andavel — por definicao, o POKE nasce
// nele. Sem isto o circulo abre um buraco bloqueado de ~1,2 celula exatamente
// no ponto de nascimento, e o snap do passo 3 empurra o spawn pra celula
// vizinha. Passou despercebido enquanto so o amarelo existia (11 artes, 6
// deles projetados pra fora da janela e portanto nunca dentro de uma celula
// visivel); com dois marcadores dentro da arena do duelo o buraco vira
// duplo e no meio do campo.
function isMarcador(r, g, b) {
  return isYellow(r, g, b) || isGreen(r, g, b);
}
// Maioria simples: a celula de borda do traco vermelho cai pro lado seguro
// (bloqueada) sozinha.
const RED_CELL_RATIO = 0.5;

// Quanto de uma celula (40px de mundo = 50px de imagem) precisa estar pintada
// de rosa pra ela ser andavel.
//
// ERA 0.3, E ESSE ERA O BUG DO PH-94 — o jogador via a pintura desrespeitada
// em todas as hunts porque uma celula 30% pintada passava, e o centro do POKE
// podia encostar ~28px dentro do que a arte mostra como parede.
//
// O 0.3 nao era descuido: com celula de 40, rua de cidade tem cerca de UMA
// celula de largura, e a 0.5 qualquer estreitamento derrubava a celula abaixo
// da maioria e CORTAVA a malha; a poda por conectividade apagava tudo do outro
// lado do corte. Medido nas 29 referencias da epoca (celulas podadas):
//
//   celula 40 | metropolis | town-night | ice-cave
//   0.5       |    116     |    224     |    35
//   0.3       |      1     |      0     |     0
//
// Ou seja: 0.3 tratava o SINTOMA. A causa era a celula ser grossa demais pra
// geometria fina das artes urbanas. Com CELL_SIZE de 20 a mesma rua tem duas
// celulas e o limiar pode ser rigoroso sem fragmentar nada. Medido no PH-94,
// nas 31 referencias (total de celulas podadas por desconexao, e a area de
// mundo que isso representa — comparar CONTAGEM entre tamanhos de celula
// diferentes engana, area nao):
//
//   celula | ratio | podadas | area podada | urbanas podadas
//   40     | 0.3   |    77   |   123.200   | metropolis 4
//   40     | 0.5   |   430   |   688.000   | town-night 246 (!)
//   20     | 0.5   |   168   |    67.200   | zero
//   20     | 0.6   |   159   |    63.600   | zero
//   20     | 0.7   |   379   |   151.600   | volta a fragmentar
//   10     | 0.5   |  1294   |   129.400   | zero, mas area pior
//
// 0.6 e o joelho: poda METADE da area que o desenho antigo podava, sendo o
// DOBRO de rigoroso, e 0.7 volta a rachar. As 151 celulas que sobram em
// abismo.png sao do modo `vermelho_bloqueia`, onde este ratio nao entra — mesma
// area isolada de sempre, so medida mais fino.
//
// Custo: 1 a 4 pontos percentuais de area andavel por arte (a folga de parede
// sendo devolvida), e a pegada do POKE passando de 40 pra 20 — ver
// `POKE_COLLISION_FOOTPRINT` em src/data/collisionConstants.ts, que explica por
// que a de 40 nunca foi honrada de verdade.
//
// `PINK_RATIO` no ambiente sobrescreve, so pra repetir essa medicao.
const PINK_CELL_RATIO = Number(process.env.PINK_RATIO || 0.6);

const refDir = path.join(__dirname, 'body-block-refs');
const bgDir = path.join(__dirname, '..', 'assets', 'hunt-backgrounds');
const outFile = path.join(__dirname, '..', 'src', 'data', 'generated', 'subBiomaCollision.generated.ts');

// referencia pintada -> arte real que ela cobre. A arte e a CHAVE do
// resultado: quem usa a imagem herda a grade, seja sub-bioma com arte
// propria, sub-bioma sem arte (herda a do bioma) ou hunt sem salas.
//
// NAO HA MAIS CAMPO "spawn" AQUI. O circulo amarelo e DETECTADO: se a
// referencia tem um blob de tinta amarela chapada acima do limiar, ele e o
// spawn; se nao tem, cai no centroide da area rosa. O usuario disse que vai
// pintar circulo em mais mapas, e ter de vir aqui marcar "spawn: amarelo" a
// cada um seria exatamente o tipo de passo que se esquece — e o esquecimento
// falha em silencio (o circulo fica na imagem, ignorado, e ninguem percebe).
const MANIFESTO = {
  'abismo.png': { bg: 'abyss.jpg', modo: 'vermelho_bloqueia' },
  'meadow.png': { bg: 'meadow.jpg', modo: 'rosa_anda' },
  'desert.png': { bg: 'desert.jpg', modo: 'rosa_anda' },
  'badlands.png': { bg: 'badlands.jpg', modo: 'rosa_anda' },
  'burnt-forest.png': { bg: 'burnt-forest.jpg', modo: 'rosa_anda' },
  'tall-grass.png': { bg: 'tall-grass.jpg', modo: 'rosa_anda' },
  'forest.png': { bg: 'forest.jpg', modo: 'rosa_anda' },
  'industrial.png': { bg: 'industrial.jpg', modo: 'rosa_anda' },
  'sea.png': { bg: 'sea.jpg', modo: 'rosa_anda' },
  'ice-mountain.png': { bg: 'ice-mountain.png', modo: 'rosa_anda' },
  'mountain.png': { bg: 'mountain.jpg', modo: 'rosa_anda' },
  'construction-site.png': { bg: 'construction-site.jpg', modo: 'rosa_anda' },
  'swamp.png': { bg: 'swamp.jpg', modo: 'rosa_anda' },
  'plains.png': { bg: 'plains.jpg', modo: 'rosa_anda' },
  'beach.png': { bg: 'beach.jpg', modo: 'rosa_anda' },
  'ruins.png': { bg: 'ruins.jpg', modo: 'rosa_anda' },
  'jungle.png': { bg: 'jungle.jpg', modo: 'rosa_anda' },
  'temple.png': { bg: 'temple.png', modo: 'rosa_anda' },
  // Pintada junto com as 17 acima mas nunca cadastrada — a sala 'cave' ficou
  // sem grade por esquecimento, nao por decisao. Sem marcador amarelo (a
  // arte e lava: amarelo incidental demais pra confiar num blob).
  'cave-volcanic.png': { bg: 'cave-volcanic.jpg', modo: 'rosa_anda' },

  // Leva 2026-08-18: 10 referencias novas, todas com circulo amarelo de
  // spawn pintado.
  'ice-cave.png': { bg: 'ice-cave.jpg', modo: 'rosa_anda' },
  'fairy-cave.png': { bg: 'fairy-cave.jpg', modo: 'rosa_anda' },
  'island.png': { bg: 'island.jpg', modo: 'rosa_anda' },
  'lake.png': { bg: 'lake.jpg', modo: 'rosa_anda' },
  'metropolis.png': { bg: 'metropolis.jpg', modo: 'rosa_anda' },
  'slum.png': { bg: 'slum.jpg', modo: 'rosa_anda' },
  'wasteland.png': { bg: 'wasteland.jpg', modo: 'rosa_anda' },
  'town-night.png': { bg: 'town-night.jpg', modo: 'rosa_anda' },
  'town.png': { bg: 'town.jpg', modo: 'rosa_anda' },
  'volcano.png': { bg: 'volcano.jpg', modo: 'rosa_anda' },

  // Leva 2026-08-22: as duas ultimas artes sem grade, e as primeiras com
  // CIRCULO VERDE alem do amarelo — sao arenas de duelo, nao mapas de
  // perambular. `dojo.png` e o sub-bioma Dojo (Urbano) e a hunt de
  // Treinamento; `dragon.png` e a arena do Campeao Lance e o espelho DRAGON do
  // Modo Pesadelo. Nenhuma das duas e arte de bioma, entao ate aqui elas
  // escapavam de todo teste que itera `BIOMAS` — ver walkBlock.test.ts.
  'dojo.png': { bg: 'dojo.png', modo: 'rosa_anda' },
  'dragon.png': { bg: 'dragon.png', modo: 'rosa_anda' },
};

/**
 * O ENQUADRAMENTO: quanto de mundo esta arte vira, e onde a imagem fica dentro
 * dele.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO DEIXOU DE SER UMA CONSTANTE
 * ---------------------------------------------------------------------------
 * Ate 2026-08-22 todo mapa tinha exatamente 1400x900 e a arte era CENTRADA
 * nesse retangulo, esticada o bastante pra cobri-lo. Ou seja: so a faixa
 * central da imagem virava mundo, e o que estivesse pintado fora dela era
 * descartado sem aviso.
 *
 * O custo apareceu inteiro em `dragon.png`: a sala do duelo e as duas bolas
 * caiam fora da faixa, a poda por conectividade jogava fora 245 das 292
 * celulas, e sobrava um quartinho de 47 celulas num canto. Com o mundo
 * recortado a partir da PINTURA, as mesmas 728 celulas viram um componente
 * conectado de 718. A pintura estava certa desde sempre; o recorte e que
 * estava errado.
 *
 * A regra agora: o mundo e a CAIXA que envolve tudo o que e andavel naquela
 * arte, mais uma celula de folga, alinhada a grade de 40px. Cada arte define o
 * proprio tamanho — ha mapas maiores e menores, de proposito.
 *
 * ---------------------------------------------------------------------------
 * E POR QUE ELE E EMITIDO, EM VEZ DE RECALCULADO NO RENDERER
 * ---------------------------------------------------------------------------
 * Antes, gerador e `render/sprites.ts#drawMapBackground` chegavam na mesma
 * transformacao por conta propria, concordando porque repetiam as mesmas tres
 * constantes. Isso ja era fragil (o cabecalho de `data/maps.ts` chama
 * "a classe de bug mais cara deste sistema" a grade ser de uma imagem e o
 * pixel na tela de outra) e agora e impossivel: o canto da imagem depende da
 * caixa da tinta, que so quem le os pixels conhece. Entao o gerador EMITE
 * `arte: { escala, x, y }` e o renderer so consome.
 */
function enquadrar(width, height, rgba, modo) {
  const escala = HUNT_BG_TILE_SCALE;
  // Caixa do que e andavel, em pixels de imagem. Marcador conta: ele e pintado
  // sobre a area andavel e o POKE nasce nele.
  const andavelNoPixel = (r, g, b, a) => (modo === 'rosa_anda'
    ? a >= 10 && (isPink(r, g, b) || isMarcador(r, g, b))
    : a >= 10 && !isRed(r, g, b));

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (!andavelNoPixel(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3])) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x0 === Infinity) return null;

  // Da caixa em pixels pro mundo, com folga, arredondado pra celula inteira: a
  // grade tem que cobrir o retangulo exato, senao `isCellBlocked` trata a
  // sobra como fora do mapa.
  const larguraCrua = (x1 - x0 + 1) * escala + MARGEM_DE_MUNDO * 2;
  const alturaCrua = (y1 - y0 + 1) * escala + MARGEM_DE_MUNDO * 2;
  const cols = Math.ceil(larguraCrua / CELL_SIZE);
  const rows = Math.ceil(alturaCrua / CELL_SIZE);
  const bounds = { width: cols * CELL_SIZE, height: rows * CELL_SIZE };

  // Pixel de imagem que corresponde a x=0,y=0 do mundo. Sai negativo em
  // relacao a caixa por causa da folga, e e daqui que vem tanto a conversao
  // imagem<->mundo do resto do script quanto o canto de desenho da arte.
  const origemImgX = x0 - MARGEM_DE_MUNDO / escala;
  const origemImgY = y0 - MARGEM_DE_MUNDO / escala;

  return {
    escala,
    originX: -origemImgX * escala,
    originY: -origemImgY * escala,
    bounds,
    cols,
    rows,
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

// Um blob amarelo menor que isto nao e o circulo pintado. Com o teste de cor
// estrito a margem e enorme: circulo real vai de 2144 a 4512 px, e o maior
// falso-positivo em TODAS as 29 referencias e de 16 px. 1200 fica no meio do
// vazio — nem um circulo pequeno escapa, nem um respingo entra.
const MIN_PIXELS_DO_MARCADOR = 1200;

const resultados = {};
const avisos = [];

for (const [refFile, { bg, modo }] of Object.entries(MANIFESTO)) {
  const refPath = path.join(refDir, refFile);
  const bgPath = path.join(bgDir, bg);
  if (!fs.existsSync(refPath)) { console.warn(`Pulando ${refFile}: referencia nao encontrada`); continue; }
  if (!fs.existsSync(bgPath)) { console.warn(`Pulando ${refFile}: arte real ${bg} nao encontrada`); continue; }

  const { width, height, rgba } = decodePng(fs.readFileSync(refPath));
  const quadro = enquadrar(width, height, rgba, modo);
  if (!quadro) throw new Error(`${refFile}: nada andavel na referencia — nem tinta rosa, nem area fora do vermelho.`);
  const { escala, originX, originY, bounds: MAP_BOUNDS, cols, rows } = quadro;
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
            if (alpha >= 10 && (isPink(r, g, b) || isMarcador(r, g, b))) matchSamples++;
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

  // 1.5) EROSAO PELA PEGADA DO POKE.
  //
  // A grade nao responde "aqui tem tinta" — ela responde "o CENTRO do POKE
  // pode estar aqui". `movementSystem.ts#canOccupy` checa um ponto so, e o
  // comentario dele explica por que isso equivale a uma pegada de uma caixa:
  // enquanto a celula tinha o tamanho da pegada (40), as duas coisas eram a
  // mesma. Com a celula menor elas deixam de ser, e sem erodir o POKE ficaria
  // METADE mais fino — chegaria mais perto da parede, o oposto do que o PH-94
  // quer.
  //
  // Entao a pegada continua sendo 40 unidades de mundo (decisao explicita do
  // usuario, preservada), e ela e aplicada AQUI, de graca, em vez de virar 9
  // consultas por passo no laco quente — que roda ate 250 mil vezes por
  // chamada no resim do servidor.
  //
  // Raio em celulas = metade da pegada / tamanho da celula. Com pegada 40 e
  // celula 40 o raio e 0 e nada e erodido: e exatamente o comportamento de
  // hoje, o que faz esta etapa ser retrocompativel por construcao.
  const raioDaPegada = Math.max(0, Math.round(POKE_FOOTPRINT / 2 / CELL_SIZE - 0.5));
  let erodidas = 0;
  if (raioDaPegada > 0) {
    const original = rowStrings.slice();
    for (let row = 0; row < rows; row++) {
      let linhaNova = '';
      for (let col = 0; col < cols; col++) {
        if (original[row][col] === '1') { linhaNova += '1'; continue; }
        let cabe = true;
        for (let dr = -raioDaPegada; dr <= raioDaPegada && cabe; dr++) {
          for (let dc = -raioDaPegada; dc <= raioDaPegada; dc++) {
            const r = row + dr, c = col + dc;
            // Fora da grade conta como bloqueado — mesma regra do resto do
            // script, e evita o POKE nascer com meio corpo fora do mundo.
            if (r < 0 || r >= rows || c < 0 || c >= cols || original[r][c] === '1') { cabe = false; break; }
          }
        }
        if (cabe) linhaNova += '0';
        else { linhaNova += '1'; erodidas++; }
      }
      rowStrings[row] = linhaNova;
    }
    walkableCount -= erodidas;
    if (walkableCount <= 0) {
      throw new Error(
        `${refFile}: a erosao pela pegada de ${POKE_FOOTPRINT} zerou a area andavel. ` +
        'A pintura e mais estreita que o corpo do POKE em toda parte.',
      );
    }
  }

  // 2) Ponto de spawn.
  //
  //    O CIRCULO MANDA SEMPRE QUE EXISTIR — inclusive quando cai fora da
  //    janela visivel do mapa, que e o caso dos 10 desta leva.
  //
  //    Por que ele cai fora: a arte e 2048x2048 e o mundo e 1400x900, entao o
  //    desenho cobre o mundo com sobra e SO a faixa central da imagem
  //    (x[149..1899] y[462..1587] num 2048^2) aparece na tela. O usuario pinta
  //    olhando a imagem inteira, e os 10 circulos estao de 30 a 370 px de
  //    imagem fora dessa faixa — a maioria no rodape, dois na lateral.
  //
  //    A versao anterior DESCARTAVA esses e caia no centroide rosa, o que joga
  //    fora a unica coisa que o circulo carrega: a INTENCAO DE ONDE. Um
  //    circulo no canto inferior direito quer dizer "nasce no canto inferior
  //    direito", e o centroide rosa manda pro meio do mapa.
  //
  //    Agora o ponto e projetado (clamp) pra dentro do retangulo do mundo, e o
  //    snap do passo 3 acha a celula andavel mais proxima dali. Direcao
  //    preservada, ponto sempre valido. Pintar dentro da faixa continua sendo
  //    melhor — ai o ponto e exato em vez de aproximado —, e o aviso diz
  //    quanto cada um saiu e qual e a faixa boa.
  const areaRosa = centroide(width, height, rgba, isPink);
  let spawnImg = null;
  let origemDoSpawn = 'centroide rosa';
  const blobAmarelo = maiorBlob(width, height, rgba, isYellow);
  if (blobAmarelo && blobAmarelo.pixels >= MIN_PIXELS_DO_MARCADOR) {
    spawnImg = blobAmarelo;
    origemDoSpawn = 'amarelo';
  } else if (blobAmarelo) {
    avisos.push(
      `${refFile}: ha tinta amarela mas o maior blob tem so ${blobAmarelo.pixels}px (< ${MIN_PIXELS_DO_MARCADOR}px) — ` +
      'tratado como ruido da arte, nao como marcador. Caiu no centroide da area rosa.',
    );
  }
  if (!spawnImg) {
    if (!areaRosa) throw new Error(`${refFile}: sem marcador amarelo e sem area rosa pra cair de volta.`);
    spawnImg = areaRosa;
  }
  let { x: spawnWorldX, y: spawnWorldY } = paraMundo(spawnImg.x, spawnImg.y);

  if (origemDoSpawn === 'amarelo' && !dentroDoMapa({ x: spawnWorldX, y: spawnWorldY })) {
    const antesX = spawnWorldX, antesY = spawnWorldY;
    // Uma celula de margem, nao a borda crua. A grade tem 23 fileiras de 40px
    // cobrindo um mapa de 900px, entao a ultima fileira vai de 880 a 920 e o
    // centro dela cai em y=900 — a borda EXATA do mundo. Clampar em 0/900
    // punha o nascimento colado nela: o POKE aparece na beirada da tela com
    // o mapa inteiro atras dele. Recuar CELL_SIZE mantem a direcao (o desvio
    // e de uma celula num deslocamento de dezenas) e nasce dentro do mapa.
    const margem = CELL_SIZE;
    spawnWorldX = Math.min(Math.max(spawnWorldX, margem), MAP_BOUNDS.width - margem);
    spawnWorldY = Math.min(Math.max(spawnWorldY, margem), MAP_BOUNDS.height - margem);
    origemDoSpawn = 'amarelo projetado';
    const faixaX = `${Math.round((0 - originX) / escala)}..${Math.round((MAP_BOUNDS.width - originX) / escala)}`;
    const faixaY = `${Math.round((0 - originY) / escala)}..${Math.round((MAP_BOUNDS.height - originY) / escala)}`;
    avisos.push(
      `${refFile}: circulo amarelo em img(${blobAmarelo.x | 0},${blobAmarelo.y | 0}) cai fora da janela visivel ` +
      `(daria ${antesX.toFixed(0)},${antesY.toFixed(0)} num mundo de ${MAP_BOUNDS.width}x${MAP_BOUNDS.height}). ` +
      `Projetado pra ${spawnWorldX.toFixed(0)},${spawnWorldY.toFixed(0)} — a DIRECAO que voce marcou vale, o ponto e aproximado. ` +
      `Pra ficar exato, pinte dentro de x[${faixaX}] y[${faixaY}] da imagem.`,
    );
  }

  // 3) Snap: o ponto acima e um centroide, entao pode cair numa reentrancia
  //    bloqueada do proprio traco (ou fora do retangulo). Busca a celula
  //    andavel mais proxima em espiral quadrada — mantem a intencao (o mais
  //    perto possivel do que o usuario marcou) sem travar o build.
  const celulaValida = (c, r) => r >= 0 && r < rows && c >= 0 && c < cols && rowStrings[r][c] === '0';
  // Espiral quadrada em volta de (col,row) ate achar celula andavel. Extraida
  // pra funcao quando o marcador VERDE entrou: ele precisa exatamente do mesmo
  // resgate que o amarelo, e duas copias divergiriam na primeira mexida.
  function celulaAndavelMaisProxima(col, row) {
    if (celulaValida(col, row)) return { c: col, r: row };
    for (let radius = 1; radius <= Math.max(cols, rows); radius++) {
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
          if (celulaValida(col + dc, row + dr)) return { c: col + dc, r: row + dr };
        }
      }
    }
    return null;
  }
  const casaDoSpawn = celulaAndavelMaisProxima(Math.floor(spawnWorldX / CELL_SIZE), Math.floor(spawnWorldY / CELL_SIZE));
  if (!casaDoSpawn) throw new Error(`${refFile}: nenhuma celula andavel perto do ponto de spawn.`);
  const spawnCol = casaDoSpawn.c, spawnRow = casaDoSpawn.r;
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
  // 5) Circulo VERDE: por onde entra todo POKE novo do lado inimigo. Resolvido
  //    DEPOIS da poda de propósito — assim ele nunca cai num bolsao que o
  //    pathfinder trata como bloqueado, e o inimigo nasce sempre num lugar de
  //    onde da pra alcancar o jogador. Arte sem circulo verde nao ganha o
  //    campo, e quem consome trata a ausencia como "usa o spawn de sempre".
  let spawnInimigo = null;
  const blobVerde = maiorBlob(width, height, rgba, isGreen);
  if (blobVerde && blobVerde.pixels >= MIN_PIXELS_DO_MARCADOR) {
    let { x: vx, y: vy } = paraMundo(blobVerde.x, blobVerde.y);
    if (!dentroDoMapa({ x: vx, y: vy })) {
      const antesX = vx, antesY = vy;
      vx = Math.min(Math.max(vx, CELL_SIZE), MAP_BOUNDS.width - CELL_SIZE);
      vy = Math.min(Math.max(vy, CELL_SIZE), MAP_BOUNDS.height - CELL_SIZE);
      avisos.push(
        `${refFile}: circulo VERDE em img(${blobVerde.x | 0},${blobVerde.y | 0}) cai fora da janela visivel ` +
        `(daria ${antesX.toFixed(0)},${antesY.toFixed(0)}). Projetado pra ${vx.toFixed(0)},${vy.toFixed(0)}.`,
      );
    }
    const casa = celulaAndavelMaisProxima(Math.floor(vx / CELL_SIZE), Math.floor(vy / CELL_SIZE));
    if (!casa) throw new Error(`${refFile}: nenhuma celula andavel perto do circulo verde.`);
    spawnInimigo = { x: casa.c * CELL_SIZE + CELL_SIZE / 2, y: casa.r * CELL_SIZE + CELL_SIZE / 2 };
    if (spawnInimigo.x === spawnWorldX && spawnInimigo.y === spawnWorldY) {
      avisos.push(
        `${refFile}: circulo verde e circulo amarelo caem na MESMA celula (${spawnWorldX},${spawnWorldY}) — ` +
        'jogador e inimigo nasceriam um em cima do outro. Pinte os dois mais afastados.',
      );
    }
  } else if (blobVerde) {
    avisos.push(
      `${refFile}: ha tinta verde mas o maior blob tem so ${blobVerde.pixels}px (< ${MIN_PIXELS_DO_MARCADOR}px) — ` +
      'tratado como vegetacao da arte, nao como marcador de entrada do inimigo.',
    );
  }

  const walkableFinal = walkableCount - podadas;
  const pct = ((walkableFinal / (cols * rows)) * 100).toFixed(0);

  // A poda descartar MAIS do que ficou nao e "uns bolsoes soltos": e o spawn
  // ter caido no pedaco errado da pintura. Foi exatamente o que aconteceu com
  // dragon.png na leva 2026-08-22 — o circulo amarelo caiu fora da janela
  // visivel, foi projetado pra borda, e a borda caiu num quartinho de 47
  // celulas isolado dos 243 do corredor principal. O mapa fica jogavel, entao
  // nada falha: some 84% da pintura sem uma linha de aviso. Este e o aviso.
  if (podadas > walkableFinal) {
    avisos.push(
      `${refFile}: a poda por conectividade descartou MAIS area do que manteve (${podadas} podadas vs ${walkableFinal} mantidas). ` +
      `O spawn (${spawnWorldX},${spawnWorldY}) caiu num pedaco isolado da pintura, nao no corredor principal. ` +
      'Confira o gabarito (`node scripts/conferir-walk-block.mjs`): ou o marcador esta no bolsao errado, ou falta ligar o bolsao ao resto.',
    );
  }
  console.log(
    `${bg.padEnd(24)} ${String(walkableFinal).padStart(5)}/${cols * rows} andaveis (${pct.padStart(2)}%), ` +
    `${String(erodidas).padStart(5)} erodidas pela pegada, ` +
    `${String(podadas).padStart(3)} isoladas podadas, spawn (${spawnWorldX},${spawnWorldY}) [${origemDoSpawn}]` +
    (spawnInimigo ? `, inimigo (${spawnInimigo.x},${spawnInimigo.y}) [verde]` : ''),
  );

  // AQUI HAVIA um aviso sobre os 6 `GEOMETRIA.spawnPoints` caindo em area
  // bloqueada. Saiu porque alertava sobre algo que NADA consome: aqueles
  // pontos so sao lidos em `engine/simulation.ts#spawnSequenceEnemy`, e la ja
  // sao sobrepostos pela bola verde quando ela existe. Spawn de POKE selvagem
  // nunca passa por eles — e sorteado num cone a frente do jogador, com
  // fallback num disco no centro do mapa. Com o mundo deixando de ser 1400x900
  // pra todo mundo, seis coordenadas absolutas so poderiam mesmo virar ruido.
  // Ver PH-56, que trata dos sistemas de colisao inalcancaveis.

  // `spawnOrigem` vai pro arquivo gerado de proposito: sem ele, um circulo
  // amarelo que a deteccao deixasse de enxergar viraria centroide rosa em
  // silencio — o mapa continua jogavel, o spawn so muda de lugar, e ninguem
  // olha. Com o campo, `data/walkBlock.test.ts` compara contra a lista de quem
  // tem circulo pintado, e a regressao vira teste vermelho.
  resultados[`assets/hunt-backgrounds/${bg}`] = {
    grid: rowStrings,
    bounds: MAP_BOUNDS,
    arte: { escala, x: Math.round(originX * 100) / 100, y: Math.round(originY * 100) / 100 },
    spawnPoint: { x: spawnWorldX, y: spawnWorldY },
    spawnOrigem: origemDoSpawn === 'centroide rosa' ? 'centroide-rosa'
      : origemDoSpawn === 'amarelo projetado' ? 'amarelo-projetado' : 'amarelo',
    ...(spawnInimigo ? { spawnInimigo } : {}),
  };
}

if (avisos.length) {
  console.log('\nAVISOS:');
  for (const a of avisos) console.log(`  - ${a}`);
}

// Resumo do marcador de spawn. Existe porque o proximo circulo vai ser
// pintado por quem nao leu este arquivo: a linha abaixo diz, sem abrir nada,
// quantas artes ja tem circulo e o que fazer pra dar circulo a mais uma.
const comCirculo = Object.values(resultados).filter((r) => r.spawnOrigem !== 'centroide-rosa').length;
const total = Object.keys(resultados).length;
console.log(`\nSPAWN: ${comCirculo} das ${total} artes nascem de circulo amarelo pintado; ` +
  `as outras ${total - comCirculo} nascem no centroide da area rosa.`);
console.log('Pra dar circulo a mais uma: pinte um circulo de AMARELO CHAPADO (254,242,0),');
console.log('de uns 60px de diametro, na referencia em scripts/body-block-refs/ e rode este');
console.log('script de novo — nao ha nada pra cadastrar. `node scripts/conferir-walk-block.mjs`');
console.log('gera o gabarito com a moldura do que aparece na tela.');

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
  /**
   * Tamanho do mundo desta arte, em unidades de mundo. NAO e mais 1400x900 pra
   * todo mundo: e a caixa que envolve a area pintada mais uma celula de folga,
   * arredondada pra celula inteira. \`grid\` cobre exatamente este retangulo —
   * \`isCellBlocked\` trata qualquer coisa fora dele como fora do mapa.
   */
  bounds: { width: number; height: number };
  /**
   * Onde desenhar a imagem de fundo, em coordenadas de MUNDO: canto superior
   * esquerdo em (x,y), tamanho \`naturalWidth * escala\` por
   * \`naturalHeight * escala\`.
   *
   * Emitido, e nao recalculado no renderer, porque o canto depende da caixa da
   * tinta — coisa que so quem le os pixels da referencia conhece. Antes as
   * duas pontas chegavam na mesma conta por repetir as mesmas constantes; se
   * elas divergissem, a grade de colisao passaria a ser de uma imagem e o
   * pixel na tela de outra (ver o cabecalho de data/maps.ts).
   */
  arte: { escala: number; x: number; y: number };
  spawnPoint: { x: number; y: number };
  /**
   * De onde saiu o spawnPoint.
   *
   *   'amarelo'            circulo pintado, dentro da janela visivel. Exato.
   *   'amarelo-projetado'  circulo pintado FORA da janela visivel (a arte e
   *                        maior que o mundo e so a faixa central dela
   *                        aparece na tela). A DIRECAO que o circulo indica
   *                        vale; o ponto foi trazido pra borda mais proxima.
   *   'centroide-rosa'     sem circulo — nasce no meio da area andavel.
   */
  spawnOrigem: 'amarelo' | 'amarelo-projetado' | 'centroide-rosa';
  /**
   * Por onde entra todo POKE novo do lado INIMIGO — o circulo VERDE pintado,
   * irmao do amarelo. So as arenas de duelo tem (dojo, dragon); arte sem
   * circulo verde omite o campo, e quem consome cai no spawn de sempre.
   *
   * Resolvido depois da poda de conectividade, entao e sempre uma celula de
   * onde da pra alcancar o jogador.
   */
  spawnInimigo?: { x: number; y: number };
}

export const COLISAO_POR_ARTE: Record<string, ColisaoPintada> = ${JSON.stringify(resultados, null, 2)};
`;
// `MEDIR=1` roda a analise inteira e NAO escreve o arquivo gerado. Existe pra
// varrer combinacoes de CELL/PINK_RATIO sem sujar a arvore de trabalho — a
// medicao do PH-94 sao 8 rodadas seguidas, e cada uma reescreveria 70-280 KB
// de TS que ninguem quer commitar.
if (process.env.MEDIR === '1') {
  console.log(`\n[MEDIR] celula=${CELL_SIZE} ratio=${PINK_CELL_RATIO} — arquivo NAO escrito.`);
} else {
  fs.writeFileSync(outFile, header);
  console.log(`\nEscrito ${outFile} (${Object.keys(resultados).length} artes)`);
}
