// PH-55: gera scripts/body-block-refs/<nome>.png por RETANGULOS (fracoes 0-1
// da imagem), em vez de pintura livre a mao. Convencao identica as 29
// referencias existentes (rosa = andavel, resto = bloqueado, ver
// build-sub-bioma-collision.js#isPink) -- so o METODO de pintar difere.
//
// Uso: node scripts/gerar-referencia-body-block.mjs <config.json>
// config.json: { "origem": "dojo.png", "saida": "dojo.png",
//   "retangulos": [[x0,y0,x1,y1], ...] }  -- fracoes 0..1
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, encodePng } from './lib/png.js'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const configPath = process.argv[2]
if (!configPath) {
  console.error('uso: node scripts/gerar-referencia-body-block.mjs <config.json>')
  process.exit(1)
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8'))

const origemPath = path.join(ROOT, 'assets', 'hunt-backgrounds', cfg.origem)
const { width, height, rgba } = decodePng(readFileSync(origemPath))

// Rosa saturado, mesma amostra que isPink() em build-sub-bioma-collision.js
// espera ([255,115,255]-ish: R alto, B alto, G baixo).
const PINK = [255, 110, 255]

function dentroDeAlgumRetangulo(xFrac, yFrac) {
  for (const [x0, y0, x1, y1] of cfg.retangulos) {
    if (xFrac >= x0 && xFrac <= x1 && yFrac >= y0 && yFrac <= y1) return true
  }
  return false
}

const out = new Uint8ClampedArray(rgba)
for (let y = 0; y < height; y++) {
  const yFrac = y / height
  for (let x = 0; x < width; x++) {
    if (!dentroDeAlgumRetangulo(x / width, yFrac)) continue
    const i = (y * width + x) * 4
    out[i] = PINK[0]; out[i + 1] = PINK[1]; out[i + 2] = PINK[2]; out[i + 3] = 255
  }
}

const saidaPath = path.join(ROOT, 'scripts', 'body-block-refs', cfg.saida)
writeFileSync(saidaPath, encodePng({ width, height, rgba: out }))
console.log(`gravado: ${saidaPath} (${width}x${height})`)
