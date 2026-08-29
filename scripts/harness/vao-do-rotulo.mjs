// Bancada: quanto de vao VAZIO existe hoje entre a cabeca do POKE e o rotulo
// dele, e quanto sobra depois da ancoragem no primeiro pixel opaco (PH-189).
//
// O que ela responde, com numero e nao com "parece melhor":
//
//   1. a amplitude do vao entre especies HOJE (o rotulo ancora na moldura do
//      quadro, e o padding da moldura varia por especie);
//   2. a amplitude DEPOIS de descontar `TOPO_OPACO_POR_ANIM`;
//   3. quanto o vao muda quando o POKE VIRA (fileira de direcao diferente do
//      mesmo sheet) — que e o numero que decide se da pra ancorar por direcao
//      ou se a ancora tem que ser o pior caso da animacao inteira.
//
// `scaleForSpecies` devolve 1 pra todo mundo hoje (data/pokeHeights.ts), entao
// px de mundo == px de quadro e a conta e direta. Se a escala por altura voltar,
// esta bancada precisa multiplicar por ela.
//
// Rodar com: node scripts/harness/vao-do-rotulo.mjs
import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { decodePng } = require('../lib/png.js')

const RAIZ = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const DIR_SPRITES = join(RAIZ, 'assets', 'battle-sprites')

function lerGeometrias() {
  const fonte = readFileSync(join(RAIZ, 'src', 'data', 'battleSpriteAnims.ts'), 'utf8')
  const inicio = fonte.indexOf('{', fonte.indexOf('BATTLE_SPRITE_ANIMS'))
  return JSON.parse(fonte.slice(inicio, fonte.lastIndexOf('}') + 1))
}

/** Menor y opaco de CADA fileira da folha. `null` na fileira vazia. */
function topoPorFileira(rgba, largura, altura, frameHeight) {
  const fileiras = Math.max(1, Math.round(altura / frameHeight))
  const saida = []
  for (let fileira = 0; fileira < fileiras; fileira++) {
    const base = fileira * frameHeight
    let melhor = null
    for (let dy = 0; dy < frameHeight; dy++) {
      const y = base + dy
      if (y >= altura) break
      for (let x = 0; x < largura; x++) {
        if (rgba[(y * largura + x) * 4 + 3] > 0) { melhor = dy; break }
      }
      if (melhor !== null) break
    }
    saida.push(melhor)
  }
  return saida
}

function estatistica(rotulo, valores) {
  if (valores.length === 0) return `${rotulo}: (vazio)`
  const ordenado = [...valores].sort((a, b) => a - b)
  const media = valores.reduce((s, v) => s + v, 0) / valores.length
  const p = (q) => ordenado[Math.min(ordenado.length - 1, Math.floor(q * ordenado.length))]
  return `${rotulo}: min ${ordenado[0].toFixed(1)}px | p50 ${p(0.5).toFixed(1)}px | p95 ${p(0.95).toFixed(1)}px `
    + `| max ${ordenado[ordenado.length - 1].toFixed(1)}px | amplitude ${(ordenado[ordenado.length - 1] - ordenado[0]).toFixed(1)}px `
    + `| media ${media.toFixed(1)}px | n=${valores.length}`
}

const geometrias = lerGeometrias()
const especies = readdirSync(DIR_SPRITES, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort()

// Vao vazio na pose de descanso (Idle, ou Walk quando nao ha Idle) — e a pose
// que o POKE segura a maior parte do tempo numa hunt.
const vaoParado = []
// Amplitude do vao DENTRO de uma mesma especie, entre as 8 direcoes.
const amplitudePorDirecao = []
const piores = []

for (const especie of especies) {
  const anims = geometrias[especie]
  if (!anims) continue
  const nome = anims.Idle ? 'Idle' : anims.Walk ? 'Walk' : null
  if (!nome) continue
  const meta = anims[nome]
  let png
  try { png = decodePng(readFileSync(join(DIR_SPRITES, especie, `${nome}-Anim.png`))) } catch { continue }
  const tops = topoPorFileira(png.rgba, png.width, png.height, meta.frameHeight).filter((v) => v !== null)
  if (tops.length === 0) continue

  // Fileira 0 e Down (ver animationSystem#SECTOR_TO_ROW): a pose "de frente".
  const parado = tops[0]
  vaoParado.push(parado)
  amplitudePorDirecao.push(Math.max(...tops) - Math.min(...tops))
  piores.push({ especie, parado, minDirecao: Math.min(...tops), maxDirecao: Math.max(...tops) })
}

console.log('--- vao VAZIO entre a moldura do quadro e o desenho (px de mundo) ---')
console.log(estatistica('hoje, pose de frente (fileira Down)', vaoParado))
console.log(estatistica('variacao dentro da MESMA especie, entre as 8 direcoes', amplitudePorDirecao))
console.log()
console.log('--- as duas ancoras possiveis, medidas ---')
console.log('A) ancora POR DIRECAO (le a fileira que esta na tela): vao vazio = 0 sempre,')
console.log('   amplitude entre especies = 0. Custo: o rotulo salta quando o POKE vira,')
console.log('   pela amplitude por direcao acima.')
console.log(estatistica(
  'B) ancora no PIOR CASO da animacao (mesma altura em qualquer direcao), vao residual',
  piores.map((p) => p.parado - p.minDirecao),
))
console.log()
console.log('--- 10 especies com o maior vao de frente ---')
for (const p of piores.sort((a, b) => b.parado - a.parado).slice(0, 10)) {
  console.log(`  ${p.especie.padEnd(14)} frente ${String(p.parado).padStart(3)}px  `
    + `(entre direcoes: ${p.minDirecao}..${p.maxDirecao}px)`)
}
