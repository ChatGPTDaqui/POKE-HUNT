// Fatia um spritesheet de efeito num quadro PNG por celula — o formato que
// src/data/elementVfx.ts e src/data/moveVfx.ts consomem (lista de PNGs soltos,
// nao spritesheet: e assim que a arte do Dungeon Crawl ja veio, e o desenho em
// render/sprites.ts#drawVfxDeElemento espera uma lista de URLs).
//
//   node scripts/fatiar-sheet-vfx.mjs <sheet.png> <pasta-destino> [--celula=32] [--prefixo=q]
//
// Tambem IMPRIME um diagnostico de layout antes de escrever: quantas celulas
// sairam, quantas estao completamente vazias (essas nao sao escritas — um quadro
// 100% transparente no meio da animacao aparece como piscada de nada) e a
// continuidade nas costuras entre celulas vizinhas.
//
// POR QUE O DIAGNOSTICO DE COSTURA: dump de sprite de cliente Tibia (Object
// Builder) pode ser (a) N quadros independentes de 32x32 ou (b) quadros MAIORES
// partidos em tiles de 32x32 lado a lado. Fatiar um sheet do tipo (b) como (a)
// entrega 48 pedacos de bicho cortado, e o erro so aparece na tela, no meio do
// combate. A costura mede isso: se os tiles formassem uma imagem maior, a
// diferenca de cor na fronteira entre vizinhos seria PARECIDA com a diferenca
// dentro de um tile. Muito maior = tiles independentes.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { decodePng } = require('./lib/png.js')
const { encodePng } = require('./lib/png-encode.js')

const args = process.argv.slice(2)
const posicionais = args.filter((a) => !a.startsWith('--'))
const opcao = (nome, padrao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`))
  return a ? a.slice(nome.length + 3) : padrao
}

if (posicionais.length < 2) {
  console.error('uso: node scripts/fatiar-sheet-vfx.mjs <sheet.png> <pasta-destino> [--celula=32] [--prefixo=q]')
  process.exit(1)
}

const [origem, destino] = posicionais
const S = Number(opcao('celula', '32'))
const PREFIXO = opcao('prefixo', 'q')

const sheet = decodePng(readFileSync(origem))
const { width: W, height: H, rgba } = sheet
if (W % S || H % S) {
  console.error(`sheet ${W}x${H} nao e multiplo de ${S} — celula errada?`)
  process.exit(1)
}
const COLS = W / S
const ROWS = H / S

const alpha = (x, y) => rgba[(y * W + x) * 4 + 3]
const pixel = (x, y) => rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)

// --- diagnostico de costura ---
function deltaMedio(pares) {
  let n = 0
  let soma = 0
  for (const [p, q] of pares) {
    if (p[3] > 32 && q[3] > 32) {
      n++
      soma += Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])
    }
  }
  return { n, delta: n ? soma / n : null }
}

const dentro = []
const fronteira = []
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    for (let y = 0; y < S; y++) {
      for (const dx of [S >> 2, S >> 1, (S * 3) >> 2]) {
        dentro.push([pixel(cx * S + dx - 1, cy * S + y), pixel(cx * S + dx, cy * S + y)])
      }
      if (cx + 1 < COLS) fronteira.push([pixel(cx * S + S - 1, cy * S + y), pixel((cx + 1) * S, cy * S + y)])
    }
  }
}
const d = deltaMedio(dentro)
const f = deltaMedio(fronteira)
console.log(`sheet ${W}x${H} -> ${COLS}x${ROWS} = ${COLS * ROWS} celulas de ${S}x${S}`)
console.log(`costura DENTRO da celula: delta=${d.delta?.toFixed(1)} (${d.n} pares)`)
console.log(`costura ENTRE celulas:    delta=${f.delta?.toFixed(1)} (${f.n} pares)`)
if (f.delta != null && d.delta != null) {
  const razao = f.delta / d.delta
  console.log(
    razao > 2
      ? `  -> razao ${razao.toFixed(1)}x: celulas INDEPENDENTES, fatiar como quadro solto esta certo.`
      : `  -> razao ${razao.toFixed(1)}x: os tiles podem formar um quadro MAIOR. Confira antes de usar.`,
  )
}

// --- escrita ---
if (!existsSync(destino)) mkdirSync(destino, { recursive: true })
const escritos = []
const vazios = []
for (let i = 0; i < COLS * ROWS; i++) {
  const cx = i % COLS
  const cy = Math.floor(i / COLS)
  const buf = new Uint8Array(S * S * 4)
  let opacos = 0
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const si = ((cy * S + y) * W + cx * S + x) * 4
      const di = (y * S + x) * 4
      for (let k = 0; k < 4; k++) buf[di + k] = rgba[si + k]
      if (alpha(cx * S + x, cy * S + y) > 8) opacos++
    }
  }
  const nome = `${PREFIXO}${String(i).padStart(2, '0')}.png`
  if (opacos === 0) {
    vazios.push(nome)
    continue
  }
  writeFileSync(join(destino, nome), encodePng(S, S, buf))
  escritos.push(nome)
}
console.log(`escritos ${escritos.length} quadros em ${destino}`)
if (vazios.length) console.log(`pulados ${vazios.length} quadros 100% transparentes: ${vazios.join(', ')}`)
