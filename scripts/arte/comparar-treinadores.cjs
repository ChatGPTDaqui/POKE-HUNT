// Contato ampliado, não screenshot do jogo: primeira linha = legado x6;
// segunda = primeiro quadro recortado nativo. Ordem mochila/cynthia/lance/may/dawn.
// node scripts/arte/comparar-treinadores.cjs <commit-legado> <saida.png>
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { PNG } = require('pngjs')
const geometry = require('../../src/data/quadrosDoTreinador.json')
const baseline = process.argv[2]
const output = process.argv[3]
if (!baseline || !output) throw new Error('Informe commit legado e saída PNG')
const skins = ['mochila', 'cynthia', 'lance', 'may', 'dawn']
const result = new PNG({ width: 1200, height: 560 })
for (let i = 0; i < result.data.length; i += 4) result.data.set([32, 60, 66, 255], i)
function paste(image, width, height, originX, originY, scale) {
  for (let y = 0; y < height * scale; y++) for (let x = 0; x < width * scale; x++) {
    const tx = originX + x, ty = originY + y
    if (tx < 0 || tx >= result.width || ty < 0 || ty >= result.height) continue
    const src = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4
    const dst = (ty * result.width + tx) * 4, alpha = image.data[src + 3] / 255
    for (let c = 0; c < 3; c++) result.data[dst + c] = Math.round(image.data[src + c] * alpha + result.data[dst + c] * (1 - alpha))
  }
}
for (let i = 0; i < skins.length; i++) {
  const skin = skins[i], asset = `assets/treinadores/campo/${skin}/Walk-Anim.png`
  const old = PNG.sync.read(execFileSync('git', ['show', `${baseline}:${asset}`], { maxBuffer: 8 * 1024 * 1024 }))
  const current = PNG.sync.read(fs.readFileSync(asset)), g = geometry[skin]
  paste(old, 32, 40, i * 240 + 120 - 16 * 6, 250 - 37 * 6, 6)
  paste(current, g.frameWidth, g.frameHeight, i * 240 + 120 - g.footX, 530 - g.footY, 1)
}
fs.writeFileSync(output, PNG.sync.write(result))
console.log(output)
