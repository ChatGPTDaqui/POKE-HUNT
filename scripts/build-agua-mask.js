// Deriva a MASCARA DE AGUA de cada arte de fundo, pra a camada ambiente
// (render/ambiente.ts) ondular so onde ha agua (PH-113).
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------------------------------------------------------
// O PH-96 entregou a camada ambiente por bioma e registrou a limitacao em voz
// alta no cabecalho de `ambiente.ts`: o preset de agua "nao sabe onde a agua
// esta, entao ele passa por cima de terra tambem", e por isso ele nasceu o mais
// discreto de todos. Ondulacao visivel sem mascara faria a AREIA ondular.
//
// ---------------------------------------------------------------------------
// TRES SINAIS, E DOIS DELES JA EXISTIAM
// ---------------------------------------------------------------------------
// Cor sozinha erra feio: ceu azul, telhado azul e flor azul passam por agua. Os
// dois primeiros sinais abaixo derrubam quase todo falso positivo antes de
// olhar um pixel de cor.
//
// 1. COLISAO PINTADA (`subBiomaCollision.generated.ts`). Na convencao
//    `rosa_anda`, rosa e a UNICA area andavel — logo a agua esta
//    necessariamente entre as celulas BLOQUEADAS. Isso elimina a faixa de
//    areia/chao de graca, e sem ler a arte. As 5 artes de agua (sea, lake,
//    beach, island, swamp) tem pintura desde a leva de 2026-08-18.
//
// 2. FAIXA VERTICAL. Nessas artes a agua esta na metade de baixo e o ceu em
//    cima. `CORTE_CEU` descarta o topo, que e o falso positivo mais obvio da
//    prova de cor — e o unico que os outros dois sinais NAO pegam, porque ceu
//    tambem e bloqueado e tambem e azul e liso.
//
// 3. COR + VARIANCIA LOCAL. Agua e azul-esverdeada E LISA. Folhagem, telhado e
//    pedra tem textura, entao a variancia local os derruba mesmo quando a cor
//    passa.
//
// ---------------------------------------------------------------------------
// POR QUE NAO DERIVAR NO NAVEGADOR
// ---------------------------------------------------------------------------
// O navegador decodifica JPEG de graca, o que tornaria este script e a
// dependencia `jpeg-js` desnecessarios. Recusado por dois motivos:
//
//   - Decodificar uma arte de 2048x2048 a cada troca de mapa no celular e
//     exatamente o tipo de custo que o cabecalho de `ambiente.ts` manda evitar
//     ("a unica coisa aqui que cresce sem limite natural").
//   - Mascara em memoria nao aparece no diff. Heuristica que vai errar em algum
//     mapa precisa ser AUDITAVEL — o `--relatorio` abaixo existe pra isso.
//
// ---------------------------------------------------------------------------
// USO
// ---------------------------------------------------------------------------
//   node scripts/build-agua-mask.js --relatorio   # so imprime, nao escreve
//   node scripts/build-agua-mask.js --debug       # + PNG de conferencia por arte
//   node scripts/build-agua-mask.js               # gera o .generated.ts
//
// ---------------------------------------------------------------------------
// O --debug NAO E LUXO
// ---------------------------------------------------------------------------
// Porcentagem de celulas marcadas nao diz se a mascara esta certa: "17% de
// swamp" pode ser a agua ou pode ser a copa das arvores. O overlay escreve a
// arte com as celulas marcadas tingidas, em `scripts/agua-debug/`, e e a unica
// forma de conferir isso sem abrir o jogo. Heuristica derivada de imagem sem
// saida visual e fe, nao verificacao.
const fs = require('fs')
const path = require('path')
const jpeg = require('jpeg-js')
const { decodePng } = require('./lib/png')
const { encodePng } = require('./lib/png-encode')

const RAIZ = path.join(__dirname, '..')
const DIR_ARTE = path.join(RAIZ, 'assets', 'hunt-backgrounds')
const SAIDA = path.join(RAIZ, 'src', 'data', 'generated', 'aguaMask.generated.ts')
const COLISAO = path.join(RAIZ, 'src', 'data', 'generated', 'subBiomaCollision.generated.ts')
const AMBIENTE = path.join(RAIZ, 'src', 'render', 'ambiente.ts')

/**
 * Lado da celula da mascara, em unidades de mundo.
 *
 * 20 e a MESMA celula da grade de colisao depois do PH-94 — casar as duas
 * evita a classe de bug em que a agua "existe" numa grade e nao na outra, e
 * deixa o cruzamento do sinal 1 ser indice a indice em vez de reamostragem.
 */
const CELULA = 20

/**
 * Passo da varredura dentro da celula, em pixels da arte.
 *
 * A amostra cobre a CELULA INTEIRA, e nao um quadradinho no centro dela. A
 * primeira versao usava 6x6 px fixos e reprovou no overlay: numa arte de 2048px
 * essa janela cabe DENTRO de uma folha de palmeira, que e lisa — entao a
 * variancia media dava "agua" e a mata inteira de `beach` marcava. Variancia so
 * enxerga a estrutura folha-a-folha na escala da folha, nao na do pixel.
 *
 * O passo evita ler 27x27 px por celula quando 4 em cada direcao ja descreve a
 * textura: 5 vezes menos leitura, mesma decisao.
 */
const PASSO_AMOSTRA = 3

// --- prova de cor ---------------------------------------------------------
// A FAIXA VEIO DE MEDICAO, e a primeira versao dela estava errada. Amostrando a
// metade de baixo das cinco artes, o matiz dominante e:
//
//   sea     180-210 (69%)  sat 0.51  lum 0.41   azul classico
//   island  180-210 (59%)  sat 0.64  lum 0.48
//   beach   180-210 (27%) + 150-180 (27%)
//   lake     90-120 (41%)  sat 0.41  lum 0.45   VERDE
//   swamp    60-90  (43%)  sat 0.40  lum 0.23   VERDE-BARRO, zero azul
//
// A janela inicial [150,250] pegava sea/island/beach e marcava 0.3% de `swamp`.
// Agua de pantano nao e azul, e agua de lago aqui e verde — restringir a azul
// era um erro de premissa, nao de calibragem.
const MATIZ_MIN = 60 // graus; abaixo disso e areia/terra/laranja
const MATIZ_MAX = 250 // acima disso e roxo/magenta
const SAT_MIN = 0.14 // pedra cinza e nevoa ficam abaixo
const LUM_MIN = 0.10 // preto de caverna
const LUM_MAX = 0.86 // branco de nuvem e de espuma estourada
/**
 * Variancia maxima do brilho dentro da amostra, em [0,1].
 *
 * COM A FAIXA DE MATIZ ABERTA ATE O VERDE, e este numero que faz o trabalho de
 * separar agua de VEGETACAO — as duas ocupam o mesmo matiz nestas artes. Agua e
 * lisa; folha tem borda. Sem ele, a copa de `swamp` e a mata de `lake` entram.
 *
 * Por isso ele e mais apertado que na primeira versao (era 0.055): ali o matiz
 * azul ja excluia folha, e a variancia era so reforco.
 */
const VARIANCIA_MAX = 0.022

function rgbParaHsl(r, g, b) {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0))
  else if (max === gg) h = (bb - rr) / d + 2
  else h = (rr - gg) / d + 4
  return { h: h * 60, s, l }
}

function decodificar(arquivo) {
  const buf = fs.readFileSync(arquivo)
  if (arquivo.toLowerCase().endsWith('.png')) {
    const png = decodePng(buf)
    // `decodePng` devolve o buffer em `rgba`, nao em `data` — nomes diferentes
    // pelas duas bibliotecas serem de origens diferentes.
    return { width: png.width, height: png.height, data: png.rgba }
  }
  const raw = jpeg.decode(buf, { useTArray: true })
  return { width: raw.width, height: raw.height, data: raw.data }
}

/**
 * A celula que comeca em (px,py) e mede `lado` pixels parece agua?
 *
 * `lado` vem da escala da arte, nao de constante: uma celula de 20 unidades de
 * mundo cobre mais pixels numa arte de 2048 do que numa de 1254, e e o tamanho
 * em PIXEIS que decide se a variancia enxerga textura.
 */
function pareceAgua(img, px, py, lado) {
  let somaL = 0, somaL2 = 0, n = 0
  let somaH = 0, somaS = 0
  for (let dy = 0; dy < lado; dy += PASSO_AMOSTRA) {
    for (let dx = 0; dx < lado; dx += PASSO_AMOSTRA) {
      const x = px + dx
      const y = py + dy
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const i = (y * img.width + x) * 4
      // Alpha 0 e borda transparente de PNG — nao e agua nem terra.
      if (img.data[i + 3] < 128) continue
      const { h, s, l } = rgbParaHsl(img.data[i], img.data[i + 1], img.data[i + 2])
      somaH += h; somaS += s; somaL += l; somaL2 += l * l; n++
    }
  }
  if (n === 0) return false
  const mediaL = somaL / n
  const variancia = Math.max(0, somaL2 / n - mediaL * mediaL)
  const mediaH = somaH / n
  const mediaS = somaS / n
  return mediaH >= MATIZ_MIN && mediaH <= MATIZ_MAX
    && mediaS >= SAT_MIN
    && mediaL >= LUM_MIN && mediaL <= LUM_MAX
    && variancia <= VARIANCIA_MAX
}

/**
 * As artes que o ambiente JA classifica como agua, lidas de
 * `render/ambiente.ts#PRESET_POR_ARTE`.
 *
 * ESTA E A PORTA, e ela nao e opcional. A prova de cor sozinha, solta em todas
 * as 31 artes, marcou 33% de `ice-cave`, 24% de `town-night`, 23% de
 * `metropolis` e 22% de `ruins` — gelo e pedra azulada lisa passam por agua.
 * Falso positivo em um terco dos mapas nao e excecao reportavel, e heuristica
 * errada. Com a porta, arte que nao e de agua nao tem como ondular, qualquer
 * que seja a cor dela.
 *
 * LE a lista em vez de duplicar: cadastrar uma arte de agua nova naquele
 * arquivo passa a trazer a mascara junto, e nao existe estado em que as duas
 * listas discordem — porque so ha uma.
 */
function lerArtesDeAgua() {
  const fonte = fs.readFileSync(AMBIENTE, 'utf8')
  const bloco = fonte.slice(fonte.indexOf('PRESET_POR_ARTE'))
  const fim = bloco.indexOf('\n}')
  const artes = new Set()
  for (const m of bloco.slice(0, fim).matchAll(/'([^']+)':\s*'agua'/g)) artes.add(m[1])
  // Guarda contra o parser silenciosamente vazio: sem isto, mudar o formato
  // daquele objeto geraria uma mascara VAZIA e o efeito sumiria do jogo sem
  // ninguem ver erro nenhum.
  if (artes.size === 0) throw new Error('nenhuma arte com preset agua — o parser de PRESET_POR_ARTE quebrou')
  return artes
}

/** Lê `COLISAO_POR_ARTE` do .ts gerado sem precisar compilar TypeScript. */
function lerColisao() {
  const fonte = fs.readFileSync(COLISAO, 'utf8')
  const inicio = fonte.indexOf('= {', fonte.indexOf('COLISAO_POR_ARTE'))
  const json = fonte.slice(inicio + 2).replace(/;\s*$/, '')
  return JSON.parse(json)
}

/**
 * Escreve a arte com as celulas marcadas tingidas de MAGENTA, pra conferencia a
 * olho. Magenta porque nao existe nestas artes — qualquer outra cor se
 * confundiria com o proprio cenario em algum mapa.
 *
 * Reduz pela metade: 2048px por arte vezes 5 artes e peso que ninguem precisa
 * pra julgar "a tinta caiu na agua ou na copa".
 */
function escreverOverlay(arte, img, grade, pintada) {
  const DIR = path.join(RAIZ, 'scripts', 'agua-debug')
  fs.mkdirSync(DIR, { recursive: true })
  const { escala, x: ax, y: ay } = pintada.arte
  const larguraMundo = img.width * escala
  const alturaMundo = img.height * escala

  const w = img.width >> 1
  const h = img.height >> 1
  const saida = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y * 2) * img.width + x * 2) * 4
      const dst = (y * w + x) * 4
      // Pixel -> mundo -> celula, o caminho inverso do laco principal. Feito
      // pelo inverso, e nao guardando as celulas: assim o overlay confere a
      // MESMA conta que gerou a grade, e um erro de mapeamento aparece na
      // imagem em vez de se cancelar.
      const mundoX = ax + ((x * 2) / img.width) * larguraMundo
      const mundoY = ay + ((y * 2) / img.height) * alturaMundo
      const lx = Math.floor(mundoX / CELULA)
      const ly = Math.floor(mundoY / CELULA)
      const marcada = grade[ly] && grade[ly][lx] === '1'
      if (marcada) {
        saida[dst] = Math.min(255, img.data[src] * 0.35 + 255 * 0.65)
        saida[dst + 1] = img.data[src + 1] * 0.35
        saida[dst + 2] = Math.min(255, img.data[src + 2] * 0.35 + 255 * 0.65)
      } else {
        saida[dst] = img.data[src]
        saida[dst + 1] = img.data[src + 1]
        saida[dst + 2] = img.data[src + 2]
      }
      saida[dst + 3] = 255
    }
  }
  const nome = path.basename(arte).replace(/\.(jpg|png)$/i, '') + '.png'
  fs.writeFileSync(path.join(DIR, nome), encodePng(w, h, saida))
}

function main() {
  const soRelatorio = process.argv.includes('--relatorio')
  const comDebug = process.argv.includes('--debug')
  const colisao = lerColisao()
  const artesDeAgua = lerArtesDeAgua()
  const saida = {}
  const relatorio = []

  for (const [arte, pintada] of Object.entries(colisao)) {
    // A PORTA. Arte que o ambiente nao chama de agua nao entra nem no
    // relatorio — ver `lerArtesDeAgua`.
    if (!artesDeAgua.has(arte)) continue
    const arquivo = path.join(RAIZ, arte)
    if (!fs.existsSync(arquivo)) {
      relatorio.push({ arte, erro: 'arquivo nao encontrado' })
      continue
    }
    const img = decodificar(arquivo)

    // Retangulo da arte em coordenadas de MUNDO, exatamente como o renderer
    // desenha (`drawMapBackground`): canto em arte.x/arte.y, tamanho natural
    // vezes a escala. Emitido pelo script de colisao justamente pra as duas
    // pontas nao chegarem na mesma conta por caminhos separados.
    const { escala, x: ax, y: ay } = pintada.arte
    const larguraMundo = img.width * escala
    const alturaMundo = img.height * escala

    const cols = Math.ceil(pintada.bounds.width / CELULA)
    const linhas = Math.ceil(pintada.bounds.height / CELULA)
    const grade = []
    let marcadas = 0

    for (let ly = 0; ly < linhas; ly++) {
      let linha = ''
      for (let lx = 0; lx < cols; lx++) {
        // Centro da celula em coordenadas de mundo.
        const mundoX = lx * CELULA + CELULA / 2
        const mundoY = ly * CELULA + CELULA / 2

        // A grade de colisao NAO entra mais como filtro — ver o cabecalho.

        // Mundo -> pixel da arte. Fora da arte desenhada nao ha o que amostrar.
        const u = (mundoX - ax) / larguraMundo
        const v = (mundoY - ay) / alturaMundo
        if (u < 0 || u >= 1 || v < 0 || v >= 1) { linha += '0'; continue }

        // Cor + variancia, sobre a celula INTEIRA — ver `PASSO_AMOSTRA`.
        // `u`/`v` sao o CENTRO da celula, entao volta meio lado pra pegar o
        // canto e varrer a celula toda a partir dele.
        const ladoPx = Math.max(2, Math.round(CELULA / escala))
        const ehAgua = pareceAgua(
          img,
          Math.floor(u * img.width) - (ladoPx >> 1),
          Math.floor(v * img.height) - (ladoPx >> 1),
          ladoPx,
        )
        linha += ehAgua ? '1' : '0'
        if (ehAgua) marcadas++
      }
      grade.push(linha)
    }

    if (comDebug) escreverOverlay(arte, img, grade, pintada)

    const totalCelulas = cols * linhas
    const pct = totalCelulas ? (marcadas / totalCelulas) * 100 : 0
    relatorio.push({
      arte, marcadas, totalCelulas, pct,
      cols, linhas,
    })
    // Arte sem uma celula de agua nao entra no arquivo: quem consome trata
    // ausencia como "sem ondulacao", e emitir grade toda zero seria peso morto
    // no bundle por 26 artes.
    if (marcadas > 0) saida[arte] = { grid: grade, celula: CELULA }
  }

  relatorio.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  console.log('arte'.padEnd(46), 'agua%'.padStart(7), 'celulas'.padStart(9), 'grade'.padStart(10))
  for (const r of relatorio) {
    if (r.erro) { console.log(r.arte.padEnd(46), r.erro); continue }
    console.log(
      r.arte.padEnd(46),
      r.pct.toFixed(1).padStart(7),
      `${r.marcadas}/${r.totalCelulas}`.padStart(9),
      `${r.cols}x${r.linhas}`.padStart(10),
    )
  }
  console.log(`\n${Object.keys(saida).length} arte(s) com agua marcada, de ${relatorio.length} conferidas.`)

  if (soRelatorio) {
    console.log('\n--relatorio: nada foi escrito.')
    return
  }

  const chaves = Object.keys(saida).sort()
  const corpo = chaves.map((k) => {
    const linhas = saida[k].grid.map((l) => `      "${l}",`).join('\n')
    return `  ${JSON.stringify(k)}: {\n    "celula": ${saida[k].celula},\n    "grid": [\n${linhas}\n    ],\n  },`
  }).join('\n')

  fs.writeFileSync(SAIDA, `// AUTO-GERADO por \`node scripts/build-agua-mask.js\` (PH-113).
//
// Onde ha AGUA em cada arte de fundo, pra a camada ambiente ondular so ali.
// Derivado da arte cruzando tres sinais — colisao pintada, faixa vertical e
// cor+variancia. Ver o cabecalho do script pro porque de cada um.
//
// A chave e o CAMINHO DA ARTE, igual em \`subBiomaCollision.generated.ts\`: o
// ambiente e propriedade do desenho, entao quem mostra a imagem herda a
// mascara — sub-bioma com arte propria, sub-bioma sem arte e hunt sem salas.
//
// Arte sem uma celula de agua NAO aparece aqui. Quem consome trata ausencia
// como "sem ondulacao".
//
// Nao editar a mao — rode o script de novo.
export interface MascaraDeAgua {
  /** Lado da celula em unidades de mundo. Mesma celula da grade de colisao. */
  celula: number;
  /** '1' = agua. Linha \`y\`, coluna \`x\`, a partir da origem do mundo. */
  grid: string[];
}

export const AGUA_POR_ARTE: Record<string, MascaraDeAgua> = {
${corpo}
}
`)
  console.log(`\nEscrito: ${path.relative(RAIZ, SAIDA)}`)
}

main()
