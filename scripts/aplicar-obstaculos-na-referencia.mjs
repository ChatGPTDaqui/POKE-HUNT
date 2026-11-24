// Recorta OBSTACULOS declarados de uma referencia de colisao pintada
// (scripts/body-block-refs/<arte>.png, modo 'rosa_anda': rosa = andavel).
//
// POR QUE EXISTE (23/11/2026, pedido do dono: "refaca o sistema de colisao do
// mapa dojo"). A tinta rosa cobria a praca inteira, e os POKE atravessavam
// bonecos de treino, lanternas, suportes de armas, bancos e a encosta de terra
// — pintar cada adereco a mao numa imagem de 3072 px nao e repetivel. Aqui os
// obstaculos ficam DECLARADOS num JSON ao lado da referencia
// (<arte>.obstaculos.json), em coordenadas de uma previa de `previa` px, e o
// script pinta cada um de CINZA ESCURO opaco (nao e rosa nem marcador, entao o
// gerador le como bloqueado, e quem abre a referencia ve o obstaculo). Rodar de
// novo e idempotente.
//
// Formas: { ret: [x0,y0,x1,y1] }, { elipse: [cx,cy,rx,ry] },
//         { linha: [[x,y],...], espessura }  (encosta, cerca comprida).
//
// Rodar: node scripts/aplicar-obstaculos-na-referencia.mjs dojo-cacada
// e depois: node scripts/build-sub-bioma-collision.js
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const nome = process.argv[2]
if (!nome) throw new Error('uso: node scripts/aplicar-obstaculos-na-referencia.mjs <referencia sem .png>')
const pngPath = join(ROOT, 'scripts', 'body-block-refs', `${nome}.png`)
const spec = JSON.parse(readFileSync(join(ROOT, 'scripts', 'body-block-refs', `${nome}.obstaculos.json`), 'utf8'))

const png = PNG.sync.read(readFileSync(pngPath))
const k = png.width / spec.previa

function distanciaAoSegmento(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function dentro(f, x, y) {
  if (f.ret) { const [x0, y0, x1, y1] = f.ret.map((v) => v * k); return x >= x0 && x <= x1 && y >= y0 && y <= y1 }
  if (f.elipse) { const [cx, cy, rx, ry] = f.elipse.map((v) => v * k); return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 }
  if (f.linha) {
    const meia = (f.espessura * k) / 2
    for (let i = 1; i < f.linha.length; i++) {
      const [ax, ay] = f.linha[i - 1].map((v) => v * k), [bx, by] = f.linha[i].map((v) => v * k)
      if (distanciaAoSegmento(x, y, ax, ay, bx, by) <= meia) return true
    }
    return false
  }
  throw new Error(`forma desconhecida: ${JSON.stringify(f)}`)
}

function caixa(f) {
  if (f.ret) return f.ret.map((v) => v * k)
  if (f.elipse) { const [cx, cy, rx, ry] = f.elipse.map((v) => v * k); return [cx - rx, cy - ry, cx + rx, cy + ry] }
  const xs = f.linha.map((p) => p[0] * k), ys = f.linha.map((p) => p[1] * k), m = (f.espessura * k) / 2
  return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m]
}

const COR_DO_OBSTACULO = [40, 40, 40, 255]
let pintados = 0
for (const f of spec.obstaculos) {
  const [x0, y0, x1, y1] = caixa(f).map((v, i) => Math.max(0, Math.min(i % 2 ? png.height - 1 : png.width - 1, Math.round(v))))
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!dentro(f, x, y)) continue
    const i = (y * png.width + x) * 4
    if (png.data[i] === COR_DO_OBSTACULO[0] && png.data[i + 1] === COR_DO_OBSTACULO[1] && png.data[i + 2] === COR_DO_OBSTACULO[2]) continue
    png.data.set(COR_DO_OBSTACULO, i)
    pintados++
  }
}
writeFileSync(pngPath, PNG.sync.write(png))
console.log(`${nome}: ${spec.obstaculos.length} obstaculos, ${pintados} pixels pintados de obstaculo`)
