// Mede a arte de efeito nos DOIS eixos em que ela erra: DIRECAO (aponta pra
// algum lado e precisa girar pro alvo, ou e radial e nao pode girar) e
// ESCALA (o tamanho com que aparece na tela, comparado ao POKE).
//
// Existe porque o julgamento a olho nao escala e ja errou aqui duas vezes: o
// lote das 18 tiras por tipo foi cadastrado como "simetrico" em bloco sem
// ninguem medir uma por uma, e o campo `escala` de cada tira foi posto a olho
// (1.15 no FIRE, 1.2 no DARK) sem ninguem comparar uma com as outras.
//
// A SEGUNDA TABELA (escala) mede o que o jogador ve, nao o arquivo. A altura
// pedida no desenho e a MESMA pra todas as tiras — 44 x 1.6 x escala — e a
// largura sai da proporcao do quadro. Duas consequencias que so aparecem
// medindo: uma tira de quadro 2:1 fica com o DOBRO da largura de uma quadrada
// com a mesma altura, e o conteudo real de cada quadro ocupa uma fracao
// diferente do quadro, entao duas artes com a mesma altura de arquivo podem
// aparecer com metade do tamanho uma da outra.
//
// COMO MEDE (tudo sobre o canal ALPHA, que e onde mora a silhueta):
//
//   centro     deslocamento do centroide em relacao ao centro do quadro, em
//              fracao da largura/altura. Arte radial fica perto de 0; um
//              projetil desenhado "entrando pela esquerda" fica longe.
//   alonga     razao entre os dois eixos principais (momentos de 2a ordem).
//              1.0 = redondo; 2.0 = duas vezes mais comprido que largo.
//   angulo     direcao do eixo principal, em graus, 0 = aponta pra DIREITA
//              (+x), que e a convencao de arte deste projeto (moveVfx.ts).
//   simX/simY  quanto a silhueta difere do proprio espelho horizontal/
//              vertical, de 0 (identica) a 1. Assimetria alta num eixo e o
//              sinal mais forte de arte com "frente" e "tras".
//   skew       de que lado do eixo principal esta a MASSA. Positivo = pesada
//              na ponta pra onde o angulo aponta. E o que separa "comprido" de
//              "comprido E com cabeca" — decide onde fica o ponto de impacto.
//
// Nao decide nada sozinho: imprime numero e uma sugestao, e a classificacao
// final vai a mao pro `TIRA_POR_ELEMENTO` depois de conferir em jogo. Rodar:
//   node scripts/conferir-direcao-vfx.mjs
//   node scripts/conferir-direcao-vfx.mjs --quadros fire   (detalhe por quadro)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { decodePng } = require('./lib/png.js');
const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));

// Le o cadastro real em vez de repetir a lista aqui: se uma tira entrar ou
// mudar de numero de quadros, a conferencia acompanha sozinha.
const LINHA = String.fromCharCode(10);

function tirasCadastradas() {
  const src = readFileSync(join(RAIZ, 'src', 'data', 'vfxTiras.ts'), 'utf8');
  const saida = [];
  const re = /(\w+):\s*\{\s*url:\s*`\$\{(RAIZ|RAIZ_STATUS)\}\/([\w-]+\.png)`,\s*quadros:\s*(\d+)([^}]*)/g;
  for (const m of src.matchAll(re)) {
    const pasta = m[2] === 'RAIZ' ? join('assets', 'move-vfx', 'tiras') : join('assets', 'status-vfx');
    // Tira COMENTARIO antes de procurar o campo: o bloco entre `quadros:` e o
    // fim da entrada tem justificativa em prosa, e a justificativa cita os
    // proprios valores ("a `escala: 1.15` que estava aqui foi posta a olho").
    // Sem isto o medidor lia o comentario e reportava um valor que o codigo
    // nao tem mais — errando sobre o campo que ele existe pra auditar.
    const corpo = (m[5] ?? '').split(LINHA).filter((l) => !l.trim().startsWith('//')).join(LINHA);
    const escala = /escala:\s*([\d.]+)/.exec(corpo);
    const recorte = /recorteX:\s*([\d.]+)/.exec(corpo);
    saida.push({
      nome: m[1], arquivo: join(pasta, m[3]), quadros: Number(m[4]),
      escala: escala ? Number(escala[1]) : 1,
      recorteX: recorte ? Number(recorte[1]) : 1,
    });
  }
  return saida;
}

// Alpha abaixo disto e franja de anti-alias: entra na conta como ruido e
// desloca o centroide de arte que tem brilho difuso em volta (fogo, psiquico).
const ALPHA_MINIMO = 40;

function medirQuadro(rgba, larguraTira, x0, largura, altura) {
  let m00 = 0, m10 = 0, m01 = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const a = rgba[((y * larguraTira) + x0 + x) * 4 + 3];
      if (a < ALPHA_MINIMO) continue;
      m00 += a; m10 += a * x; m01 += a * y;
    }
  }
  if (m00 === 0) return null;
  const cx = m10 / m00, cy = m01 / m00;

  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const a = rgba[((y * larguraTira) + x0 + x) * 4 + 3];
      if (a < ALPHA_MINIMO) continue;
      const dx = x - cx, dy = y - cy;
      mu20 += a * dx * dx; mu02 += a * dy * dy; mu11 += a * dx * dy;
    }
  }
  mu20 /= m00; mu02 /= m00; mu11 /= m00;

  // Eixo principal. `-` no dy porque y cresce pra BAIXO na imagem e o angulo
  // do jogo (Math.atan2 do mundo) tambem — manter o mesmo sentido evita um
  // espelhamento silencioso na hora de usar o numero.
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  const soma = mu20 + mu02;
  const raiz = Math.sqrt(Math.max(0, (mu20 - mu02) ** 2 + 4 * mu11 * mu11));
  const l1 = (soma + raiz) / 2, l2 = Math.max(1e-9, (soma - raiz) / 2);
  const alonga = Math.sqrt(l1 / l2);

  // Skew ao longo do eixo principal: de que lado esta a massa.
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let m3 = 0, m2 = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const a = rgba[((y * larguraTira) + x0 + x) * 4 + 3];
      if (a < ALPHA_MINIMO) continue;
      const p = (x - cx) * ux + (y - cy) * uy;
      m2 += a * p * p; m3 += a * p * p * p;
    }
  }
  m2 /= m00; m3 /= m00;
  const skew = m2 > 1e-9 ? m3 / Math.pow(m2, 1.5) : 0;

  // Simetria de espelho, normalizada pela massa total.
  let difX = 0, difY = 0, total = 0;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const a = rgba[((y * larguraTira) + x0 + x) * 4 + 3];
      const ax = rgba[((y * larguraTira) + x0 + (largura - 1 - x)) * 4 + 3];
      const ay = rgba[(((altura - 1 - y) * larguraTira) + x0 + x) * 4 + 3];
      difX += Math.abs(a - ax); difY += Math.abs(a - ay); total += a;
    }
  }
  return {
    cx: cx / largura - 0.5,
    cy: cy / altura - 0.5,
    alonga,
    anguloGraus: (theta * 180) / Math.PI,
    skew,
    simX: total > 0 ? difX / (2 * total) : 0,
    simY: total > 0 ? difY / (2 * total) : 0,
    massa: m00,
  };
}

// ---------------------------------------------------------------------------
// CLASSIFICACAO — e o que a primeira versao errou, duas vezes
// ---------------------------------------------------------------------------
// ERRO 1: media de `alonga` sobre TODOS os quadros. A arte de explosao termina
// virando particula espalhada, e um punhado de pontinhos soltos produz
// covariancia quase degenerada — `bug.png`, que e uma explosao redonda, saiu
// com "16.55x alongada". Corrigido com MEDIANA sobre os quadros que carregam
// massa de verdade (>=25% do quadro mais cheio); os quadros de poeira final
// deixam de votar.
//
// ERRO 2: usar assimetria de espelho (simX/simY) como sinal de direcao. Arte
// caotica (fogo, explosao) NUNCA e espelho-simetrica, entao o teste acusava
// metade do lote. O que separa "aponta pra algum lado" de "e baguncado" e a
// ESTABILIDADE DO ANGULO entre quadros: um risco diagonal mantem o mesmo eixo
// do primeiro ao ultimo quadro; uma explosao sorteia um eixo diferente a cada
// quadro. `anguloDesvio` mede isso (desvio circular de 2*theta, porque um eixo
// nao tem ponta — 10° e 190° sao o mesmo eixo).
//
// A terceira classe apareceu ao olhar o resultado: arte assimetrica so no eixo
// Y, com eixo principal HORIZONTAL. Sao as ancoradas no chao — a cupula do
// PSYCHIC, a coluna do FLYING. Elas tem "para cima", nao "para o alvo": girar
// pro inimigo deita as duas. Precisam ficar de fora da rotacao tanto quanto as
// radiais, e por um motivo diferente.
const ALONGA_DIRECIONAL = 1.6;
const ANGULO_ESTAVEL_GRAUS = 25;
const VERTICAL_SIMY = 0.35;

function mediana(v) {
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/** Media e desvio de um eixo (nao de uma direcao): trabalha em 2*theta. */
function eixoMedio(angulosRad) {
  const sx = angulosRad.reduce((s, a) => s + Math.cos(2 * a), 0) / angulosRad.length;
  const sy = angulosRad.reduce((s, a) => s + Math.sin(2 * a), 0) / angulosRad.length;
  const R = Math.hypot(sx, sy);
  return {
    grausMedio: (Math.atan2(sy, sx) / 2 * 180) / Math.PI,
    // R perto de 1 = todos os quadros concordam. Convertido pra "graus de
    // espalhamento" pra o numero ser legivel na tabela.
    desvioGraus: R > 1e-6 ? (Math.sqrt(-2 * Math.log(Math.min(1, R))) / 2 * 180) / Math.PI : 90,
  };
}

function classificar(m) {
  const alongada = m.alonga >= ALONGA_DIRECIONAL;
  const eixoEstavel = m.anguloDesvio <= ANGULO_ESTAVEL_GRAUS;
  // Ancorada no chao: assimetrica no Y e simetrica no X.
  //
  // O `!alongada` que estava aqui era um erro, e o PSYCHIC o expos: a cupula
  // dele mede 1.90x de alongamento, mas na HORIZONTAL — ela e larga e baixa,
  // nao comprida na direcao de alguem. Alongamento com eixo deitado (|angulo|
  // pequeno) + assimetria vertical descreve exatamente uma cupula ou uma
  // coluna vista de lado, e girar isso pro alvo deita a arte no chao.
  const eixoDeitado = Math.abs(m.anguloGraus) <= 20;
  const vertical = m.simY >= VERTICAL_SIMY && m.simY > m.simX * 1.4 && (!alongada || eixoDeitado);

  // Eixo EM PE e estavel: tornado, coluna, jorro pra cima. O tratamento e o
  // mesmo de VERTICAL (nao gira), mas o rotulo importa — o tornado do FLYING
  // saia aqui como RADIAL por nao bater o limiar de assimetria, e "radial" e um
  // convite pra alguem achar que da pra girar. Da nao: girar um tornado pro
  // inimigo o deita no chao, que e o mesmo erro da cupula do PSYCHIC.
  const eixoEmPe = Math.abs(Math.abs(m.anguloGraus) - 90) <= 20;
  if (!vertical && eixoEmPe && eixoEstavel && m.alonga >= 1.25) {
    return {
      veredito: 'VERTICAL',
      motivos: [`eixo em pe ${m.anguloGraus.toFixed(0)}° +-${m.anguloDesvio.toFixed(0)}°, alonga ${m.alonga.toFixed(2)}x`],
    };
  }

  if (vertical) {
    return {
      veredito: 'VERTICAL',
      motivos: [`simY ${m.simY.toFixed(2)} vs simX ${m.simX.toFixed(2)}${alongada ? `, larga ${m.alonga.toFixed(2)}x deitada` : ''}`],
    };
  }
  if (alongada && eixoEstavel) {
    return { veredito: 'DIRECIONAL', motivos: [`${m.alonga.toFixed(2)}x no eixo ${m.anguloGraus.toFixed(0)}° +-${m.anguloDesvio.toFixed(0)}°`] };
  }
  if (alongada) return { veredito: 'DUVIDA', motivos: [`alongada ${m.alonga.toFixed(2)}x mas eixo instavel +-${m.anguloDesvio.toFixed(0)}°`] };
  return { veredito: 'RADIAL', motivos: [] };
}

const alvo = process.argv.includes('--quadros') ? process.argv[process.argv.indexOf('--quadros') + 1] : null;

console.log(
  'tira'.padEnd(14), 'qd'.padStart(3), 'centro'.padStart(7), 'alonga'.padStart(7),
  'angulo'.padStart(7), 'skew'.padStart(6), 'simX'.padStart(5), 'simY'.padStart(5), ' veredito',
);
console.log('-'.repeat(88));

for (const tira of tirasCadastradas()) {
  const { width, height, rgba } = decodePng(readFileSync(join(RAIZ, tira.arquivo)));
  const largura = Math.floor(width / tira.quadros);
  const medidas = [];
  for (let f = 0; f < tira.quadros; f++) {
    const m = medirQuadro(rgba, width, f * largura, largura, height);
    if (m) medidas.push(m);
  }
  if (!medidas.length) { console.log(`${tira.nome.padEnd(14)} (todos os quadros vazios)`); continue; }

  // So os quadros CHEIOS votam. O rastro de particula do fim da animacao tem
  // massa mas nao tem forma: e ele que produzia alongamento fantasma.
  const massaPico = Math.max(...medidas.map((m) => m.massa));
  const cheios = medidas.filter((m) => m.massa >= massaPico * 0.25);
  const peso = cheios.reduce((s, m) => s + m.massa, 0);
  const med = (f) => cheios.reduce((s, m) => s + f(m) * m.massa, 0) / peso;
  const eixo = eixoMedio(cheios.map((m) => (m.anguloGraus * Math.PI) / 180));
  const resumo = {
    cx: med((m) => m.cx), cy: med((m) => m.cy),
    // Mediana e nao media: um unico quadro degenerado nao decide o lote.
    alonga: mediana(cheios.map((m) => m.alonga)),
    anguloGraus: eixo.grausMedio,
    anguloDesvio: eixo.desvioGraus,
    skew: med((m) => m.skew),
    simX: med((m) => m.simX), simY: med((m) => m.simY),
  };
  const { veredito, motivos } = classificar(resumo);

  console.log(
    tira.nome.padEnd(14),
    String(tira.quadros).padStart(3),
    `${resumo.cx >= 0 ? '+' : ''}${resumo.cx.toFixed(2)},${resumo.cy >= 0 ? '+' : ''}${resumo.cy.toFixed(2)}`.padStart(7),
    resumo.alonga.toFixed(2).padStart(7),
    `${resumo.anguloGraus.toFixed(0)}°+-${resumo.anguloDesvio.toFixed(0)}`.padStart(9),
    resumo.skew.toFixed(2).padStart(6),
    resumo.simX.toFixed(2).padStart(5),
    resumo.simY.toFixed(2).padStart(5),
    ` ${veredito}${motivos.length ? ` (${motivos.join(', ')})` : ''}`,
  );

  // Pra arte direcional, onde fica a CABECA — o ponto que tem que cair sobre o
  // alvo. Medido como percentil da massa acumulada ao longo do eixo principal,
  // no quadro mais cheio: p50 e o meio do desenho, p75 ja esta dentro da parte
  // densa da frente, p90 e quase a ponta. Pro jato do FIRE (cauda fina atras,
  // estouro na frente) o p75 e o que cai no estouro; centralizar (p50) enfia
  // metade do jato pra dentro do inimigo.
  if (veredito === 'DIRECIONAL') {
    const cheio = medidas[medidas.findIndex((m) => m.massa === massaPico)];
    const { width, height, rgba } = decodePng(readFileSync(join(RAIZ, tira.arquivo)));
    const f = medidas.indexOf(cheio);
    const x0 = f * largura;
    const colunas = new Array(largura).fill(0);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < largura; x++) {
        const a = rgba[((y * width) + x0 + x) * 4 + 3];
        if (a >= ALPHA_MINIMO) colunas[x] += a;
      }
    }
    const total = colunas.reduce((s, v) => s + v, 0);
    const percentil = (p) => {
      let acc = 0;
      for (let x = 0; x < largura; x++) { acc += colunas[x]; if (acc >= total * p) return x / largura; }
      return 1;
    };
    console.log(
      `   ancora (massa em x, quadro ${f}):`,
      `p50 ${percentil(0.5).toFixed(2)}`,
      `p75 ${percentil(0.75).toFixed(2)}`,
      `p90 ${percentil(0.9).toFixed(2)}`,
    );
  }

  if (alvo && tira.nome.toLowerCase() === alvo.toLowerCase()) {
    for (const [i, m] of medidas.entries()) {
      console.log(
        `   quadro ${String(i).padStart(2)}`,
        `centro ${m.cx >= 0 ? '+' : ''}${m.cx.toFixed(2)},${m.cy >= 0 ? '+' : ''}${m.cy.toFixed(2)}`,
        `alonga ${m.alonga.toFixed(2)}`,
        `angulo ${m.anguloGraus.toFixed(0)}°`,
        `skew ${m.skew.toFixed(2)}`,
        `simX ${m.simX.toFixed(2)} simY ${m.simY.toFixed(2)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// SEGUNDA TABELA: ESCALA
// ---------------------------------------------------------------------------
// As tres constantes vem de render/sprites.ts por regex, e nao copiadas, pelo
// mesmo motivo do cadastro de tiras: quando alguem mexer no desenho, a
// medicao acompanha em vez de mentir com numero velho.
function constanteDoDesenho(nome, padrao) {
  const src = readFileSync(join(RAIZ, 'src', 'render', 'sprites.ts'), 'utf8');
  const m = new RegExp('const ' + nome + '\\s*=\\s*([\\d.]+)').exec(src);
  return m ? Number(m[1]) : padrao;
}

const IMPACT_BASE_SIZE = constanteDoDesenho('IMPACT_BASE_SIZE', 44);
const ESCALA_VFX_SINGLE = constanteDoDesenho('ESCALA_VFX_SINGLE', 1.6);

// Diametro do POKE em pixels de mundo. `radius` de jogador e inimigo fica em
// 14-15 (engine/entity.ts), entao ~29 de ponta a ponta. E a unica referencia
// de tamanho que o jogador tem na tela: o efeito e lido como grande ou pequeno
// EM RELACAO ao POKE, nunca em absoluto.
const POKE_DIAMETRO = 29;

// Caixa do conteudo (nao do quadro) no quadro de pico, em fracao do quadro.
// E o que decide o tamanho aparente: um quadro de 220x119 cujo desenho ocupa
// 40% da altura aparece com 40% da altura pedida, e nao com ela toda.
function caixaDoPico(arquivo, quadros) {
  const { width, height, rgba } = decodePng(readFileSync(join(RAIZ, arquivo)));
  const largura = Math.floor(width / quadros);
  let melhor = null;
  for (let f = 0; f < quadros; f++) {
    const x0 = f * largura;
    let massa = 0, xmin = largura, xmax = -1, ymin = height, ymax = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < largura; x++) {
        const a = rgba[((y * width) + x0 + x) * 4 + 3];
        if (a < ALPHA_MINIMO) continue;
        massa += a;
        if (x < xmin) xmin = x; if (x > xmax) xmax = x;
        if (y < ymin) ymin = y; if (y > ymax) ymax = y;
      }
    }
    if (xmax < 0) continue;
    if (!melhor || massa > melhor.massa) {
      melhor = { massa, f, fw: (xmax - xmin + 1) / largura, fh: (ymax - ymin + 1) / height };
    }
  }
  return { largura, altura: height, pico: melhor };
}

console.log('');
console.log('ESCALA (alvo unico; altura pedida = ' + IMPACT_BASE_SIZE + ' x ' + ESCALA_VFX_SINGLE + ' x escala)');
console.log('tira            quadro      prop  escala   pedido HxL    conteudo HxL   vs POKE');
console.log('-'.repeat(88));

const linhas = [];
for (const tira of tirasCadastradas()) {
  const { largura, altura, pico } = caixaDoPico(tira.arquivo, tira.quadros);
  if (!pico) { console.log(tira.nome.padEnd(14), ' quadro vazio'); continue; }
  const prop = largura / altura;
  const alturaPedida = IMPACT_BASE_SIZE * ESCALA_VFX_SINGLE * tira.escala;
  // `recorteX` corta a largura ANTES de chegar na tela, entao a tabela tem que
  // aplica-lo: sem isso o FIRE aparece aqui como 2.8x o POKE quando o desenho
  // real, recortado, sai em 1.9x — e a tabela existe justamente pra decidir isso.
  const larguraPedida = alturaPedida * prop * tira.recorteX;
  // O que o jogador ve: a caixa do conteudo, nao a do quadro.
  const h = alturaPedida * pico.fh;
  const l = larguraPedida * pico.fw;
  const maior = Math.max(h, l);
  linhas.push({ nome: tira.nome, escala: tira.escala, maior });
  console.log(
    tira.nome.padEnd(14),
    `${largura}x${altura}`.padStart(8),
    prop.toFixed(2).padStart(9),
    tira.escala.toFixed(2).padStart(7),
    `${alturaPedida.toFixed(0)}x${larguraPedida.toFixed(0)}`.padStart(9),
    `${h.toFixed(0)}x${l.toFixed(0)}`.padStart(14),
    `${(maior / POKE_DIAMETRO).toFixed(1)}x`.padStart(9),
  );
}

// A conclusao que a tabela existe pra dar: quanto o lote esta ESPALHADO. Se a
// maior arte aparece com 4x o tamanho da menor, nao ha `escala` global que
// conserte — cada tira precisa da sua.
if (linhas.length) {
  const ordenado = [...linhas].sort((a, b) => a.maior - b.maior);
  const menor = ordenado[0], maior = ordenado[ordenado.length - 1];
  const mediana = ordenado[Math.floor(ordenado.length / 2)].maior;
  console.log('');
  console.log(`ESPALHAMENTO: ${(maior.maior / menor.maior).toFixed(1)}x entre a maior (${maior.nome}, ` +
    `${maior.maior.toFixed(0)}px) e a menor (${menor.nome}, ${menor.maior.toFixed(0)}px).`);
  console.log(`Mediana ${mediana.toFixed(0)}px = ${(mediana / POKE_DIAMETRO).toFixed(1)}x o POKE.`);
  console.log('');
  console.log('escala sugerida pra igualar todas a mediana:');
  for (const l of ordenado) {
    const sugerida = l.escala * (mediana / l.maior);
    const delta = Math.abs(sugerida - l.escala) / l.escala;
    const marca = delta > 0.25 ? '  <-- fora' : '';
    console.log(`   ${l.nome.padEnd(12)} ${l.escala.toFixed(2)} -> ${sugerida.toFixed(2)}${marca}`);
  }
}
