// Gerador do SELO de MUDANCA DE ATRIBUTO — uma peca por atributo x direcao.
//
// O QUE ELE SUBSTITUI, E POR QUE (duas vezes)
// -----------------------------------------------------------------------------
// PRIMEIRA VEZ (PH-416). A arte era 32 GIFs em
// `assets/move-vfx/status/{aumenta,diminui}/` — 16 tipos elementais x 2
// direcoes, garimpados de acervo. Ela variava com o TIPO do POKE e com a
// direcao, e NUNCA com o atributo: Ataque caindo e Velocidade caindo desenhavam
// exatamente a mesma coisa. A partir da PH-416 a arte varia com o ATRIBUTO, que
// e a informacao que o jogador nao tem por nenhum outro canal.
//
// SEGUNDA VEZ (PH-480), e e esta a arte que o arquivo gera hoje. A peca da
// PH-416 era uma TIRA de 16 quadros de 48x48 desenhada no CENTRO DO CORPO do
// alvo — mesmo lugar, mesmo tamanho e mesma duracao da arte de impacto de um
// golpe de dano. Pedido do dono, textual:
//
//   "os efeitos de status ficaram muito ruins, eles estao sendo aplicados como
//    se fossem sprites de ataque, sobrepondo as sprites de ataque. Como eles sao
//    apenas indicador de alteracao de stats, vamos fazer algo bem simples, uns
//    icones bem pequenos"
//
// Entao a peca deixou de ser cena e virou SELO: um quadro so, 21x13, desenhado
// no flanco do alvo (era acima da cabeca ate a PH-485, e ali ele caia em cima da
// placa de nome). Sem motes, sem animacao de quadro — o movimento que sobrou e
// a subida/descida de 6px que o motor faz com o proprio selo, e ela e de graca.
//
// A GRAMATICA DO SELO
// -----------------------------------------------------------------------------
//   GLIFO 9x9        o canal "QUAL atributo". Os mesmos nove por nove da
//                    PH-416, em escala 1 — 9px de verdade, que e a resolucao em
//                    que eles foram desenhados.
//   SETA 5x7         o canal "SUBIU ou DESCEU". Ela agora e obrigatoria: sem os
//                    motes, a direcao nao tem outro canal na FORMA.
//   ARTE SEM COR     quase branca com contorno escuro. A cor entra no desenho —
//                    e desde a PH-480 ela e a cor da DIRECAO (verde/vermelho),
//                    nao a do tipo elemental. Num selo de 13px de altura o que
//                    o jogador precisa ler e subiu-ou-desceu; o tipo do golpe ja
//                    esta dito pelo resto da cena.
//
// POR QUE A SETA VOLTOU, DEPOIS DE A PH-416 TER REPROVADO DIRECAO NA FORMA
// -----------------------------------------------------------------------------
// A PH-416 reprovou tres tentativas de por direcao na forma (so os motes;
// chevron SOB o glifo; eco do glifo) e todas falharam pelo mesmo motivo: elas
// disputavam a MESMA silhueta que o glifo usa pra dizer qual atributo e. A seta
// aqui nao disputa nada — ela mora numa segunda coluna do selo, ao lado do
// glifo, com o proprio contorno. E ela e obrigatoria porque o canal que
// carregava a direcao (o movimento dos motes ao longo de 16 quadros) deixou de
// existir.
//
// COMO RODAR
//   node scripts/gerar-estagio-vfx.mjs
//
// COMO OLHAR O RESULTADO
//   node scripts/harness/folha-de-estagio.mjs   (folha de contato: o selo 1:1,
//   ampliado, e sobre os tres fundos)
import { writeFileSync, mkdirSync } from 'node:fs'
import { png } from './vfx/png.mjs'

/**
 * O selo tem UM quadro. A constante existe pra o resto do arquivo (e a bancada)
 * nao ter que saber disso por um `1` solto.
 */
const QUADROS = 1

/**
 * A escala do pixel art, e ela DECIDE o tamanho do selo inteiro.
 *
 * 1, e o numero foi MEDIDO na bancada `selo-sobre-o-poke.mjs`, que compoe o selo
 * ao lado do CORPO REAL no tamanho de jogo — a sprite de batalha aparece com ~34px
 * de altura de mundo (`ALTURA_CORPO` em `condicao-sobre-o-corpo.mjs`).
 *
 *   escala 1   21x13   38% da altura do corpo   <- escolhida
 *   escala 2   40x24   71% da altura do corpo
 *   (a peca anterior, PH-416)  48x48  141% do corpo, e desenhada no meio dele)
 *
 * Julgar o selo sozinho responde a pergunta errada, e foi assim que a peca
 * anterior passou: numa folha de contato ela parecia do tamanho certo. Sobre o
 * corpo, ela era MAIOR que o POKE inteiro — e era exatamente isso que fazia ela
 * ler como cena de ataque em vez de indicador. Na escala 2 o selo ainda fica
 * quase tao largo quanto o Pikachu; so a 1 ele le como chapa pequena ao lado da
 * cabeca, que e o pedido ("uns icones bem pequenos").
 *
 * INTEIRA por obrigacao: pixel art em escala fracionaria amostra irregular e o
 * traco de 1px do glifo some em metade das linhas. Escala 1 significa os 9x9
 * desenhados 1:1, que e a resolucao em que eles foram feitos.
 */
export const GLIFO_ESCALA_PADRAO = 1

/**
 * As medidas do selo saem da SOMA das pecas, e nao de gosto:
 *
 *   margem + glifo (9x9) + vao + seta (5x7) + margem   de largura
 *   margem + glifo (9x9) + margem                      de altura
 *
 * A margem e `contorno + 1`: o contorno precisa caber inteiro dentro do quadro,
 * senao ele sai cortado na borda e a peca le como recortada.
 *
 * O VAO E 3 (em unidade de grade), e nao 1. Com 1 os contornos de glifo e seta
 * se encostam e fecham o vao inteiro numa barra escura — as duas pecas viram uma
 * silhueta so. Com 3 sobra vao transparente no meio, que e o que separa.
 */
export function dimensoesDoSelo(escala = GLIFO_ESCALA_PADRAO) {
  const contorno = escala
  const margem = contorno + 1
  return {
    escala,
    contorno,
    margem,
    largura: margem * 2 + (9 + 3 + 5) * escala,
    altura: margem * 2 + 9 * escala,
  }
}

export const SELO_LARGURA = dimensoesDoSelo().largura
export const SELO_ALTURA = dimensoesDoSelo().altura

// ---------------------------------------------------------------------------
// Glifos — pixel art 9x9, `#` aceso
// ---------------------------------------------------------------------------
//
// A REGRA QUE AS PASSADAS ENSINARAM: no tamanho de jogo sobrevive SILHUETA e
// CHEIO-VS-OCO, nao detalhe interno. Todo par que se separava por detalhe
// colidiu na reducao pra 26px e teve que ser redesenhado.
export const GLIFOS = {
  // Lamina DIAGONAL. A primeira versao e uma espada vertical com guarda, e ela
  // reprovou duas vezes: com guarda de 1 linha a guarda desaparece na reducao e
  // sobra uma barra; com guarda de 2 linhas o glifo le como cruz. A diagonal e
  // o que separa de tudo o mais no conjunto — nenhum outro glifo e inclinado.
  atkFis: [
    '......###',
    '.....###.',
    '....###..',
    '.#.###...',
    '.####....',
    '###.#....',
    '##..#....',
    '.#...#...',
    '.........',
  ],
  // Estrela de quatro pontas com centro cheio: "ataque, mas nao com o corpo".
  // Mesma familia de brilho que o jogo ja usa pra shiny.
  atkEsp: [
    '....#....',
    '...###...',
    '...###...',
    '.#######.',
    '#########',
    '.#######.',
    '...###...',
    '...###...',
    '....#....',
  ],
  // Escudo OCO.
  def: [
    '#########',
    '#########',
    '##.....##',
    '##.....##',
    '.##...##.',
    '.##...##.',
    '..##.##..',
    '...###...',
    '....#....',
  ],
  // Escudo CHEIO. Contra o oco, e a distincao que sobrevive a qualquer reducao —
  // as duas primeiras versoes eram os dois ocos com 2px de diferenca e colidiam
  // a 26px, que e exatamente o defeito que a PH-121 documentou no selo.
  defEsp: [
    '#########',
    '#########',
    '#########',
    '#########',
    '.#######.',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
  ],
  // UM chevron grosso com rastro. A primeira versao tinha tres chevrons
  // separados e eles fundiram num borrao na reducao; a segunda ligou os tres por
  // uma haste e saiu asterisco quebrado.
  speed: [
    '..#......',
    '..##.....',
    '..###....',
    '####.##..',
    '#####.##.',
    '####.##..',
    '..###....',
    '..##.....',
    '..#......',
  ],
  // Mira. O unico glifo aprovado na primeira passada.
  accuracy: [
    '....#....',
    '..#####..',
    '.##...##.',
    '##..#..##',
    '##.###.##',
    '##..#..##',
    '.##...##.',
    '..#####..',
    '....#....',
  ],
  // Silhueta com base quebrada: "dificil de acertar". O vazio na base e o que
  // diz "nao esta totalmente ali".
  evasion: [
    '..#####..',
    '.#######.',
    '##.###.##',
    '##.###.##',
    '#########',
    '#########',
    '#.#.#.#.#',
    '..#...#..',
    '.#.....#.',
  ],
  // AMPULHETA, e ela e a terceira tentativa desta peca.
  //
  //   anel aberto  colidiu com `accuracy`, que tambem e anel: a 26px os dois
  //                separavam so pelo miolo;
  //   X            colidiu com `atkEsp` por ser RADIAL — os motes fundem com os
  //                bracos e sai um boneco.
  //
  // A cintura resolve: nenhum outro glifo do conjunto tem estreitamento no meio,
  // entao a silhueta e unica sem depender de detalhe interno. E ela diz a coisa
  // certa — condicao aplicada e um PRAZO que comeca a correr, e desde a PH-422 o
  // jogo mostra esse prazo em segundos.
  condicao: [
    '#########',
    '.#######.',
    '..#####..',
    '...###...',
    '....#....',
    '...###...',
    '..#####..',
    '.#######.',
    '#########',
  ],
}

/**
 * Quase branco, e nao branco puro: o `multiply` do desenho usa o valor do pixel
 * como fator, entao 255 puro devolveria a cor da direcao sem nenhuma variacao de
 * luminancia e o glifo ficaria chapado.
 */
const BRANCO = [0xf4, 0xf8, 0xff]

/**
 * Contorno de 2px com alpha 235, e os dois numeros sao correcao de defeito.
 *
 * A arte de condicao da PH-416 usa 1px com alpha 210, e la funciona porque
 * aquela arte tem COR propria. Esta e quase branca de proposito (a cor vem do
 * tipo), entao sobre um POKE claro ela ficava SEM borda nenhuma — visivel na
 * faixa clara da folha de contato. 2px sobrevive a reducao pra 26px; 1px vira
 * meio pixel e desaparece.
 */
const CONTORNO = [0x14, 0x0c, 0x1e, 235]

/**
 * A seta, 5x7. Ela e o canal de DIRECAO do selo — o unico, desde que os motes
 * sairam junto com os 16 quadros.
 *
 * Haste de 1px de largura e cabeca de 5: e o menor desenho que ainda le como
 * seta em escala 2 (10x14 de verdade). Com haste de 3 a peca vira um "T" gordo
 * ao lado do glifo e as duas silhuetas competem.
 */
const SETA_CIMA = [
  '..#..',
  '.###.',
  '#####',
  '..#..',
  '..#..',
  '..#..',
  '..#..',
]

/** A de baixo e a de cima espelhada na vertical — nao um segundo desenho. */
const SETA_BAIXO = [...SETA_CIMA].reverse()

/**
 * Um selo RGBA de SELO_LARGURA x SELO_ALTURA, quadro unico.
 *
 * `direcao` vira a seta. `condicao` e a peca sem atributo (golpe que aplica
 * veneno/sono/confusao) e sai SEM seta, centrada: nao ha estagio pra medir
 * direcao ali, e uma seta inventada mentiria.
 */
export function selo(nome, direcao, escala = GLIFO_ESCALA_PADRAO) {
  const { largura, altura, margem, contorno: CONTORNO_PX } = dimensoesDoSelo(escala)
  const GLIFO_ESCALA = escala
  const SETA_ESCALA = escala
  const buf = new Uint8Array(largura * altura * 4)
  const glifo = GLIFOS[nome]
  const comSeta = nome !== 'condicao'

  const indice = (x, y) => (y * largura + x) * 4
  const dentro = (x, y) => x >= 0 && y >= 0 && x < largura && y < altura
  const aceso = (x, y) => dentro(x, y) && buf[indice(x, y) + 3] > 0
  const pintar = (x, y, [r, g, b], a = 255) => {
    if (!dentro(x, y)) return
    const i = indice(x, y)
    // Mesma regra da PH-416: nao sobrescreve pixel mais opaco. Aqui ela protege
    // o glifo do contorno da seta quando os dois se encostam no vao de 2px.
    if (buf[i + 3] >= a) return
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
  }

  const estampar = (grade, escala, x0, y0) => {
    for (let gy = 0; gy < grade.length; gy++) {
      for (let gx = 0; gx < grade[gy].length; gx++) {
        if (grade[gy][gx] !== '#') continue
        for (let sy = 0; sy < escala; sy++) {
          for (let sx = 0; sx < escala; sx++) pintar(x0 + gx * escala + sx, y0 + gy * escala + sy, BRANCO)
        }
      }
    }
  }

  const glifoLargura = glifo[0].length * GLIFO_ESCALA
  const glifoAltura = glifo.length * GLIFO_ESCALA
  const glifoTopo = Math.round((altura - glifoAltura) / 2)
  // Com seta, o glifo mora na coluna da esquerda; sem ela, no centro do selo.
  const glifoX = comSeta ? margem : Math.round((largura - glifoLargura) / 2)
  estampar(glifo, GLIFO_ESCALA, glifoX, glifoTopo)

  if (comSeta) {
    const seta = direcao === 'aumenta' ? SETA_CIMA : SETA_BAIXO
    const setaLargura = seta[0].length * SETA_ESCALA
    const setaAltura = seta.length * SETA_ESCALA
    estampar(
      seta, SETA_ESCALA,
      largura - margem - setaLargura,
      Math.round((altura - setaAltura) / 2),
    )
  }

  // Contorno por ULTIMO, olhando o que ficou aceso — contornar durante o desenho
  // pintaria borda em cima do vizinho que ainda nao existe.
  for (let passo = 0; passo < CONTORNO_PX; passo++) {
    const borda = []
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        if (aceso(x, y)) continue
        if (aceso(x - 1, y) || aceso(x + 1, y) || aceso(x, y - 1) || aceso(x, y + 1)) borda.push([x, y])
      }
    }
    for (const [x, y] of borda) pintar(x, y, CONTORNO.slice(0, 3), CONTORNO[3])
  }

  return { buf, largura, altura }
}

/** Os sete atributos de estagio, na ordem de `ROTULO_ESTAGIO`. */
export const ATRIBUTOS = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed', 'accuracy', 'evasion']

/** As 15 pecas: cada atributo nas duas direcoes, e a condicao numa so. */
export function pecas() {
  const lista = []
  for (const a of ATRIBUTOS) {
    lista.push([a, 'aumenta'])
    lista.push([a, 'diminui'])
  }
  // Condicao nao tem direcao pra medir — ela e sempre "algo pegou".
  lista.push(['condicao', 'diminui'])
  return lista
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('gerar-estagio-vfx.mjs')) {
  mkdirSync('assets/estagio-vfx', { recursive: true })
  let total = 0
  for (const [nome, direcao] of pecas()) {
    const { buf, largura, altura } = selo(nome, direcao)
    const arquivo = nome === 'condicao' ? 'condicao.png' : `${nome}-${direcao}.png`
    const saida = `assets/estagio-vfx/${arquivo}`
    const bytes = png(largura, altura, buf)
    writeFileSync(saida, bytes)
    total += bytes.length
    console.log(`${saida}: ${QUADROS} quadro de ${largura}x${altura} (${bytes.length} bytes)`)
  }
  console.log(`\n${pecas().length} selos, ${total} bytes no total`)
}
