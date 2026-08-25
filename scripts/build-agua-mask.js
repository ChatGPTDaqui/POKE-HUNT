// Deriva a MASCARA DE AGUA de cada arte de fundo a partir de referencia
// PINTADA A MAO, pra a camada ambiente (render/ambiente.ts) ondular so onde ha
// agua (PH-113).
//
// ---------------------------------------------------------------------------
// POR QUE PINTADA, E NAO DERIVADA DA COR DA ARTE
// ---------------------------------------------------------------------------
// A primeira versao deste script tentou achar agua pela cor. Nao funciona neste
// acervo, e a medicao e conclusiva. Calibrando com amostras ROTULADAS em
// `swamp.jpg`:
//
//   agua centro   h=67  s=0.39 l=0.22 var=0.0069
//   mata topo     h=62  s=0.35 l=0.16 var=0.0048
//   salgueiro     h=97  s=0.40 l=0.20 var=0.0071
//
// Agua e vegetacao ocupam o MESMO ponto em matiz, saturacao, luminancia e
// textura. Nao ha plano separador — nao e questao de calibrar melhor. Em `beach`
// o mar separa (h=160, s=0.76) mas a poca (h=73, s=0.64) cai em cima do
// palmeiral (h=81, s=0.44).
//
// Tres tentativas falharam antes disso ficar claro, e cada uma vale como aviso:
//
//   1. Cor solta nas 31 artes marcou 33% de `ice-cave`, 24% de `town-night` e
//      22% de `ruins` — gelo e pedra azulada lisa passam por agua.
//   2. Cruzar com a colisao pintada saiu INVERTIDO: supor "POKE nao anda na
//      agua, logo agua e bloqueada" e o contrario da verdade — nestas artes o
//      POKE atravessa a agua e o que bloqueia e rocha e coral.
//   3. Sem a colisao, cor + variancia marcou a agua E o palmeiral inteiro de
//      `beach`; amostrar a celula toda em vez de 6px nao mudou nada.
//
// ---------------------------------------------------------------------------
// A CONVENCAO DE COR
// ---------------------------------------------------------------------------
// Mesma ideia dos `body-block-refs` que ja existem: o arquivo em
// `scripts/agua-refs/<arte>.png` e A ARTE com tinta em cima.
//
//   AZUL PURO (R<60, G<60, B>200) = AGUA. Ondula.
//   Todo o resto = ignorado.
//
// Azul PURO e nao "azulado": o azul das artes e dessaturado e tem verde
// significativo (o mar de `sea` fica em ~(60,150,190)), entao ele nunca cruza
// esse limiar. Sem exigir pureza, a propria agua desenhada contaria como tinta e
// a referencia seria inutil.
//
// ---------------------------------------------------------------------------
// USO
// ---------------------------------------------------------------------------
//   node scripts/build-agua-mask.js --rascunho   # gera refs de PARTIDA (heuristica)
//   node scripts/build-agua-mask.js --relatorio  # so imprime, nao escreve
//   node scripts/build-agua-mask.js --debug      # + PNG de conferencia por arte
//   node scripts/build-agua-mask.js              # gera o .generated.ts
//
// `beach` e a excecao, e tem script proprio: `scripts/pintar-ref-beach.js`.
// Naquela arte o MAR separa por cor com margem grande (h 177-186, s 0.69-0.81,
// contra areia h=42, palmeiral h=40, grama h=97), entao a referencia dela e
// GERADA e nao pintada — e o cabecalho daquele arquivo explica por que isso nao
// contradiz o paragrafo acima. As duas pocas da areia entram por geometria, nao
// por cor, porque a poca (h=73) cai em cima do palmeiral no espaco de cor.
//
// O `--rascunho` existe porque corrigir e mais rapido que pintar do zero: ele
// escreve em `scripts/agua-refs/` a arte com o palpite da heuristica em azul.
// O palpite ERRA (marca copa de arvore), e apagar o excesso e o trabalho. Nao
// commitar rascunho sem revisar — e por isso que ele grava com sufixo.
//
// ---------------------------------------------------------------------------
// O --debug NAO E LUXO
// ---------------------------------------------------------------------------
// Porcentagem de celulas marcadas nao diz se a mascara esta certa: "17% de
// swamp" pode ser a agua ou pode ser a copa das arvores. O overlay escreve a
// arte com as celulas marcadas tingidas, em `scripts/agua-debug/`, e foi ele
// que pegou os tres erros acima. Heuristica derivada de imagem sem saida visual
// e fe, nao verificacao.
const fs = require('fs')
const path = require('path')
const jpeg = require('jpeg-js')
const { decodePng } = require('./lib/png')
const { encodePng } = require('./lib/png-encode')

const RAIZ = path.join(__dirname, '..')
const DIR_REFS = path.join(RAIZ, 'scripts', 'agua-refs')
const DIR_DEBUG = path.join(RAIZ, 'scripts', 'agua-debug')
const SAIDA = path.join(RAIZ, 'src', 'data', 'generated', 'aguaMask.generated.ts')
const COLISAO = path.join(RAIZ, 'src', 'data', 'generated', 'subBiomaCollision.generated.ts')
const AMBIENTE = path.join(RAIZ, 'src', 'render', 'ambiente.ts')

/**
 * Lado da celula da mascara, em unidades de mundo.
 *
 * 20 e a MESMA celula da grade de colisao depois do PH-94. Casar as duas evita a
 * classe de bug em que a agua "existe" numa grade e nao na outra.
 */
const CELULA = 20

/** Passo da varredura dentro da celula, em pixels da referencia. */
const PASSO = 3

/**
 * Fracao da celula que precisa estar pintada pra ela contar como agua.
 *
 * 0.35 e nao 0.5: a borda da agua e irregular e a tinta a mao nao acompanha
 * pixel a pixel. Exigir metade comeria uma faixa de uma celula em toda a
 * margem, que e justamente onde a ondulacao mais aparece.
 */
const COBERTURA_MINIMA = 0.35

/**
 * Menor poca que ondula, em celulas.
 *
 * A referencia pintada a mao (e mais ainda o rascunho da heuristica) deixa
 * SUJEIRA: celula solta em copa de arvore, respingo de azul num telhado — e uma
 * celula de 20 unidades ondulando em cima de um pinheiro e MAIS visivel que a
 * agua certa do lado. O filtro e GEOMETRICO, nao de cor: componente conexo
 * (4-vizinhos) menor que isto cai.
 *
 * 25 saiu de CONTAR os componentes das quatro mascaras, nao de palpite:
 *
 *   sea      1 componente:  4746
 *   island   2 componentes: 1717, 131            (o 131 e a lagoa interna)
 *   lake     4 componentes: 1463, 22, 12, 8      (os tres ultimos sao mata)
 *   swamp   11 componentes: 370 ... 42, 25, 19, 9 (canal cortado por ponte)
 *
 * Ha sobreposicao: a sujeira de `lake` (22) e MAIOR que dois fragmentos de agua
 * de verdade de `swamp` (19 e 9). Nao existe corte que limpe um sem comer o
 * outro, e a escolha foi limpar: 28 celulas de 1073 em `swamp` (2,6% da agua
 * daquela arte) valem menos que ondulacao em copa de arvore no `lake`. Quem
 * quiser os dois tem o caminho certo — borracha na referencia, e ai da pra
 * baixar isto.
 *
 * O que ele NAO resolve: falso positivo GRANDE. O palmeiral de `beach` marcado
 * pelo rascunho e um bloco de centenas de celulas e passa por aqui inteiro.
 */
const MIN_CELULAS = 25

/**
 * Apaga os componentes conexos menores que `MIN_CELULAS`.
 *
 * Devolve quantas celulas e quantas ilhas cairam porque o numero tem que
 * aparecer no relatorio: um filtro que comesse 30% da agua em silencio seria
 * pior que a sujeira que ele tira.
 */
function limparIlhas(grade) {
  const linhas = grade.length
  const cols = linhas > 0 ? grade[0].length : 0
  const celulas = grade.map((l) => l.split(''))
  const visto = Array.from({ length: linhas }, () => new Uint8Array(cols))
  let removidas = 0
  const cortados = []

  for (let y = 0; y < linhas; y++) {
    for (let x = 0; x < cols; x++) {
      if (celulas[y][x] !== '1' || visto[y][x]) continue
      // Pilha explicita, e nao recursao: o componente de agua de `sea` tem
      // ~4.700 celulas, e recursao nessa profundidade estoura a pilha do node.
      const pilha = [[x, y]]
      const componente = []
      visto[y][x] = 1
      while (pilha.length > 0) {
        const [cx, cy] = pilha.pop()
        componente.push([cx, cy])
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= cols || ny >= linhas) continue
          if (visto[ny][nx] || celulas[ny][nx] !== '1') continue
          visto[ny][nx] = 1
          pilha.push([nx, ny])
        }
      }
      if (componente.length < MIN_CELULAS) {
        for (const [cx, cy] of componente) celulas[cy][cx] = '0'
        removidas += componente.length
        cortados.push(componente.length)
      }
    }
  }
  return { grade: celulas.map((l) => l.join('')), removidas, cortados }
}

function ehAzulPuro(r, g, b, a) {
  return a >= 128 && r < 60 && g < 60 && b > 200
}

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
    // `decodePng` devolve o buffer em `rgba`; `jpeg.decode` em `data`.
    return { width: png.width, height: png.height, data: png.rgba }
  }
  const raw = jpeg.decode(buf, { useTArray: true })
  return { width: raw.width, height: raw.height, data: raw.data }
}

/**
 * As artes que o ambiente JA classifica como agua, lidas de
 * `render/ambiente.ts#PRESET_POR_ARTE`.
 *
 * LE a lista em vez de duplicar: cadastrar uma arte de agua nova naquele arquivo
 * passa a pedir a referencia junto, e nao existe estado em que as duas listas
 * discordem — porque so ha uma.
 */
function lerArtesDeAgua() {
  const fonte = fs.readFileSync(AMBIENTE, 'utf8')
  const bloco = fonte.slice(fonte.indexOf('PRESET_POR_ARTE'))
  const fim = bloco.indexOf('\n}')
  const artes = new Set()
  for (const m of bloco.slice(0, fim).matchAll(/'([^']+)':\s*'agua'/g)) artes.add(m[1])
  // Guarda contra o parser silenciosamente vazio: sem isto, mudar o formato
  // daquele objeto geraria mascara VAZIA e o efeito sumiria sem erro nenhum.
  if (artes.size === 0) throw new Error('nenhuma arte com preset agua — o parser de PRESET_POR_ARTE quebrou')
  return artes
}

/** Lê `COLISAO_POR_ARTE` do .ts gerado sem precisar compilar TypeScript. */
function lerColisao() {
  const fonte = fs.readFileSync(COLISAO, 'utf8')
  const inicio = fonte.indexOf('= {', fonte.indexOf('COLISAO_POR_ARTE'))
  return JSON.parse(fonte.slice(inicio + 2).replace(/;\s*$/, ''))
}

function nomeBase(arte) {
  return path.basename(arte).replace(/\.(jpg|png)$/i, '')
}

/**
 * Grade de agua de uma arte, a partir da referencia pintada.
 *
 * O mapeamento celula -> pixel usa `pintada.arte` (`x`, `y`, `escala`), que e o
 * MESMO retangulo que `drawMapBackground` desenha. Emitido pelo script de
 * colisao justamente pra as duas pontas nao chegarem na mesma conta por
 * caminhos separados — se divergissem, a mascara seria de uma imagem e o pixel
 * na tela de outra.
 */
function gradeDaRef(ref, pintada) {
  const { escala, x: ax, y: ay } = pintada.arte
  const larguraMundo = ref.width * escala
  const alturaMundo = ref.height * escala
  const cols = Math.ceil(pintada.bounds.width / CELULA)
  const linhas = Math.ceil(pintada.bounds.height / CELULA)
  const ladoPx = Math.max(2, Math.round(CELULA / escala))

  const grade = []
  let marcadas = 0
  for (let ly = 0; ly < linhas; ly++) {
    let linha = ''
    for (let lx = 0; lx < cols; lx++) {
      const mundoX = lx * CELULA + CELULA / 2
      const mundoY = ly * CELULA + CELULA / 2
      const u = (mundoX - ax) / larguraMundo
      const v = (mundoY - ay) / alturaMundo
      if (u < 0 || u >= 1 || v < 0 || v >= 1) { linha += '0'; continue }

      const px = Math.floor(u * ref.width) - (ladoPx >> 1)
      const py = Math.floor(v * ref.height) - (ladoPx >> 1)
      let pintados = 0, total = 0
      for (let dy = 0; dy < ladoPx; dy += PASSO) {
        for (let dx = 0; dx < ladoPx; dx += PASSO) {
          const x = px + dx, y = py + dy
          if (x < 0 || y < 0 || x >= ref.width || y >= ref.height) continue
          const i = (y * ref.width + x) * 4
          total++
          if (ehAzulPuro(ref.data[i], ref.data[i + 1], ref.data[i + 2], ref.data[i + 3])) pintados++
        }
      }
      const agua = total > 0 && pintados / total >= COBERTURA_MINIMA
      linha += agua ? '1' : '0'
      if (agua) marcadas++
    }
    grade.push(linha)
  }
  // Contagem DEPOIS do filtro, nao antes: o relatorio precisa dizer o que
  // sobrou na mascara, e nao o que a tinta marcou.
  const limpo = limparIlhas(grade)
  return {
    grade: limpo.grade,
    marcadas: marcadas - limpo.removidas,
    total: cols * linhas,
    cols,
    linhas,
    removidas: limpo.removidas,
    cortados: limpo.cortados,
  }
}

/** Overlay de conferencia: a arte com as celulas marcadas tingidas de magenta. */
function escreverOverlay(arte, img, grade, pintada) {
  fs.mkdirSync(DIR_DEBUG, { recursive: true })
  const { escala, x: ax, y: ay } = pintada.arte
  const larguraMundo = img.width * escala
  const alturaMundo = img.height * escala
  const w = img.width >> 1, h = img.height >> 1
  const saida = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y * 2) * img.width + x * 2) * 4
      const dst = (y * w + x) * 4
      // Pixel -> mundo -> celula, o INVERSO do laco que gerou a grade. Feito
      // pelo inverso de proposito: assim um erro de mapeamento aparece na
      // imagem em vez de se cancelar.
      const lx = Math.floor((ax + ((x * 2) / img.width) * larguraMundo) / CELULA)
      const ly = Math.floor((ay + ((y * 2) / img.height) * alturaMundo) / CELULA)
      const marcada = grade[ly] && grade[ly][lx] === '1'
      if (marcada) {
        saida[dst] = Math.min(255, img.data[src] * 0.35 + 166)
        saida[dst + 1] = img.data[src + 1] * 0.35
        saida[dst + 2] = Math.min(255, img.data[src + 2] * 0.35 + 166)
      } else {
        saida[dst] = img.data[src]
        saida[dst + 1] = img.data[src + 1]
        saida[dst + 2] = img.data[src + 2]
      }
      saida[dst + 3] = 255
    }
  }
  fs.writeFileSync(path.join(DIR_DEBUG, `${nomeBase(arte)}.png`), encodePng(w, h, saida))
}

/**
 * Escreve uma referencia de PARTIDA: a arte com o palpite da heuristica em azul
 * puro por cima, pra ser CORRIGIDA a mao.
 *
 * O palpite erra — e o mesmo que marcou o palmeiral inteiro de `beach`. Ele
 * serve porque apagar excesso e mais rapido que pintar do zero, nao porque
 * acerta. Grava com `-rascunho` no nome pra ninguem confundir com referencia
 * revisada.
 */
function escreverRascunho(arte, img) {
  fs.mkdirSync(DIR_REFS, { recursive: true })
  const saida = new Uint8Array(img.width * img.height * 4)
  const lado = 8
  for (let by = 0; by < img.height; by += lado) {
    for (let bx = 0; bx < img.width; bx += lado) {
      let sl = 0, sl2 = 0, sh = 0, ss = 0, n = 0
      for (let dy = 0; dy < lado; dy++) {
        for (let dx = 0; dx < lado; dx++) {
          const x = bx + dx, y = by + dy
          if (x >= img.width || y >= img.height) continue
          const i = (y * img.width + x) * 4
          const c = rgbParaHsl(img.data[i], img.data[i + 1], img.data[i + 2])
          sh += c.h; ss += c.s; sl += c.l; sl2 += c.l * c.l; n++
        }
      }
      const ml = sl / n
      const palpite = n > 0
        && sh / n >= 150 && sh / n <= 250 && ss / n >= 0.20
        && Math.max(0, sl2 / n - ml * ml) <= 0.01
      for (let dy = 0; dy < lado; dy++) {
        for (let dx = 0; dx < lado; dx++) {
          const x = bx + dx, y = by + dy
          if (x >= img.width || y >= img.height) continue
          const i = (y * img.width + x) * 4
          if (palpite) {
            saida[i] = 0; saida[i + 1] = 0; saida[i + 2] = 255
          } else {
            saida[i] = img.data[i]; saida[i + 1] = img.data[i + 1]; saida[i + 2] = img.data[i + 2]
          }
          saida[i + 3] = 255
        }
      }
    }
  }
  const destino = path.join(DIR_REFS, `${nomeBase(arte)}-rascunho.png`)
  fs.writeFileSync(destino, encodePng(img.width, img.height, saida))
  return destino
}

function main() {
  const soRelatorio = process.argv.includes('--relatorio')
  const comDebug = process.argv.includes('--debug')
  const soRascunho = process.argv.includes('--rascunho')

  const colisao = lerColisao()
  const artesDeAgua = [...lerArtesDeAgua()]
  const saida = {}
  const linhas = []

  for (const arte of artesDeAgua) {
    const pintada = colisao[arte]
    if (!pintada) { linhas.push([arte, 'SEM colisao pintada — o script de colisao roda primeiro']); continue }

    if (soRascunho) {
      const img = decodificar(path.join(RAIZ, arte))
      const destino = escreverRascunho(arte, img)
      linhas.push([arte, `rascunho: ${path.relative(RAIZ, destino)}`])
      continue
    }

    const ref = path.join(DIR_REFS, `${nomeBase(arte)}.png`)
    if (!fs.existsSync(ref)) {
      linhas.push([arte, 'sem referencia pintada — nao ondula'])
      continue
    }
    const { grade, marcadas, total, cols, linhas: nl, removidas, cortados } = gradeDaRef(decodificar(ref), pintada)
    // Os TAMANHOS, e nao so o total: e o que permite ver que o corte pegou
    // sujeira de 1-20 celulas e nao mordeu um corpo de agua inteiro.
    const sujeira = cortados.length > 0
      ? `  (-${removidas} celula(s) em ${cortados.length} ilha(s): ${cortados.sort((a, b) => b - a).join(',')})`
      : ''
    linhas.push([arte, `${((marcadas / total) * 100).toFixed(1)}% agua  ${marcadas}/${total}  grade ${cols}x${nl}${sujeira}`])
    if (marcadas > 0) saida[arte] = { grid: grade, celula: CELULA }
    if (comDebug) escreverOverlay(arte, decodificar(path.join(RAIZ, arte)), grade, pintada)
  }

  for (const [arte, msg] of linhas) console.log(arte.padEnd(46), msg)
  if (soRascunho) {
    console.log(`\n${linhas.length} rascunho(s) em scripts/agua-refs/.`)
    console.log('CORRIJA a mao (o palpite marca copa de arvore), renomeie tirando "-rascunho" e rode sem flag.')
    return
  }
  console.log(`\n${Object.keys(saida).length} de ${artesDeAgua.length} arte(s) de agua com mascara.`)
  if (soRelatorio) { console.log('\n--relatorio: nada foi escrito.'); return }

  const chaves = Object.keys(saida).sort()
  const corpo = chaves.map((k) => {
    const g = saida[k].grid.map((l) => `      "${l}",`).join('\n')
    return `  ${JSON.stringify(k)}: {\n    "celula": ${saida[k].celula},\n    "grid": [\n${g}\n    ],\n  },`
  }).join('\n')

  fs.writeFileSync(SAIDA, `// AUTO-GERADO por \`node scripts/build-agua-mask.js\` (PH-113), a partir das
// referencias pintadas a mao em scripts/agua-refs/*.png.
//
// Onde ha AGUA em cada arte de fundo, pra a camada ambiente ondular so ali.
// AZUL PURO na referencia = agua. Ver o cabecalho do script pra por que isto e
// pintado e nao derivado da cor da arte (resposta curta: agua e vegetacao
// coincidem em matiz, saturacao, luminancia e textura neste acervo).
//
// A chave e o CAMINHO DA ARTE, igual em \`subBiomaCollision.generated.ts\`: o
// ambiente e propriedade do desenho, entao quem mostra a imagem herda a
// mascara.
//
// Arte sem referencia pintada NAO aparece aqui, e quem consome trata ausencia
// como "sem ondulacao" — o comportamento de hoje.
//
// Nao editar a mao — repinte a referencia e rode o script.
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
