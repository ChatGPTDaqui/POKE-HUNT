// Gera as SEIS tiras de VFX de status em assets/status-vfx/ — veneno,
// queimadura, paralisia, congelamento, sono e confusao.
//
// Rode `node scripts/gerar-status-vfx.mjs` pra regerar tudo.
//
// POR QUE UM GERADOR SO (PH-416). Antes desta issue as artes vinham de tres
// origens: quatro do banco `.dat` local via `tira_efeito.py` (paralisia 214x181
// com 20 quadros, queimadura 51x59 com 6, confusao 48x36 com 21), uma desenhada
// por `gerar-sprite-sono.mjs` (40x40, 16) e DUAS que nao existiam — veneno e
// congelamento eram lidos so pela tinta no corpo. Quatro tamanhos de quadro,
// quatro contagens e dois buracos.
//
// O custo real disso nao era estetico: `tira_efeito.py` le um banco de arte que
// nao esta no repositorio, entao ninguem alem de quem tem aquele banco na
// maquina podia regerar uma tira de status. Desenhar aqui troca "arte importada
// que ninguem mais tem" por 200 linhas reproduziveis em qualquer clone com
// `node` — mesma troca que a PH-163 fez ao versionar a ENTRADA dos scripts de
// colisao.
//
// A GRAMATICA E UMA SO, e e ela que padroniza o conjunto:
//
//   1. ANEL DE MOTES orbitando o corpo numa elipse achatada (ry ~= rx * 0.38),
//      com os motes da METADE DA FRENTE maiores e mais opacos que os de tras.
//      E o canal "tem algo errado com este POKE", identico nos seis.
//   2. GLIFO DE IDENTIDADE, pixel art 9x9 escalada em inteiro, no topo do
//      quadro, balancando 1px. E o canal "qual status", e a UNICA coisa que
//      muda entre os seis alem da paleta.
//
// A identidade sai do glifo e da cor, nao do movimento. Foi decisao: dar a cada
// status uma animacao propria (brasa subindo pra queimadura, faisca em arco pra
// paralisia) e exatamente o que produzia o conjunto desencontrado que esta issue
// existe pra desfazer.
//
// DUAS GEOMETRIAS, E SO DUAS, porque os dois canais de desenho de
// render/sprites.ts tem tamanho diferente por motivo medido (PH-370):
//
//   SOBRE O CORPO  48x48 — desenhado centrado em `meioDoCorpo` com altura
//                  `max(24, alturaDoCorpo * 0.9)` e opacidade 0,75. Cobre o
//                  corpo, entao o glifo cai sobre a cabeca e o anel na cintura.
//   BADGE DE CANTO 40x40 — desenhado ao lado da cabeca com 26px FIXOS
//                  (`ALTURA_SIMBOLO_DE_STATUS`). Nesses 26px o anel quase
//                  desaparece, entao aqui o glifo e maior (escala 3 contra 2) e
//                  o anel e menor: a proporcao muda, a gramatica nao.
//
// O contorno escuro em volta de cada pixel aceso nao e enfeite. Sem ele um
// glifo amarelo sobre um Pikachu (que a tinta de paralisia ja deixou amarelo)
// nao tem borda nenhuma — o caso concreto da PH-370.
import { writeFileSync } from 'node:fs'

import { png } from './vfx/png.mjs'

// Uniforme nos seis. Vale 16 e nao 20 porque as duas fases que consomem a tira
// (`CICLO_CONDICAO_MS` 2000ms sobre o corpo, `CICLO_SIMBOLO_MS` 1400ms no
// badge) sao continuas e amostram por `floor(fase * quadros)`: 16 quadros dao
// 8,0 e 11,4 quadros por segundo, os dois acima do limiar em que o olho le
// movimento em vez de sequencia de poses.
const QUADROS = 16

// ---------------------------------------------------------------------------
// Glifos — pixel art 9x9, `#` aceso
// ---------------------------------------------------------------------------
//
// 9x9 e o menor tamanho em que um cranio ainda tem duas orbitas separadas por
// pixel apagado. Abaixo disso (7x7, tentado primeiro) o cranio, o floco de neve
// e o "?" viram a mesma mancha de 3x3 com pontas.
//
// Todos os seis sao desenhados na MESMA grade, com o mesmo peso de traco, e e
// isso que faz os seis parecerem de um conjunto quando aparecem na mesma hunt.

const GLIFOS = {
  // Cranio. As orbitas sao os pixels APAGADOS, e sao 2x2 cada uma com 1px de
  // osso do nariz entre elas.
  //
  // A primeira versao usa orbitas de 3x2 num cranio mais estreito, e a bancada
  // sobre o Gengar mostrou o resultado no tamanho de jogo: o glifo renderiza a
  // ~12px, cada orbita virava meio pixel e o cranio lia como um retangulo
  // arredondado claro. Orbita de 2x2 em cranio de largura cheia mantem ~2,7px
  // de furo — o menor buraco que sobrevive a essa reducao.
  veneno: [
    '.#######.',
    '#########',
    '##..#..##',
    '##..#..##',
    '#########',
    '.#######.',
    '..#####..',
    '..#.#.#..',
    '..#####..',
  ],
  // Chama: ponta em cima, base larga, e o GANCHO a esquerda que abre um vazio
  // interno. As duas coisas importam, e cada uma consertou um defeito medido no
  // Charizard — corpo laranja que a tinta de queimadura deixa mais laranja
  // ainda, o pior caso possivel pra um glifo quente.
  //
  //   silhueta   a primeira versao e uma gota SOLIDA inclinada, e sai como
  //              mancha de contorno unico. Chama se reconhece pelo CONTORNO
  //              (ponta, gancho, base), nao pelo recheio.
  //   vazio      a segunda versao poe o detalhe DENTRO de um contorno gordo e
  //              arredondado: lia como bolha com um triangulo escuro no meio.
  //              Aqui o vazio e o proprio gancho, entao ele desenha a forma em
  //              vez de decorar ela.
  //
  // Este e o unico glifo dos seis em que a leitura dependeu de silhueta E vazio
  // juntos: cranio, raio, floco, "Z" e "?" ja se resolvem por um dos dois.
  queimadura: [
    '....#....',
    '...##....',
    '..###....',
    '..####...',
    '.##.###..',
    '.#...###.',
    '.#....##.',
    '..#...##.',
    '...#####.',
  ],
  // Raio: ziguezague de traco grosso. O degrau do meio (a linha de 6) e o que
  // separa "raio" de "barra torta".
  paralisia: [
    '....###..',
    '...###...',
    '..###....',
    '.######..',
    '....###..',
    '...###...',
    '..###....',
    '.###.....',
    '###......',
  ],
  // Floco: seis bracos a partir do miolo. Os bracos diagonais sao pontilhados
  // de proposito — continuos, o floco fecha num quadrado.
  congelamento: [
    '....#....',
    '.#..#..#.',
    '..#.#.#..',
    '...###...',
    '####.####',
    '...###...',
    '..#.#.#..',
    '.#..#..#.',
    '....#....',
  ],
  // "Z". Mantido do desenho anterior (gerar-sprite-sono.mjs, PH-370): o banco
  // de arte nao tem nenhum "zzz" e tres letras saem mais barato que procurar
  // mais — mas aqui e UM Z grande e nao tres pequenos subindo, porque o badge
  // renderiza a 26px e tres Z de 5px nesse espaco viram serrilha.
  sono: [
    '#########',
    '.......##',
    '......##.',
    '.....##..',
    '....##...',
    '...##....',
    '..##.....',
    '.##......',
    '#########',
  ],
  // "?" com o ponto separado. Substitui o "???" que vinha do banco: tres
  // interrogacoes de 3px de largura no badge de 26px eram indistinguiveis de um
  // borrao, e uma delas ja diz a mesma coisa.
  confusao: [
    '..#####..',
    '.##...##.',
    '##.....##',
    '.......##',
    '....###..',
    '...###...',
    '...##....',
    '.........',
    '...##....',
  ],
}

// ---------------------------------------------------------------------------
// Paletas
// ---------------------------------------------------------------------------
//
// O glifo e mais CLARO que a tinta de corpo do mesmo status
// (`COR_DE_STATUS_NO_CORPO` em src/data/vfxTiras.ts) de proposito: ele e
// desenhado POR CIMA de um corpo que a tinta ja deixou naquele tom, e igualar as
// duas cores faria o glifo desaparecer exatamente nos POKE em que ele mais
// importa.
//
// Sono e confusao nao tem tinta de corpo nenhuma (os dois usam simbolo em vez de
// cor — ver a nota de `COR_DE_STATUS_NO_CORPO`), entao a cor deles responde so a
// legibilidade: branco azulado pro sono, violeta pra confusao. Violeta e nao
// ciano, que era a cor do "???" antigo, porque ciano agora e o congelamento e os
// dois podem coexistir (congelamento e nao-volatil, confusao e volatil).
const PALETAS = {
  veneno: { glifo: [0xe0, 0xa0, 0xff], mote: [0xb0, 0x50, 0xe0] },
  // Quase branco quente, e nao o creme da primeira versao: o corpo por baixo JA
  // e laranja (a tinta de queimadura o deixa assim), entao aqui nao ha contraste
  // de MATIZ pra explorar — sobra o de luminancia, e creme sobre laranja nao
  // tem nem um nem outro. E a mesma razao pela qual a chama e o unico glifo que
  // precisou de vazio interno.
  queimadura: { glifo: [0xff, 0xf6, 0xd0], mote: [0xff, 0x7a, 0x1a] },
  paralisia: { glifo: [0xff, 0xff, 0x9a], mote: [0xff, 0xd2, 0x1a] },
  congelamento: { glifo: [0xd8, 0xfb, 0xff], mote: [0x3f, 0xe0, 0xff] },
  sono: { glifo: [0xeb, 0xf0, 0xff], mote: [0x9f, 0xb4, 0xe8] },
  confusao: { glifo: [0xff, 0xd8, 0xff], mote: [0xd0, 0x60, 0xff] },
}

// Contorno: quase preto com um resto de violeta, e nao preto puro — sobre a
// sprite escura de um Gengar o preto puro some e o glifo perde a borda dos dois
// lados. Alpha 210 e nao 255 pelo mesmo motivo ao contrario: contorno solido
// sobre POKE claro le como adesivo colado na sprite.
const CONTORNO = [0x14, 0x0c, 0x1e, 210]

// ---------------------------------------------------------------------------
// Geometrias
// ---------------------------------------------------------------------------

/**
 * Sobre o corpo: `TIRA_POR_CONDICAO_NO_CORPO`, opacidade 0,75.
 *
 * `anel.cy` NO MEIO DO QUADRO, e isso e correcao de um erro medido, nao gosto.
 * A primeira versao poe o anel em 33 (69% da altura) raciocinando "o glifo em
 * cima, o anel embaixo" — e `scripts/harness/condicao-sobre-o-corpo.mjs`, que
 * compoe no tamanho de jogo, mostrou o resultado: os motes caem ABAIXO da
 * silhueta, e tres circulos amarelos parados no chao ao lado de um POKE leem
 * como moeda dropada, num jogo que dropa moeda. Centrado, o anel orbita o
 * tronco e volta a ler como aura.
 */
const SOBRE_O_CORPO = {
  lado: 48,
  glifoEscala: 2,
  glifoTopo: 2,
  // NO CANTO SUPERIOR DIREITO, e nao centrado no topo. Centrado, a bancada
  // mostrou o glifo caindo em cima da CARA do POKE em toda especie de cabeca
  // larga e baixa — o cranio do veneno tapava um olho do Gengar e metade do
  // sorriso dele. O canto e a mesma escolha que o canal de badge ja faz
  // (`entity.x + entity.radius * 0.9` em render/sprites.ts): fica encostado na
  // silhueta, legivel, e fora do rosto.
  glifoAlinhamento: 'direita',
  anel: { cy: 26, rx: 20, ry: 8, motes: 6, raioFrente: 2, raioTras: 1 },
}

/**
 * Badge de canto: 26px fixos ao lado da cabeca.
 *
 * `cy` tem que caber `ry * (1 + RESPIRO) + raioFrente` ate a borda de baixo. Na
 * primeira versao ficou em 34 e o anel saia CORTADO no quadro — visivel na
 * folha de contato como meia bolinha rente ao fim da celula, e em jogo como um
 * risco reto sob o glifo.
 */
const BADGE = {
  lado: 40,
  glifoEscala: 3,
  glifoTopo: 3,
  // Centrado: a tira INTEIRA ja e posicionada ao lado da cabeca por
  // render/sprites.ts, entao deslocar o glifo dentro dela o empurraria pra fora
  // do proprio slot.
  glifoAlinhamento: 'centro',
  anel: { cy: 31, rx: 13, ry: 4, motes: 4, raioFrente: 2, raioTras: 1 },
}


// Quanto o anel "respira" ao longo do ciclo, em fracao do raio. Uma volta
// completa dos motes ja da movimento; a respiracao existe pra o anel nao ficar
// legivel como um numero fixo de pontos girando, que a 8fps le como catraca.
const RESPIRO = 0.08

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

/**
 * Uma tira horizontal RGBA — quadro `f` nas colunas [f*lado, f*lado+lado).
 *
 * Duas passadas por quadro, e a ordem importa: tudo aceso primeiro, contorno
 * depois, olhando o que ficou aceso. Contornar durante o desenho pintaria
 * contorno em cima do mote seguinte quando dois se encostam.
 */
function tira(nome, geo) {
  const { lado, glifoEscala, glifoTopo, glifoAlinhamento, anel } = geo
  const largura = QUADROS * lado
  const buf = new Uint8Array(largura * lado * 4)
  const glifo = GLIFOS[nome]
  const cor = PALETAS[nome]

  const indice = (f, x, y) => (y * largura + f * lado + x) * 4
  const dentro = (x, y) => x >= 0 && y >= 0 && x < lado && y < lado
  const aceso = (f, x, y) => dentro(x, y) && buf[indice(f, x, y) + 3] > 0
  const pintar = (f, x, y, [r, g, b], a = 255) => {
    if (!dentro(x, y)) return
    const i = indice(f, x, y)
    // Nao sobrescreve pixel mais opaco: o glifo entra depois do anel e um mote
    // que passe atras do glifo nao pode comer o traco dele.
    if (buf[i + 3] >= a) return
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
  }

  const glifoLargura = glifo[0].length * glifoEscala
  // 2px de margem, e nao 0: o contorno escuro precisa de uma coluna livre pra
  // existir, e rente a borda o glifo sai sem borda do lado de fora.
  const glifoX = glifoAlinhamento === 'direita'
    ? lado - glifoLargura - 2
    : Math.round((lado - glifoLargura) / 2)

  for (let f = 0; f < QUADROS; f++) {
    const fase = f / QUADROS
    const volta = fase * Math.PI * 2

    // --- anel de motes ---
    const rx = anel.rx * (1 + RESPIRO * Math.sin(volta))
    const ry = anel.ry * (1 + RESPIRO * Math.sin(volta))
    for (let m = 0; m < anel.motes; m++) {
      const ang = volta + (m / anel.motes) * Math.PI * 2
      const frente = Math.sin(ang) > 0
      const mx = Math.round(lado / 2 + rx * Math.cos(ang))
      const my = Math.round(anel.cy + ry * Math.sin(ang))
      const braco = frente ? anel.raioFrente : anel.raioTras
      const alpha = frente ? 255 : 140
      // FAISCA DE QUATRO PONTAS, e nao disco. A primeira versao desenha disco, e
      // `condicao-sobre-o-corpo.mjs` no tamanho de jogo mostrou por que isso nao
      // serve: um circulo amarelo solido de 2px de raio, com contorno escuro, ao
      // lado de um POKE, e visualmente uma MOEDA — e o jogo dropa moeda. A cruz
      // de bracos finos le como luz, que e o que ela e.
      pintar(f, mx, my, cor.mote, alpha)
      for (let d = 1; d <= braco; d++) {
        pintar(f, mx + d, my, cor.mote, alpha)
        pintar(f, mx - d, my, cor.mote, alpha)
        pintar(f, mx, my + d, cor.mote, alpha)
        pintar(f, mx, my - d, cor.mote, alpha)
      }
    }

    // --- glifo, balancando 1px ---
    const bob = Math.round(Math.sin(volta))
    glifo.forEach((linha, gy) => {
      for (let gx = 0; gx < linha.length; gx++) {
        if (linha[gx] !== '#') continue
        for (let sy = 0; sy < glifoEscala; sy++) {
          for (let sx = 0; sx < glifoEscala; sx++) {
            pintar(f, glifoX + gx * glifoEscala + sx, glifoTopo + bob + gy * glifoEscala + sy, cor.glifo)
          }
        }
      }
    })

    // --- contorno: todo pixel APAGADO vizinho de aceso ---
    // Vizinhanca de 8 e nao de 4: com 4, a diagonal do raio de paralisia fica
    // com o degrau sem borda e o glifo vaza pro corpo nos cantos.
    const aContornar = []
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        if (aceso(f, x, y)) continue
        let vizinho = false
        for (let dy = -1; dy <= 1 && !vizinho; dy++) {
          for (let dx = -1; dx <= 1 && !vizinho; dx++) {
            if (dx === 0 && dy === 0) continue
            if (aceso(f, x + dx, y + dy)) vizinho = true
          }
        }
        if (vizinho) aContornar.push([x, y])
      }
    }
    for (const [x, y] of aContornar) {
      const i = indice(f, x, y)
      buf[i] = CONTORNO[0]; buf[i + 1] = CONTORNO[1]; buf[i + 2] = CONTORNO[2]; buf[i + 3] = CONTORNO[3]
    }
  }

  return { buf, largura, altura: lado }
}

// ---------------------------------------------------------------------------
// O ENCODER PNG SAIU DAQUI (PH-416).
//
// Ele era uma copia de 30 linhas, herdada de `gerar-sprite-sono.mjs`, e o
// gerador de estagio ia fazer a TERCEIRA. Encoder duplicado nao e problema
// estetico: o primeiro que ganhar uma correcao deixa o outro para tras em
// silencio, e os dois conjuntos de arte passam a sair com bytes diferentes sem
// ninguem notar. Foi o que quase aconteceu — `scripts/vfx/png.mjs` ganhou a
// correcao do `byteOffset` e a guarda de tamanho, e esta copia nao tinha
// nenhuma das duas.
//
// Agora ele vive em `scripts/vfx/png.mjs`, importado no topo.

// ---------------------------------------------------------------------------

// Qual status vai em qual canal. Espelha `TIRA_POR_CONDICAO_NO_CORPO` e o par
// TIRA_SONO/TIRA_CONFUSAO de src/data/vfxTiras.ts — mudar aqui sem mudar la
// gera arte na proporcao errada pro slot, que aparece como glifo minusculo (arte
// de corpo no badge) ou glifo estourado (o contrario).
const CANAL = {
  veneno: SOBRE_O_CORPO,
  queimadura: SOBRE_O_CORPO,
  paralisia: SOBRE_O_CORPO,
  congelamento: SOBRE_O_CORPO,
  sono: BADGE,
  confusao: BADGE,
}

for (const [nome, geo] of Object.entries(CANAL)) {
  const { buf, largura, altura } = tira(nome, geo)
  const saida = `assets/status-vfx/${nome}.png`
  writeFileSync(saida, png(largura, altura, buf))
  const canal = geo === BADGE ? 'badge' : 'corpo'
  console.log(`${saida}: ${QUADROS} quadros de ${geo.lado}x${geo.lado} (${canal})`)
}
