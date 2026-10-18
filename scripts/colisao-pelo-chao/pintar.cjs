// Colisao pelo CHAO, versao 2 (17/10/2026, revisao pedida pelo dono: POKEs
// atravessando paredes e barrancos no Canion da Rota 45).
//
// O que mudou em relacao ao v1 (colisao-chao.cjs):
//  - grade 4x mais fina (bloco de 4 px na arte 1024 = 8 px na 2048);
//  - CONTORNO ESCURO E BARREIRA: bloco com fracao alta de pixel bem mais escuro
//    que o chao nao e chao. Pedra, barranco, parede e tronco tem contorno; o
//    chao nao. Assim o topo do platô e o miolo da pedra (mesma cor do chao)
//    ficam ilhados e caem fora no componente do spawn;
//  - o componente do spawn sai ANTES de fechar buraco, e so fecha buraco pequeno
//    DENTRO dele (nunca une ilha ao chao);
//  - abertura morfologica tira o fiapo que escapa por fresta de contorno.
//
// Uso: node colisao-v2.cjs <repo> <saida> [chaves,] [--escrever]
const fs = require('fs'), path = require('path')
const ROOT = process.argv[2]
const SAIDA = process.argv[3]
const SO = process.argv[4] && !process.argv[4].startsWith('--') ? process.argv[4].split(',') : null
const ESCREVER = process.argv.includes('--escrever')
const jpeg = require(ROOT + '/node_modules/jpeg-js')
const { PNG } = require(ROOT + '/node_modules/pngjs')
const DIR = process.env.USERPROFILE + '/Downloads/sub-biomas/'
const B = 4 // px do bloco na arte 1024
const MAPAS = { ...require('./mapas-chao.cjs'), ...require('./mapas-chao-ajustes.cjs'), ...require('./mapas-chao-2.cjs'), ...require('./mapas-chao-3.cjs'), ...require('./mapas-v2.cjs') }

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b

function dentroPoly(x, y, poly) {
  let d = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

const montagem = []
for (const [chave, cfg] of Object.entries(MAPAS)) {
  if (SO && !SO.includes(chave)) continue
  if (!fs.existsSync(DIR + chave + '.png')) continue
  const img = jpeg.decode(fs.readFileSync(DIR + chave + '.png'), { useTArray: true })
  const W = img.width, N = W / B, d = img.data
  const k512 = W / 512
  const px512 = (b) => (b + 0.5) * B / k512
  const media = new Float32Array(N * N * 3), desvio = new Float32Array(N * N), lumBloco = new Float32Array(N * N)
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let r = 0, g = 0, b = 0, r2 = 0, g2 = 0, b2 = 0, n = 0
    for (let y = by * B; y < (by + 1) * B; y++) for (let x = bx * B; x < (bx + 1) * B; x++) {
      const i = (y * W + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; r2 += d[i] ** 2; g2 += d[i + 1] ** 2; b2 += d[i + 2] ** 2; n++
    }
    const j = by * N + bx; media[j * 3] = r / n; media[j * 3 + 1] = g / n; media[j * 3 + 2] = b / n
    desvio[j] = Math.sqrt(Math.max(0, r2 / n - (r / n) ** 2 + g2 / n - (g / n) ** 2 + b2 / n - (b / n) ** 2))
    lumBloco[j] = lum(r / n, g / n, b / n)
  }
  // cor das sementes: media de uma janela 3x3 de blocos em volta do ponto
  const sementes = (cfg.chao || []).map(([sx, sy]) => {
    const bx = Math.floor(sx * k512 / B), by = Math.floor(sy * k512 / B)
    let r = 0, g = 0, b = 0, n = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const j = (by + dy) * N + bx + dx; r += media[j * 3]; g += media[j * 3 + 1]; b += media[j * 3 + 2]; n++
    }
    return [r / n, g / n, b / n]
  })
  const lumChao = sementes.length ? sementes.map(([r, g, b]) => lum(r, g, b)).sort((a, b) => a - b)[Math.floor(sementes.length / 2)] : 100
  const limiarContorno = cfg.contorno ?? lumChao * (cfg.contornoFator ?? 0.5)
  // fracao de pixels de contorno por bloco
  const escuro = new Float32Array(N * N)
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let c = 0
    for (let y = by * B; y < (by + 1) * B; y++) for (let x = bx * B; x < (bx + 1) * B; x++) {
      const i = (y * W + x) * 4; if (lum(d[i], d[i + 1], d[i + 2]) < limiarContorno) c++
    }
    escuro[by * N + bx] = c / (B * B)
  }
  const naRegiao = (bx, by) => {
    const px = px512(bx), py = px512(by)
    const dentro = (cfg.rects || []).some(([a, b, c, e]) => px >= a && px <= c && py >= b && py <= e)
      || (cfg.polys || []).some((pl) => dentroPoly(px, py, pl))
    if (!dentro) return false
    return !(cfg.tirar || []).some(([a, b, c, e]) => px >= a && px <= c && py >= b && py <= e)
  }
  const forcado = (bx, by) => {
    const px = px512(bx), py = px512(by)
    return (cfg.forcar || []).some(([a, b, c, e]) => px >= a && px <= c && py >= b && py <= e)
  }
  const tol = cfg.tol ?? 28, tolDesvio = (cfg.desvio ?? 34) * 0.85, maxEscuro = cfg.maxEscuro ?? 0.3
  const cand = new Uint8Array(N * N)
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    if (!naRegiao(bx, by)) continue
    const j = by * N + bx
    if (forcado(bx, by)) { cand[j] = 1; continue }
    const r = media[j * 3], g = media[j * 3 + 1], b = media[j * 3 + 2]
    if (cfg.regra) { if (cfg.regra(r, g, b, desvio[j])) cand[j] = 1 }
    else {
      if (desvio[j] > tolDesvio) continue
      if (cfg.semAgua && b > 120 && b > r + 35 && b > g - 5) continue
      if (!sementes.some(([sr, sg, sb]) => Math.hypot(r - sr, g - sg, b - sb) <= tol)) continue
      cand[j] = 1
    }
    if (!cfg.semContorno && escuro[j] > maxEscuro) cand[j] = 0
  }
  const comp = (m) => {
    const [sx, sy] = cfg.spawn.map((v) => v * k512)
    const sbx = Math.floor(sx / B), sby = Math.floor(sy / B)
    let inicio = -1, melhor = Infinity
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      if (!m[by * N + bx]) continue
      const dd = (bx - sbx) ** 2 + (by - sby) ** 2; if (dd < melhor) { melhor = dd; inicio = by * N + bx }
    }
    const c = new Uint8Array(N * N); if (inicio < 0) return c
    const fila = [inicio]; c[inicio] = 1
    while (fila.length) {
      const j = fila.pop(); const bx = j % N, by = (j - bx) / N
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue
        const q = y * N + x; if (m[q] && !c[q]) { c[q] = 1; fila.push(q) }
      }
    }
    return c
  }
  // FECHAMENTO (dilata e erode rf): costura a borda fina entre dois chaos
  // (contorno de trilha, beira de grama) sem atravessar barranco largo.
  const rf = cfg.fechar ?? 0
  let base = cand
  if (rf > 0) {
    const dil = new Uint8Array(N * N)
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
      if (!naRegiao(bx, by)) continue
      let ok = 0
      for (let dy = -rf; dy <= rf && !ok; dy++) for (let dx = -rf; dx <= rf; dx++) { const x = bx + dx, y = by + dy; if (x >= 0 && y >= 0 && x < N && y < N && cand[y * N + x]) { ok = 1; break } }
      dil[by * N + bx] = ok
    }
    base = new Uint8Array(N * N)
    for (let by = rf; by < N - rf; by++) for (let bx = rf; bx < N - rf; bx++) {
      let ok = 1
      for (let dy = -rf; dy <= rf && ok; dy++) for (let dx = -rf; dx <= rf; dx++) if (!dil[(by + dy) * N + bx + dx]) { ok = 0; break }
      base[by * N + bx] = ok || cand[by * N + bx]
    }
  }
  let m = comp(base)
  // fecha buraco PEQUENO cercado pelo componente (tufo, pedrinha, risco)
  const maxBuraco = cfg.buraco ?? 10
  {
    const visto = new Uint8Array(N * N)
    for (let j0 = 0; j0 < N * N; j0++) {
      if (m[j0] || visto[j0]) continue
      const regiao = [j0]; visto[j0] = 1; let borda = false
      for (let q = 0; q < regiao.length; q++) {
        const j = regiao[q], bx = j % N, by = (j - bx) / N
        if (bx === 0 || by === 0 || bx === N - 1 || by === N - 1) borda = true
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue
          const p = y * N + x; if (!m[p] && !visto[p]) { visto[p] = 1; regiao.push(p) }
        }
        if (regiao.length > maxBuraco) break
      }
      if (!borda && regiao.length <= maxBuraco) {
        // so preenche se o buraco nao e contorno forte (objeto pequeno de verdade fica)
        const escuroMedio = regiao.reduce((a, j) => a + escuro[j], 0) / regiao.length
        if (escuroMedio < 0.35) for (const j of regiao) m[j] = 1
      }
    }
  }
  // abertura (erode r, dilata r dentro do original): tira fiapo e fresta
  const r = cfg.abertura ?? 1
  const erode = (src) => { const o = new Uint8Array(N * N); for (let by = r; by < N - r; by++) for (let bx = r; bx < N - r; bx++) { let ok = 1; for (let dy = -r; dy <= r && ok; dy++) for (let dx = -r; dx <= r; dx++) if (!src[(by + dy) * N + bx + dx]) { ok = 0; break } o[by * N + bx] = ok } return o }
  const dilata = (src, lim) => { const o = new Uint8Array(N * N); for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) { if (!lim[by * N + bx]) continue; let ok = 0; for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) { const x = bx + dx, y = by + dy; if (x >= 0 && y >= 0 && x < N && y < N && src[y * N + x]) { ok = 1; break } } o[by * N + bx] = ok } return o }
  if (r > 0) {
    const forc = new Uint8Array(N * N)
    for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) if (forcado(bx, by) && naRegiao(bx, by)) forc[by * N + bx] = 1
    m = dilata(erode(m), m)
    for (let j = 0; j < N * N; j++) if (forc[j]) m[j] = 1
    m = comp(m)
  }
  const total = m.reduce((a, b) => a + b, 0)

  // saida: arte 2048 (vizinho), ref rosa/amarelo, previa 768 com grade
  const W2 = W * 2, arte = Buffer.alloc(W2 * W2 * 4)
  for (let y = 0; y < W2; y++) for (let x = 0; x < W2; x++) {
    const si = ((y >> 1) * W + (x >> 1)) * 4, di = (y * W2 + x) * 4
    arte[di] = d[si]; arte[di + 1] = d[si + 1]; arte[di + 2] = d[si + 2]; arte[di + 3] = 255
  }
  const ref = Buffer.from(arte), B2 = B * 2
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    if (!m[by * N + bx]) continue
    for (let y = by * B2; y < (by + 1) * B2; y++) for (let x = bx * B2; x < (bx + 1) * B2; x++) { const i = (y * W2 + x) * 4; ref[i] = 255; ref[i + 1] = 80; ref[i + 2] = 220 }
  }
  const [sx2, sy2] = cfg.spawn.map((v) => v * 4)
  for (let y = sy2 - 28; y <= sy2 + 28; y++) for (let x = sx2 - 28; x <= sx2 + 28; x++) {
    if ((x - sx2) ** 2 + (y - sy2) ** 2 > 28 * 28) continue
    const i = (y * W2 + x) * 4; ref[i] = 255; ref[i + 1] = 235; ref[i + 2] = 0
  }
  if (ESCREVER) {
    fs.writeFileSync(path.join(ROOT, 'assets/hunt-backgrounds', chave + '.jpg'), Buffer.from(jpeg.encode({ data: arte, width: W2, height: W2 }, 92).data))
    const png = new PNG({ width: W2, height: W2 }); ref.copy(png.data)
    fs.writeFileSync(path.join(ROOT, 'scripts/body-block-refs', chave + '.png'), PNG.sync.write(png))
  }
  const S = Number(process.env.TAM || 768), p = new PNG({ width: S, height: S })
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = Math.floor(x * W2 / S), Y = Math.floor(y * W2 / S), si = (Y * W2 + X) * 4, di = (y * S + x) * 4
    const rosa = ref[si] === 255 && ref[si + 1] === 80 && ref[si + 2] === 220
    const am = ref[si] === 255 && ref[si + 1] === 235 && ref[si + 2] === 0
    for (let c = 0; c < 3; c++) p.data[di + c] = am ? [255, 235, 0][c] : rosa ? Math.round(arte[si + c] * 0.45 + [255, 80, 220][c] * 0.55) : arte[si + c]
    if (x % (S / 8) === 0 || y % (S / 8) === 0) { p.data[di] = 255; p.data[di + 1] = 255; p.data[di + 2] = 255 }
    p.data[di + 3] = 255
  }
  fs.writeFileSync(path.join(SAIDA, 'v-' + chave + '.png'), PNG.sync.write(p))
  montagem.push({ chave, p, S })
  console.log(chave.padEnd(20), 'blocos:', total, 'contorno<', Math.round(limiarContorno))
}
if (montagem.length > 1) {
  const C = 6, S = 256, L = Math.ceil(montagem.length / C), mm = new PNG({ width: C * S, height: L * S })
  montagem.forEach(({ p, S: T }, n) => {
    const ox = (n % C) * S, oy = Math.floor(n / C) * S
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const si = (Math.floor(y * T / S) * T + Math.floor(x * T / S)) * 4, di = ((oy + y) * C * S + ox + x) * 4; p.data.copy(mm.data, di, si, si + 4) }
  })
  fs.writeFileSync(path.join(SAIDA, 'montagem-v2.png'), PNG.sync.write(mm))
}
