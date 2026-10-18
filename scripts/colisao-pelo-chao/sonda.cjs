// Cor media e desvio do bloco (16 px da arte 2048) em pontos da previa 512.
const fs = require('fs')
const ROOT = process.argv[2], chave = process.argv[3]
const jpeg = require(ROOT + '/node_modules/jpeg-js')
const img = jpeg.decode(fs.readFileSync(process.env.USERPROFILE + '/Downloads/sub-biomas/' + chave + '.png'), { useTArray: true })
const pts = process.argv.slice(4).map((s) => s.split(',').map(Number))
for (const [px, py] of pts) {
  // bloco de 16 px na 2048 = 8 px na 1024
  const bx = Math.floor(px * 2 / 8) * 8, by = Math.floor(py * 2 / 8) * 8
  let r = 0, g = 0, b = 0, r2 = 0, g2 = 0, b2 = 0, n = 0
  for (let y = by; y < by + 8; y++) for (let x = bx; x < bx + 8; x++) {
    const i = (y * img.width + x) * 4; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]
    r2 += img.data[i] ** 2; g2 += img.data[i + 1] ** 2; b2 += img.data[i + 2] ** 2; n++
  }
  const d = Math.sqrt(Math.max(0, r2 / n - (r / n) ** 2 + g2 / n - (g / n) ** 2 + b2 / n - (b / n) ** 2))
  console.log(`${px},${py}`.padEnd(9), [r / n, g / n, b / n].map(Math.round).join(','), 'd', Math.round(d))
}
