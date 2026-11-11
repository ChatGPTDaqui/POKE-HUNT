const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PNG } = require('pngjs')
const { recortar } = require('./importar-treinadores-sem-perda.cjs')
const config = require('./treinadores-de-campo.json')
const geometry = require('../../src/data/quadrosDoTreinador.json')
const root = path.resolve(__dirname, '../..')

for (const [skin, entry] of Object.entries(config)) test(`${skin}: recortes mantêm RGBA, paleta e resolução da fonte`, () => {
  const source = PNG.sync.read(fs.readFileSync(path.join(root, entry.source)))
  const columns = entry.columns ?? 4
  const result = recortar(source, entry.rows, entry.map, columns)
  void columns
  assert.deepEqual(result.geometry, geometry[skin])
  const walk = PNG.sync.read(fs.readFileSync(path.join(root, `assets/treinadores/campo/${skin}/Walk-Anim.png`)))
  const idle = PNG.sync.read(fs.readFileSync(path.join(root, `assets/treinadores/campo/${skin}/Idle-Anim.png`)))
  assert.deepEqual(walk.data, result.walk.data, 'arquivo versionado desatualizado')
  assert.deepEqual(idle.data, result.idle.data, 'idle versionado desatualizado')
  const { frameWidth, frameHeight, footX, footY } = result.geometry
  const colors = new Set()
  let partialAlpha = 0
  // 10/11/2026: o Walk tem 4 quadros gerados de UMA pose da fonte por direcao
  // (em pe, um pe no ar, em pe, o outro pe no ar). O quadro 0 e a pose original
  // sem reamostrar: mesma paleta, alpha parcial preservado.
  assert.equal(walk.width, frameWidth * 4)
  assert.equal(footX * 2 + 1, frameWidth)
  assert.ok(footY < frameHeight)
  for (let i = 0; i < source.data.length; i += 4) {
    if (source.data[i + 3] > 128) colors.add(source.data.subarray(i, i + 3).toString('hex'))
  }
  const noWalk = new Set()
  for (let i = 0; i < walk.data.length; i += 4) {
    if (walk.data[i + 3] > 0 && walk.data[i + 3] < 255) partialAlpha++
    if (walk.data[i + 3] > 128) noWalk.add(walk.data.subarray(i, i + 3).toString('hex'))
  }
  assert.ok(noWalk.size > 20, 'Walk sem paleta')
  assert.ok(colors.size > 20, 'não voltar a limitar a paleta')
  assert.ok(partialAlpha > 0, 'não binarizar alpha')
  assert.ok(frameHeight > 100, 'não reduzir fonte para 40px')
  // Idle estático conserva integralmente uma pose, sem redesenhar pernas.
  for (let row = 0; row < 8; row++) for (let y = 0; y < frameHeight; y++) {
    const start = ((row * frameHeight + y) * idle.width) * 4
    assert.deepEqual(idle.data.subarray(start, start + frameWidth * 4), idle.data.subarray(start + frameWidth * 4, start + frameWidth * 8))
  }
})
