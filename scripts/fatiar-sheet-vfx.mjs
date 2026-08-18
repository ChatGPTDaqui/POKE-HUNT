// Fatia um spritesheet de efeito num quadro PNG por celula — o formato de
// lista de PNGs soltos que src/data/moveVfx.ts consome (e assim que o lote de
// Bullet Punch veio). NAO serve pro lote por TIPO: aquele migrou pra TIRA
// (src/data/vfxTiras.ts), um arquivo com os quadros lado a lado.
//
//   node scripts/fatiar-sheet-vfx.mjs <sheet.png> <pasta-destino> [--celula=32] [--prefixo=q]
//
// Tambem IMPRIME um diagnostico de layout antes de escrever: quantas celulas
// sairam, quantas estao completamente vazias (essas nao sao escritas — um quadro
// 100% transparente no meio da animacao aparece como piscada de nada) e a
// continuidade nas costuras entre celulas vizinhas.
//
// AVISO: PRA ARTE VINDA DE UM BANCO .dat/.spr, NAO USE ESTE SCRIPT.
//
// Efeito num banco .dat/.spr nao guarda quadro pronto: guarda `width x height`
// TILES de 32x32 por quadro. Bullet Punch e 3x2 tiles x 8 quadros = 48
// sprites; fatiado aqui virou "48 quadros" e o jogo animou um sexto da arte
// por vez. O metadado que separa tile de quadro esta no .dat, nao na imagem —
// e nenhuma heuristica de pixel substitui ele. Exporte ja montado:
//
//   py POKE/PXG_2026/objectbuilder/export_sprites.py export effect <id> //      --projeto pxg --out <pasta>        # gera x0_y0_z0_f*.png
//   py POKE/PXG_2026/objectbuilder/achar_efeito.py <pasta-de-pngs>
//                                          # descobre o id e a geometria real
//
// O diagnostico de costura abaixo TENTA distinguir os dois casos comparando a
// diferenca de cor na fronteira entre celulas com a diferenca dentro de uma
// celula. Ele ja errou: no sheet do Bullet Punch deu razao 5,1x ("celulas
// INDEPENDENTES") sobre tiles que eram pedacos de um quadro de 96x64. O filtro
// `alpha > 32` e o motivo — arte de efeito tem muita transparencia, e a
// fronteira entre tiles vizinhos quase sempre cai no vazio, entao a amostra
// que sobra e minuscula e nao representa a costura. O numero continua sendo
// impresso porque ajuda em folha de arte comum (fundo opaco), mas ele NAO e
// autoridade sobre nada que tenha vindo de um .dat.
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
      ? `  -> razao ${razao.toFixed(1)}x: SUGERE celulas independentes. Nao e prova — ver o aviso no topo.`
      : `  -> razao ${razao.toFixed(1)}x: os tiles provavelmente formam um quadro MAIOR. Nao fatie.`,
  )
  console.log('  (arte vinda de .dat: a geometria certa esta no .dat, nao neste numero)')
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
