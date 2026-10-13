const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')
const { recortar } = require('./importar-treinadores-sem-perda.cjs')
const config = require('./treinadores-de-campo.json')
const geometry = require('../../src/data/quadrosDoTreinador.json')
const root = path.resolve(__dirname, '../..')

for (const [skin, entry] of Object.entries(config)) test(`${skin}: recortes mantêm RGBA e todas as poses originais, inclusive espelhos`, () => {
  const source = PNG.sync.read(fs.readFileSync(path.join(root, entry.source)))
  const columns = entry.columns ?? 4
  const result = recortar(source, entry.rows, entry.map, columns)
  assert.deepEqual(result.geometry, geometry[skin])
  const walk = PNG.sync.read(fs.readFileSync(path.join(root, `assets/treinadores/campo/${skin}/Walk-Anim.png`)))
  const idle = PNG.sync.read(fs.readFileSync(path.join(root, `assets/treinadores/campo/${skin}/Idle-Anim.png`)))
  assert.deepEqual(walk.data, result.walk.data, 'arquivo versionado desatualizado')
  assert.deepEqual(idle.data, result.idle.data, 'idle versionado desatualizado')
  const { frameWidth, frameHeight, footX, footY } = result.geometry
  const colors = new Set()
  let partialAlpha = 0
  assert.equal(walk.width, frameWidth * columns)
  for (let row = 0; row < 8; row++) for (let q = 0; q < columns; q++) {
    const [sourceRow, mirror] = entry.map[row], f = result.frames[sourceRow][q]
    for (let y = f.y0; y <= f.y1; y++) {
      const expected = Buffer.alloc((f.x1 - f.x0 + 1) * 4)
      for (let x = f.x0; x <= f.x1; x++) {
        const from = (y * source.width + x) * 4
        source.data.copy(expected, (mirror ? f.x1 - x : x - f.x0) * 4, from, from + 4)
        if (source.data[from + 3] > 128) colors.add(source.data.subarray(from, from + 3).toString('hex'))
        if (source.data[from + 3] > 0 && source.data[from + 3] < 255) partialAlpha++
      }
      const left = footX + (mirror ? f.center - f.x1 : f.x0 - f.center)
      const to = ((row * frameHeight + footY + y - f.foot) * walk.width + q * frameWidth + left) * 4
      assert.deepEqual(walk.data.subarray(to, to + expected.length), expected, `RGBA alterado ${row}/${q}/${y}`)
    }
  }
  assert.ok(colors.size > 20, 'não voltar a limitar a paleta')
  assert.ok(partialAlpha > 0, 'não binarizar alpha')
  assert.ok(frameHeight > 100, 'não reduzir fonte para 40px')
  // Idle estático conserva integralmente uma pose, sem redesenhar pernas.
  for (let row = 0; row < 8; row++) for (let y = 0; y < frameHeight; y++) {
    const start = ((row * frameHeight + y) * idle.width) * 4
    assert.deepEqual(idle.data.subarray(start, start + frameWidth * 4), idle.data.subarray(start + frameWidth * 4, start + frameWidth * 8))
  }
})
