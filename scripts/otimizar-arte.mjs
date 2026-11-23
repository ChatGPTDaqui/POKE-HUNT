// Recomprime a arte pesada do jogo sem mudar nome, tamanho em pixels nem
// formato, entao nenhum codigo precisa mudar (auditoria de 23/11/2026).
//
// - Fundos JPG (hunt e trilha de estagios): mozjpeg q85. Os originais eram
//   JPG de qualidade maxima, 1,8 MB em media e ate 4,7 MB por hunt.
// - Folhas PNG de batalha: viram PNG com paleta SO quando o resultado decodifica
//   pixel a pixel igual ao original (RGBA; so o RGB invisivel dos pixels
//   totalmente transparentes pode mudar). Folha com mais de 256 cores, ou
//   qualquer outra diferenca, fica como esta. E compressao sem perda visual.
//
// Uso: node scripts/otimizar-arte.mjs [--jpg] [--png]
// O sharp vem do site/ (dependencia do Astro), para nao pesar o jogo.
import { createRequire } from 'node:module'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const sharp = createRequire(join(raiz, 'site', 'package.json'))('sharp')
sharp.concurrency(1)

const args = new Set(process.argv.slice(2))
const todos = !args.has('--jpg') && !args.has('--png')

const listar = (dir, ext) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return listar(p, ext)
    return f.toLowerCase().endsWith(ext) ? [p] : []
  })

const kb = (n) => `${Math.round(n / 1024)} KB`
let antes = 0
let depois = 0

async function jpg(arquivo) {
  const original = readFileSync(arquivo)
  const novo = await sharp(original).jpeg({ quality: 85, mozjpeg: true }).toBuffer()
  // Ganho pequeno nao vale reescrever o binario no git.
  if (novo.length > original.length * 0.85) return
  const [a, b] = await Promise.all([sharp(original).metadata(), sharp(novo).metadata()])
  if (a.width !== b.width || a.height !== b.height) throw new Error(`${arquivo}: dimensao mudou`)
  writeFileSync(arquivo, novo)
  antes += original.length
  depois += novo.length
}

const pixels = (buf) => sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

// Igual pixel a pixel, exceto o RGB de pixels 100% transparentes: a paleta
// junta todos num so indice, e essa cor nunca chega a tela.
function mesmosPixels(a, b) {
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) return false
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] === 0 && b.data[i + 3] === 0) continue
    if (a.data.readUInt32LE(i) !== b.data.readUInt32LE(i)) return false
  }
  return true
}

async function png(arquivo) {
  const original = readFileSync(arquivo)
  const novo = await sharp(original)
    .png({ palette: true, colours: 256, quality: 100, dither: 0, effort: 10, compressionLevel: 9 })
    .toBuffer()
  if (novo.length > original.length * 0.9) return
  const [a, b] = await Promise.all([pixels(original), pixels(novo)])
  if (!mesmosPixels(a, b)) return
  writeFileSync(arquivo, novo)
  antes += original.length
  depois += novo.length
}

async function rodar(rotulo, arquivos, fn) {
  antes = 0
  depois = 0
  let feitos = 0
  for (const [i, f] of arquivos.entries()) {
    const a = antes
    await fn(f)
    if (antes !== a) feitos++
    if ((i + 1) % 500 === 0) console.log(`${rotulo}: ${i + 1}/${arquivos.length}`)
  }
  console.log(`${rotulo}: ${feitos}/${arquivos.length} reescritos, ${kb(antes)} -> ${kb(depois)}`)
}

const assets = join(raiz, 'assets')
if (todos || args.has('--jpg')) {
  const fundos = [...listar(join(assets, 'hunt-backgrounds'), '.jpg'), ...listar(join(assets, 'biome-selector'), '.jpg')]
  await rodar('fundos', fundos, jpg)
}
if (todos || args.has('--png')) {
  await rodar('battle-sprites', listar(join(assets, 'battle-sprites'), '.png'), png)
}
