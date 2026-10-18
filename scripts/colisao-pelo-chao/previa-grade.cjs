// Previa 512 com grade a cada 32 px (linha mais forte a cada 128) pra medir
// coordenadas dos mapas novos.
const fs = require('fs'), path = require('path')
const ROOT = process.argv[2], SAIDA = process.argv[3], LISTA = process.argv[4].split(',')
const jpeg = require(ROOT + '/node_modules/jpeg-js')
const { PNG } = require(ROOT + '/node_modules/pngjs')
const DIR = process.env.USERPROFILE + '/Downloads/sub-biomas/'
for (const k of LISTA) {
  const img = jpeg.decode(fs.readFileSync(DIR + k + '.png'), { useTArray: true })
  const S = 512, p = new PNG({ width: S, height: S })
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const si = ((y * 2) * img.width + x * 2) * 4, di = (y * S + x) * 4
    let c = [img.data[si], img.data[si + 1], img.data[si + 2]]
    if (x % 128 === 0 || y % 128 === 0) c = [255, 255, 0]
    else if (x % 32 === 0 || y % 32 === 0) c = c.map((v) => (v + 255) >> 1)
    p.data[di] = c[0]; p.data[di + 1] = c[1]; p.data[di + 2] = c[2]; p.data[di + 3] = 255
  }
  fs.writeFileSync(path.join(SAIDA, 'g-' + k + '.png'), PNG.sync.write(p))
}
console.log('ok')
