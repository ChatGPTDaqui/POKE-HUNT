// Deriva a MASCARA DE LAVA de `volcano.jpg` a partir da referencia gerada por
// `pintar-ref-lava.js`, pra a camada ambiente (render/ambiente.ts) nascer a
// brasa e o brilho do chao SO onde a lava esta de verdade (PH-195).
//
// Mesmo pipeline de `build-agua-mask.js` (PH-113): referencia com AZUL PURO
// marcando a regiao, mapeada pra grade de CELULA=20 via o mesmo retangulo
// (`escala`/`x`/`y`) que `subBiomaCollision.generated.ts` usa pra desenhar a
// arte, com o mesmo filtro de componente conexo pra tirar sujeira (cristal,
// tocha) que a cor sozinha nao separa de todo.
//
// SO `volcano` tem referencia. `cave-volcanic` nao entrou: os cristais dela
// ocupam o MESMO ponto de cor da lava e sao grandes o bastante pra nenhum
// corte por tamanho isolar so o rio — ver o cabecalho de `pintar-ref-lava.js`
// pra a medicao completa. Arte sem referencia aqui fica exatamente como
// estava antes desta leva: `brasa` sem mascara, particula pela janela
// inteira. Essa mudanca so pode MELHORAR `volcano`, nunca piorar `cave-volcanic`.
//
// USO
//   node scripts/build-lava-mask.js --relatorio  # so imprime, nao escreve
//   node scripts/build-lava-mask.js --debug      # + PNG de conferencia
//   node scripts/build-lava-mask.js              # gera o .generated.ts
const fs = require('fs')
const path = require('path')
const jpeg = require('jpeg-js')
const { decodePng } = require('./lib/png')
const { encodePng } = require('./lib/png-encode')

const RAIZ = path.join(__dirname, '..')
const DIR_REFS = path.join(RAIZ, 'scripts', 'lava-refs')
const DIR_DEBUG = path.join(RAIZ, 'scripts', 'lava-debug')
const SAIDA = path.join(RAIZ, 'src', 'data', 'generated', 'lavaMask.generated.ts')
const COLISAO = path.join(RAIZ, 'src', 'data', 'generated', 'subBiomaCollision.generated.ts')
const AMBIENTE = path.join(RAIZ, 'src', 'render', 'ambiente.ts')

/** Mesma celula da grade de colisao e da mascara de agua (PH-94/PH-113). */
const CELULA = 20
/** Passo da varredura dentro da celula, em pixels da referencia. */
const PASSO = 3
/** Fracao da celula que precisa estar pintada pra ela contar como lava. */
const COBERTURA_MINIMA = 0.35
/**
 * Menor poca de lava que sobrevive, em celulas — mesmo valor e mesma razao
 * do MIN_CELULAS da agua: sujeira de cristal/tocha vira componente pequeno,
 * a lava de verdade vira componente grande, e nao ha meio-termo entre os
 * dois neste acervo (ver a medicao no cabecalho de `pintar-ref-lava.js`).
 */
const MIN_CELULAS = 25

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

function decodificar(arquivo) {
  const buf = fs.readFileSync(arquivo)
  if (arquivo.toLowerCase().endsWith('.png')) {
    const png = decodePng(buf)
    return { width: png.width, height: png.height, data: png.rgba }
  }
  const raw = jpeg.decode(buf, { useTArray: true })
  return { width: raw.width, height: raw.height, data: raw.data }
}

/** As artes que o ambiente ja classifica como `brasa`, lidas de `PRESET_POR_ARTE`. */
function lerArtesDeBrasa() {
  const fonte = fs.readFileSync(AMBIENTE, 'utf8')
  const bloco = fonte.slice(fonte.indexOf('PRESET_POR_ARTE'))
  const fim = bloco.indexOf('\n}')
  const artes = new Set()
  for (const m of bloco.slice(0, fim).matchAll(/'([^']+)':\s*'brasa'/g)) artes.add(m[1])
  if (artes.size === 0) throw new Error('nenhuma arte com preset brasa — o parser de PRESET_POR_ARTE quebrou')
  return artes
}

function lerColisao() {
  const fonte = fs.readFileSync(COLISAO, 'utf8')
  const inicio = fonte.indexOf('= {', fonte.indexOf('COLISAO_POR_ARTE'))
  return JSON.parse(fonte.slice(inicio + 2).replace(/;\s*$/, ''))
}

function nomeBase(arte) {
  return path.basename(arte).replace(/\.(jpg|png)$/i, '')
}

/** Grade de lava de uma arte, a partir da referencia — mesma conta de `gradeDaRef` da agua. */
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
      const lava = total > 0 && pintados / total >= COBERTURA_MINIMA
      linha += lava ? '1' : '0'
      if (lava) marcadas++
    }
    grade.push(linha)
  }
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

function main() {
  const soRelatorio = process.argv.includes('--relatorio')
  const comDebug = process.argv.includes('--debug')

  const colisao = lerColisao()
  const artesDeBrasa = [...lerArtesDeBrasa()]
  const saida = {}
  const linhas = []

  for (const arte of artesDeBrasa) {
    const pintada = colisao[arte]
    if (!pintada) { linhas.push([arte, 'SEM colisao pintada — o script de colisao roda primeiro']); continue }

    const ref = path.join(DIR_REFS, `${nomeBase(arte)}.png`)
    if (!fs.existsSync(ref)) {
      linhas.push([arte, 'sem referencia — brasa sem mascara (comportamento de antes)'])
      continue
    }
    const { grade, marcadas, total, cols, linhas: nl, removidas, cortados } = gradeDaRef(decodificar(ref), pintada)
    const sujeira = cortados.length > 0
      ? `  (-${removidas} celula(s) em ${cortados.length} ilha(s): ${cortados.sort((a, b) => b - a).join(',')})`
      : ''
    linhas.push([arte, `${((marcadas / total) * 100).toFixed(1)}% lava  ${marcadas}/${total}  grade ${cols}x${nl}${sujeira}`])
    if (marcadas > 0) saida[arte] = { grid: grade, celula: CELULA }
    if (comDebug) escreverOverlay(arte, decodificar(path.join(RAIZ, arte)), grade, pintada)
  }

  for (const [arte, msg] of linhas) console.log(arte.padEnd(46), msg)
  console.log(`\n${Object.keys(saida).length} de ${artesDeBrasa.length} arte(s) de brasa com mascara.`)
  if (soRelatorio) { console.log('\n--relatorio: nada foi escrito.'); return }

  const chaves = Object.keys(saida).sort()
  const corpo = chaves.map((k) => {
    const g = saida[k].grid.map((l) => `      "${l}",`).join('\n')
    return `  ${JSON.stringify(k)}: {\n    "celula": ${saida[k].celula},\n    "grid": [\n${g}\n    ],\n  },`
  }).join('\n')

  fs.writeFileSync(SAIDA, `// AUTO-GERADO por \`node scripts/build-lava-mask.js\` (PH-195), a partir das
// referencias por COR em scripts/lava-refs/*.png (ver \`pintar-ref-lava.js\`
// pra por que lava separa por cor onde agua nao separa).
//
// Onde ha LAVA em cada arte de fundo, pra a camada ambiente nascer a brasa e
// o brilho do chao so ali. Mesma convencao da mascara de agua: AZUL PURO na
// referencia = regiao marcada.
//
// So \`volcano\` tem entrada — \`cave-volcanic\` nao separa por cor (cristal
// grande demais no mesmo ponto de cor da lava, ver o cabecalho do script).
// Arte sem entrada aqui NAO muda em nada: quem consome trata ausencia como
// "sem mascara", o comportamento de antes desta leva.
//
// Nao editar a mao — repinte a referencia (ou ajuste o limiar de cor) e rode
// o script.
export interface MascaraDeLava {
  /** Lado da celula em unidades de mundo. Mesma celula da grade de colisao. */
  celula: number;
  /** '1' = lava. Linha \`y\`, coluna \`x\`, a partir da origem do mundo. */
  grid: string[];
}

export const LAVA_POR_ARTE: Record<string, MascaraDeLava> = {
${corpo}
}
`)
  console.log(`\nEscrito: ${path.relative(RAIZ, SAIDA)}`)
}

main()
