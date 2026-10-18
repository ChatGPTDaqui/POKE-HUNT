// Sobrepoe a referencia pintada do repo (rosa) sobre a arte, previa 768, com grade.
const fs = require('fs'), path = require('path')
const ROOT = process.argv[2], SAIDA = process.argv[3], LISTA = process.argv[4].split(',')
const { PNG } = require(ROOT + '/node_modules/pngjs')
const jpeg = require(ROOT + '/node_modules/jpeg-js')
for (const k of LISTA) {
  const ref = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'scripts/body-block-refs', k + '.png')))
  const arte = jpeg.decode(fs.readFileSync(path.join(ROOT, 'assets/hunt-backgrounds', k + '.jpg')), { useTArray: true })
  const S = 768, p = new PNG({ width: S, height: S }), W = ref.width
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = Math.floor(x * W / S), Y = Math.floor(y * W / S), i = (Y * W + X) * 4, di = (y * S + x) * 4
    const rosa = ref.data[i] === 255 && ref.data[i + 1] === 80 && ref.data[i + 2] === 220
    const am = ref.data[i] === 255 && ref.data[i + 1] === 235 && ref.data[i + 2] === 0
    for (let c = 0; c < 3; c++) { const b = arte.data[i + c]; p.data[di + c] = am ? [255,235,0][c] : rosa ? Math.round(b * 0.45 + [255,80,220][c] * 0.55) : b }
    if (x % 96 === 0 || y % 96 === 0) { p.data[di] = 255; p.data[di+1] = 255; p.data[di+2] = 255 }
    p.data[di + 3] = 255
  }
  fs.writeFileSync(path.join(SAIDA, 'r-' + k + '.png'), PNG.sync.write(p))
}
console.log('ok')
