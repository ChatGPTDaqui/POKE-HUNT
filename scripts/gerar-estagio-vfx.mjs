// Gerador da arte de MUDANCA DE ATRIBUTO — uma tira por atributo x direcao.
//
// O QUE ELE SUBSTITUI, E POR QUE
// -----------------------------------------------------------------------------
// A arte antiga eram 32 GIFs em `assets/move-vfx/status/{aumenta,diminui}/` —
// 16 tipos elementais x 2 direcoes, garimpados de acervo. Ela varia com o TIPO
// do POKE e com a direcao, e NUNCA com o atributo: Ataque caindo e Velocidade
// caindo desenhavam exatamente a mesma coisa. E o mesmo defeito que a PH-121 ja
// tinha corrigido no selo do HUD e que continuava de pe no mundo.
//
// Agora a arte varia com o ATRIBUTO, que e a informacao que o jogador nao tem
// por nenhum outro canal, e a COR vem do tipo do golpe, aplicada no desenho
// (`sprites.ts`). Assar a cor daria 15 x 16 tipos = 240 arquivos.
//
// A GRAMATICA, E O QUE ELA HERDA DA PH-416
// -----------------------------------------------------------------------------
//   GLIFO 9x9        o canal "QUAL atributo". Mesma grade, mesmo peso de traco
//                    e mesmo contorno da arte de condicao, pra as duas familias
//                    parecerem do mesmo jogo. Escala 3 (27px dos 48), que e a
//                    proporcao que o badge da PH-416 usa.
//   MOTES            o canal "SUBIU ou DESCEU", por MOVIMENTO: nascem embaixo e
//                    sobem, ou nascem em cima e caem, convergindo no destino.
//   ARTE SEM COR     quase branca com contorno escuro. A cor e do tipo, no
//                    desenho.
//
// A PH-416 usa anel ORBITANDO porque la o efeito e um ESTADO que persiste; aqui
// e um LANCAMENTO, um instante — e orbita nao tem cima nem baixo.
//
// A DIRECAO NAO ESTA NO GLIFO, E ISSO FOI MEDIDO
// -----------------------------------------------------------------------------
// Tres tentativas de por direcao na FORMA, todas reprovadas em folha de contato
// no tamanho de jogo:
//
//   1. so os motes            duas pecas identicas em quadro parado;
//   2. chevron sob o glifo    as 15 pecas viraram o mesmo borrao — o chevron
//                             acrescenta silhueta e come a distincao que o
//                             glifo existe pra dar;
//   3. eco do glifo           o glifo solido cobre o eco e sobra uma faixa de
//                             5px, que em forma cheia (escudo) sai reta e le
//                             como artefato de render.
//
// A quarta resposta e a que o `statIcones.ts` ja tinha escrito na PH-121: "A
// DIRECAO NAO MORA AQUI de proposito. Ela ja e comunicada por dois canais no
// selo, e duplicar no icone gastaria a unica coisa que o icone tem pra dizer:
// QUAL atributo." Hoje sao TRES canais, nao dois — a PH-421 acrescentou o
// flutuante, que diz `Ataque 2x` contra `Ataque 0,67x`.
//
// Cada par continua tendo DUAS tiras (o glifo e o mesmo, os motes correm ao
// contrario) porque tocar a tira invertida no motor inverteria tambem o
// esmaecimento dos motes — eles apagam no fim do percurso, e de tras pra frente
// acenderiam no fim. 15 arquivos a ~1,9KB e mais barato que essa complexidade.
//
// COMO RODAR
//   node scripts/gerar-estagio-vfx.mjs
//
// COMO OLHAR O RESULTADO
//   node scripts/harness/folha-de-estagio.mjs   (folha de contato, com o teste
//   de reducao pra 26px — o unico que diz se a arte sobrevive ao tamanho real)
import { writeFileSync, mkdirSync } from 'node:fs'
import { png } from './vfx/png.mjs'

/** Uniforme com a arte de condicao da PH-416, pelo mesmo motivo dela. */
const QUADROS = 16
const LADO = 48

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
 * como fator, entao 255 puro devolveria a cor do tipo sem nenhuma variacao de
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
const CONTORNO_PX = 2
const GLIFO_ESCALA = 3
const MOTES = 5

/** Uma tira horizontal RGBA — quadro `f` nas colunas [f*LADO, f*LADO+LADO). */
export function tira(nome, direcao) {
  const largura = QUADROS * LADO
  const buf = new Uint8Array(largura * LADO * 4)
  const glifo = GLIFOS[nome]

  const indice = (f, x, y) => (y * largura + f * LADO + x) * 4
  const dentro = (x, y) => x >= 0 && y >= 0 && x < LADO && y < LADO
  const aceso = (f, x, y) => dentro(x, y) && buf[indice(f, x, y) + 3] > 0
  const pintar = (f, x, y, [r, g, b], a = 255) => {
    if (!dentro(x, y)) return
    const i = indice(f, x, y)
    // Nao sobrescreve pixel mais opaco: o glifo entra depois dos motes e um mote
    // que passe atras dele nao pode comer o traco.
    if (buf[i + 3] >= a) return
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a
  }

  const glifoLargura = glifo[0].length * GLIFO_ESCALA
  const glifoX = Math.round((LADO - glifoLargura) / 2)
  const glifoTopo = Math.round((LADO - glifo.length * GLIFO_ESCALA) / 2)

  for (let f = 0; f < QUADROS; f++) {
    const fase = f / QUADROS

    for (let m = 0; m < MOTES; m++) {
      // Fase propria por mote, deslocada: sem isto a coluna pulsa junto e le
      // como piscada em vez de fluxo.
      const p = (fase + m / MOTES) % 1
      const y = direcao === 'aumenta'
        ? Math.round((LADO - 4) - p * (LADO - 10))
        : Math.round(6 + p * (LADO - 10))
      // CONVERGE no destino em vez de abrir simetrico. Abrindo nas duas pontas,
      // subir e descer davam a MESMA silhueta.
      const abertura = direcao === 'aumenta' ? (1 - p) : p
      const x = Math.round(LADO / 2 + Math.sin(m * 2.4) * 15 * abertura)
      const raio = p < 0.7 ? 2 : 1
      const alpha = Math.round(255 * Math.min(1, (1 - p) * 2.2))
      for (let dy = -raio; dy <= raio; dy++) {
        for (let dx = -raio; dx <= raio; dx++) {
          if (dx * dx + dy * dy > raio * raio + 1) continue
          pintar(f, x + dx, y + dy, BRANCO, alpha)
        }
      }
    }

    // Balanco de 1px pra o glifo nao ficar cravado no quadro.
    const balanco = Math.round(Math.sin(fase * Math.PI * 2))
    for (let gy = 0; gy < glifo.length; gy++) {
      for (let gx = 0; gx < glifo[gy].length; gx++) {
        if (glifo[gy][gx] !== '#') continue
        for (let sy = 0; sy < GLIFO_ESCALA; sy++) {
          for (let sx = 0; sx < GLIFO_ESCALA; sx++) {
            pintar(f, glifoX + gx * GLIFO_ESCALA + sx, glifoTopo + balanco + gy * GLIFO_ESCALA + sy, BRANCO)
          }
        }
      }
    }

    // Contorno por ULTIMO, olhando o que ficou aceso — contornar durante o
    // desenho pintaria borda em cima do mote seguinte quando dois se encostam.
    for (let passo = 0; passo < CONTORNO_PX; passo++) {
      const borda = []
      for (let y = 0; y < LADO; y++) {
        for (let x = 0; x < LADO; x++) {
          if (aceso(f, x, y)) continue
          if (aceso(f, x - 1, y) || aceso(f, x + 1, y) || aceso(f, x, y - 1) || aceso(f, x, y + 1)) borda.push([x, y])
        }
      }
      for (const [x, y] of borda) pintar(f, x, y, CONTORNO.slice(0, 3), CONTORNO[3])
    }
  }
  return { buf, largura, altura: LADO }
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
    const { buf, largura, altura } = tira(nome, direcao)
    const arquivo = nome === 'condicao' ? 'condicao.png' : `${nome}-${direcao}.png`
    const saida = `assets/estagio-vfx/${arquivo}`
    const bytes = png(largura, altura, buf)
    writeFileSync(saida, bytes)
    total += bytes.length
    console.log(`${saida}: ${QUADROS} quadros de ${LADO}x${LADO} (${bytes.length} bytes)`)
  }
  console.log(`\n${pecas().length} tiras, ${total} bytes no total`)
}
