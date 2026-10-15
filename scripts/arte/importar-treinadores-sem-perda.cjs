// Recorta a arte original sem reamostrar, quantizar cores ou redesenhar poses.
// Uso: node scripts/arte/importar-treinadores-sem-perda.cjs
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')

// Altura do boneco em campo (src/render/treinadorEmCampo.ts#ALTURA_DO_BONECO).
const ALTURA_DE_CAMPO = 30

/**
 * Borda preta em volta do que e corpo (alpha forte), dentro de cada celula.
 * O pixel semitransparente da franja da fonte fica POR CIMA do preto, entao a
 * transicao corpo -> contorno continua suave. Disco de raio `r`.
 */
function aplicarContorno(png, celulaW, celulaH, r) {
  const { width: W, height: H, data } = png
  const origem = Buffer.from(data)
  const offsets = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + 1) offsets.push([dx, dy])
  for (let cy = 0; cy < H / celulaH; cy++) {
    for (let cx = 0; cx < W / celulaW; cx++) {
      const x0 = cx * celulaW, y0 = cy * celulaH
      for (let y = 0; y < celulaH; y++) for (let x = 0; x < celulaW; x++) {
        const i = ((y0 + y) * W + x0 + x) * 4
        const a = origem[i + 3]
        if (a === 255) continue
        let perto = false
        for (const [dx, dy] of offsets) {
          const nx = x + dx, ny = y + dy
          if (nx < 0 || nx >= celulaW || ny < 0 || ny >= celulaH) continue
          if (origem[((y0 + ny) * W + x0 + nx) * 4 + 3] > 128) { perto = true; break }
        }
        if (!perto) continue
        const f = a / 255
        data[i] = Math.round(origem[i] * f)
        data[i + 1] = Math.round(origem[i + 1] * f)
        data[i + 2] = Math.round(origem[i + 2] * f)
        data[i + 3] = 255
      }
    }
  }
}

function recortar(source, rows, map, columns = 4, comContorno = true) {
  const { width: W, height: H, data: D } = source
  if (!Number.isInteger(columns) || columns < 1 || map.length !== 8 || !Number.isInteger(rows) || rows < 1) throw new Error('Grade inválida')
  // Alpha forte localiza os corpos; o recorte copia RGBA da fonte, incluindo
  // as bordas semitransparentes. Não é uma máscara de remoção de pixels.
  const labels = new Int32Array(W * H).fill(-1), centers = [], components = []
  let id = 0
  for (let start = 0; start < W * H; start++) {
    if (D[start * 4 + 3] <= 128 || labels[start] >= 0) continue
    const stack = [start]
    labels[start] = id++
    let n = 0, sumY = 0, sumX = 0, x0 = W, y0 = H, x1 = -1, y1 = -1
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = Math.floor(p / W)
      n++; sumY += y; sumX += x
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * W + nx
        if (nx < 0 || nx >= W || ny < 0 || ny >= H || labels[next] >= 0 || D[next * 4 + 3] <= 128) continue
        labels[next] = id - 1; stack.push(next)
      }
    }
    if (n >= 2000) centers.push(sumY / n)
    if (n >= 150) components.push({ id: id - 1, n, cx: sumX / n, cy: sumY / n, x0, x1, y0, y1 })
  }
  centers.sort((a, b) => a - b)
  if (centers.length < rows * columns) throw new Error('Corpos insuficientes para localizar as linhas')
  const cuts = centers.slice(1).map((y, i) => ({ y: Math.round((y + centers[i]) / 2), gap: y - centers[i] }))
    .sort((a, b) => b.gap - a.gap).slice(0, rows - 1).map(c => c.y).sort((a, b) => a - b)
  const bounds = [0, ...cuts, H], frames = []
  for (let row = 0; row < rows; row++) {
    frames[row] = []
    for (let q = 0; q < columns; q++) {
      let x0 = W, y0 = H, x1 = -1, y1 = -1
      const meus = new Set()
      const candidates = components.filter(c => c.cy >= bounds[row] && c.cy < bounds[row + 1] && Math.floor(c.cx / (W / columns)) === q).sort((a, b) => b.n - a.n)
      const main = candidates[0]
      if (!main) throw new Error(`Corpo ausente ${row},${q}`)
      for (const c of candidates) {
        if (c !== main && !(c.x0 < main.x1 + 10 && c.x1 > main.x0 - 10 && c.y0 < main.y1 + 10 && c.y1 > main.y0 - 10)) continue
        x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1)
        meus.add(c.id)
      }
      if (x1 < x0) throw new Error(`Quadro vazio ${row},${q}`)
      // Âncora pelo tronco/cabeça, não pelo pé que avança durante o passo.
      let sumX = 0, count = 0
      for (let y = y0; y <= (y0 + y1) / 2; y++) for (let x = x0; x <= x1; x++) {
        if (D[(y * W + x) * 4 + 3] > 128) { sumX += x; count++ }
      }
      // O recorte NAO fica preso a coluna fixa da folha (W / colunas): num passo
      // largo o corpo atravessa a divisa e o limite fixo cortava o boneco numa
      // reta vertical (Carvalho, quadros 1 e 4 — 87 a 134 px de corte). O corpo
      // so e limitado pela imagem; o que pertence a OUTRO boneco e filtrado na
      // copia (`meus`), nao pelo retangulo.
      frames[row][q] = { x0: Math.max(0, x0 - 3), x1: Math.min(W - 1, x1 + 3),
        y0: Math.max(bounds[row], y0 - 3), y1: Math.min(bounds[row + 1] - 1, y1 + 3),
        foot: y1, center: Math.round(sumX / count), bodyHeight: y1 - y0 + 1, meus }
    }
  }
  if (map.some(([row, mirror]) => !frames[row] || ![0, 1].includes(mirror))) throw new Error('Mapa inválido')
  const all = frames.flat()
  const heights = all.map(f => f.bodyHeight).sort((a, b) => a - b)
  const bodyHeight = (heights[Math.floor((heights.length - 1) / 2)] + heights[Math.floor(heights.length / 2)]) / 2
  // CONTORNO PRETO (pedido do dono, 15/10/2026): o boneco ganha uma borda preta
  // como a dos sprites dos Pokemon, pra se destacar do cenario. A espessura e
  // proporcional ao corpo (cerca de 1 px de mundo, que e o que o boneco mede em
  // campo: ALTURA_DO_BONECO = 30), e nao um numero fixo, porque cada skin tem
  // uma fonte de tamanho diferente. O quadro cresce em volta pra caber.
  const contorno = comContorno ? Math.max(2, Math.round(bodyHeight / ALTURA_DE_CAMPO)) : 0
  const halfWidth = Math.max(...all.map(f => Math.max(f.center - f.x0, f.x1 - f.center))) + 2 + contorno
  const frameWidth = 2 * halfWidth + 1
  const footY = Math.max(...all.map(f => f.foot - f.y0)) + 2 + contorno
  const frameHeight = footY + 6 + contorno
  const idle = frames.map(row => {
    // Sem idle original: selecionar o passo de pés menos afastados.
    // Não fabricar pernas nem uma falsa respiração.
    const widths = row.map(f => {
      let left = W, right = -1
      for (let y = f.foot - Math.ceil(f.bodyHeight * .22); y <= f.foot; y++) for (let x = f.x0; x <= f.x1; x++) {
        if (D[(y * W + x) * 4 + 3] > 128) { left = Math.min(left, x); right = Math.max(right, x) }
      }
      return right - left
    })
    return widths.indexOf(Math.min(...widths))
  })
  function atlas(columns, choose) {
    const out = new PNG({ width: frameWidth * columns, height: frameHeight * 8 })
    out.data.fill(0)
    for (let row = 0; row < 8; row++) for (let q = 0; q < columns; q++) {
      const [originalRow, mirror] = map[row], f = frames[originalRow][choose(originalRow, q)]
      for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) {
        const tx = halfWidth + (mirror ? f.center - x : x - f.center), ty = footY + y - f.foot
        if (tx < 0 || tx >= frameWidth || ty < 0 || ty >= frameHeight) throw new Error('Recorte ultrapassa o quadro')
        // Pixel forte de outro boneco (a borda da vizinha entrando no retangulo)
        // fica de fora; franja semitransparente (sem corpo) segue como sempre.
        const dono = labels[y * W + x]
        if (dono >= 0 && !f.meus.has(dono) && D[(y * W + x) * 4 + 3] > 128) continue
        const from = (y * W + x) * 4, to = ((row * frameHeight + ty) * out.width + q * frameWidth + tx) * 4
        D.copy(out.data, to, from, from + 4)
      }
    }
    return out
  }
  const walk = atlas(columns, (_r, q) => q), idleAtlas = atlas(2, r => idle[r])
  if (contorno > 0) { aplicarContorno(walk, frameWidth, frameHeight, contorno); aplicarContorno(idleAtlas, frameWidth, frameHeight, contorno) }
  return { walk, idle: idleAtlas,
    geometry: { frameWidth, frameHeight, footX: halfWidth, footY, bodyHeight, walkFrames: columns }, frames, idleFrames: idle }
}

function main() {
  const root = path.resolve(__dirname, '../..')
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'treinadores-de-campo.json'), 'utf8'))
  const geometry = {}
  for (const [skin, entry] of Object.entries(config)) {
    const source = PNG.sync.read(fs.readFileSync(path.join(root, entry.source)))
    const result = recortar(source, entry.rows, entry.map, entry.columns)
    const target = path.join(root, 'assets/treinadores/campo', skin)
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(target, 'Walk-Anim.png'), PNG.sync.write(result.walk))
    fs.writeFileSync(path.join(target, 'Idle-Anim.png'), PNG.sync.write(result.idle))
    geometry[skin] = result.geometry
    console.log(skin, JSON.stringify(result.geometry), 'idle', result.idleFrames.join(','))
  }
  fs.writeFileSync(path.join(root, 'src/data/quadrosDoTreinador.json'), JSON.stringify(geometry, null, 2) + '\n')
}
module.exports = { recortar }
if (require.main === module) main()
