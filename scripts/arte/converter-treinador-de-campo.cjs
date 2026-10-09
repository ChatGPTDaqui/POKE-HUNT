// Converte a folha de um treinador de campo (arte do dono: N linhas x 4 quadros
// de passo, PNG com alpha) pro formato das folhas dos POKE: 8 direcoes na ordem
// do PMD x 4 quadros, quadro 32x40, pe na linha 37, boneco com 30 px de altura.
// Gera Walk-Anim.png e Idle-Anim.png (pose EM PE: as folhas so tem passos).
//
// uso: node scripts/arte/converter-treinador-de-campo.cjs <cfg.json>
//   cfg = { src, linhas, saida, altura?, quadril?, mapa }
//   mapa: 8 pares [linhaDaOrigem, espelhar] na ordem PMD
//         (baixo, baixo-dir, dir, cima-dir, cima, cima-esq, esq, baixo-esq).
// Mapas usados em 08/10/2026 (saida em assets/treinadores/campo/<id>):
//   mochila (7 linhas) [[0,0],[1,0],[2,0],[6,0],[4,0],[5,0],[3,0],[1,1]]
//   cynthia (7 linhas) [[0,0],[6,0],[5,0],[4,0],[3,0],[4,1],[2,0],[6,1]]
//   lance   (6 linhas) [[0,0],[1,0],[4,0],[3,0],[3,0],[3,0],[2,0],[5,0]]
//   may     (6 linhas) [[0,0],[1,0],[4,0],[3,0],[3,0],[3,0],[2,0],[1,1]]
//   dawn    (6 linhas) [[0,0],[1,0],[5,0],[3,0],[3,0],[3,0],[2,0],[4,0]]
// (As folhas de 6 linhas nao tem diagonais de costas: cima-dir/esq usam a de costas.)
const fs = require('fs'), path = require('path')
const { PNG } = require('pngjs')
const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const ALVO_H = cfg.altura || 30, NL = cfg.linhas
const src = PNG.sync.read(fs.readFileSync(cfg.src))
const W = src.width, H = src.height, D = src.data
const opaco = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) opaco[i] = D[i * 4 + 3] > 128 ? 1 : 0
const lab = new Int32Array(W * H).fill(-1); const comps = []
for (let s = 0; s < W * H; s++) {
  if (!opaco[s] || lab[s] >= 0) continue
  const id = comps.length; const st = [s]; lab[s] = id; let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  while (st.length) {
    const k = st.pop(); const x = k % W, y = (k - x) / W; n++; sx += x; sy += y
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const q = ny * W + nx; if (opaco[q] && lab[q] < 0) { lab[q] = id; st.push(q) }
    }
  }
  comps.push({ id, n, cx: sx / n, cy: sy / n, x0, x1, y0, y1 })
}
// Linhas pelos maiores vaos entre os centros dos desenhos (a folha nem sempre ocupa a altura toda).
const grandes = comps.filter(c => c.n >= 2000).map(c => c.cy).sort((a, b) => a - b)
const vaos = grandes.slice(1).map((y, i) => ({ y: (y + grandes[i]) / 2, g: y - grandes[i] })).sort((a, b) => b.g - a.g).slice(0, NL - 1).map(v => v.y).sort((a, b) => a - b)
const linhaDe = cy => { let r = 0; while (r < vaos.length && cy > vaos[r]) r++; return r }
const cel = {}
for (const c of comps) {
  if (c.n < 150) continue
  const r = linhaDe(c.cy), q = Math.min(3, Math.floor(c.cx / (W / 4)))
  ;(cel[r + ',' + q] || (cel[r + ',' + q] = [])).push(c)
}
const quadros = {}
for (let r = 0; r < NL; r++) for (let q = 0; q < 4; q++) {
  const cs = (cel[r + ',' + q] || []).sort((a, b) => b.n - a.n); const main = cs[0]
  if (!main) throw new Error('vazio ' + r + ',' + q)
  const keep = new Set(cs.filter(c => c === main || (c.x0 < main.x1 + 10 && c.x1 > main.x0 - 10 && c.y0 < main.y1 + 10 && c.y1 > main.y0 - 10)).map(c => c.id))
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1
  for (const c of cs) if (keep.has(c.id)) { x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1) }
  quadros[r + ',' + q] = { keep, x0, x1, y0, y1 }
}
const escDaLinha = r => {
  const hs = [0, 1, 2, 3].map(q => { const f = quadros[r + ',' + q]; return f.y1 - f.y0 + 1 }).sort((a, b) => a - b)
  return ALVO_H / ((hs[1] + hs[2]) / 2)
}
function reduzir(f, r) {
  const esc = escDaLinha(r), bloco = 1 / esc
  let sx = 0, n = 0
  for (let y = f.y0; y < f.y0 + (f.y1 - f.y0) / 2; y++) for (let x = f.x0; x <= f.x1; x++) { const i = y * W + x; if (opaco[i] && f.keep.has(lab[i])) { sx += x; n++ } }
  const cx = sx / n, ox = cx, oy = f.y1 + 1, out = []
  for (let ty = -Math.ceil((oy - f.y0) * esc) - 1; ty < 0; ty++) for (let tx = -Math.ceil((cx - f.x0) * esc) - 1; tx <= Math.ceil((f.x1 - cx) * esc) + 1; tx++) {
    const ax = ox + tx * bloco, ay = oy + ty * bloco; const baldes = new Map(); let tot = 0, cob = 0
    for (let y = Math.floor(ay); y < Math.ceil(ay + bloco); y++) for (let x = Math.floor(ax); x < Math.ceil(ax + bloco); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; tot++
      const i = y * W + x; if (!opaco[i] || !f.keep.has(lab[i])) continue; cob++
      const R = D[i * 4], G = D[i * 4 + 1], B = D[i * 4 + 2]; const kk = (R >> 4) << 8 | (G >> 4) << 4 | (B >> 4)
      const v = baldes.get(kk) || [0, 0, 0, 0]; v[0]++; v[1] += R; v[2] += G; v[3] += B; baldes.set(kk, v)
    }
    if (!tot || cob / tot < 0.5) continue
    let best = null, bs = -1
    for (const v of baldes.values()) { const l = (v[1] + v[2] + v[3]) / v[0] / 3; const s = v[0] * (l < 45 ? 1.6 : 1); if (s > bs) { bs = s; best = v } }
    out.push({ x: tx, y: ty, rgb: [best[1] / best[0], best[2] / best[0], best[3] / best[0]] })
  }
  return out
}
const red = {}; for (const k in quadros) red[k] = reduzir(quadros[k], +k.split(',')[0])
const todos = []; for (const k in red) for (const p of red[k]) todos.push(p.rgb)
let cent = []; for (let i = 0; i < 20; i++) cent.push(todos[Math.floor(i * todos.length / 20)].slice())
const perto = c => { let bi = 0, bd = 1e9; cent.forEach((m, j) => { const d = (c[0] - m[0]) ** 2 + (c[1] - m[1]) ** 2 + (c[2] - m[2]) ** 2; if (d < bd) { bd = d; bi = j } }); return bi }
for (let it = 0; it < 15; it++) {
  const acc = cent.map(() => [0, 0, 0, 0])
  for (const c of todos) { const a = acc[perto(c)]; a[0]++; a[1] += c[0]; a[2] += c[1]; a[3] += c[2] }
  cent = cent.map((m, j) => acc[j][0] ? [acc[j][1] / acc[j][0], acc[j][2] / acc[j][0], acc[j][3] / acc[j][0]] : m)
}
const snap = c => cent[perto(c)].map(Math.round)
const lum = c => (c[0] + c[1] + c[2]) / 3
function soMaior(px) {
  const m = new Map(px.map(p => [p.x + ',' + p.y, p])), visto = new Set(); let maior = []
  for (const p of px) {
    const k0 = p.x + ',' + p.y; if (visto.has(k0)) continue
    const g = [], st = [p]; visto.add(k0)
    while (st.length) {
      const q = st.pop(); g.push(q)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const k = (q.x + dx) + ',' + (q.y + dy); if (m.has(k) && !visto.has(k)) { visto.add(k); st.push(m.get(k)) } }
    }
    if (g.length > maior.length) maior = g
  }
  return maior
}
// Pose EM PE: tronco/cabeca do quadro; pernas redesenhadas retas. A cor de cada
// linha da perna vem da perna APOIADA do proprio quadro (pele, meia, bota...).
// `subir`: tronco 1 px acima e perna 1 px mais longa — o quadro NEUTRO da
// caminhada do PMD (pernas se cruzando, corpo no alto do balanco).
function emPe(px, vista, olha, subir = false) {
  const ymin = Math.min(...px.map(p => p.y)), Hh = -ymin, hipY = -Math.round((cfg.quadril || 0.28) * Hh)
  const tronco = px.filter(p => p.y >= hipY - 3 && p.y <= hipY)
  const hx = Math.round(tronco.reduce((a, p) => a + p.x, 0) / tronco.length)
  const pernas = px.filter(p => p.y > hipY)
  const contorno = pernas.reduce((m, p) => lum(p.rgb) < lum(m) ? p.rgb : m, [255, 255, 255])
  const pe = px.filter(p => p.y >= -2); const fx = pe.reduce((a, p) => a + p.x, 0) / pe.length
  const corDaLinha = {}; let ultima = contorno
  for (let y = hipY + 1; y <= -1; y++) {
    const t = (y - hipY) / (-1 - hipY), lx = hx * (1 - t) + fx * t
    const cand = pernas.filter(p => p.y === y && Math.abs(p.x - lx) <= 2 && lum(p.rgb) > lum(contorno) + 15)
    if (cand.length) {
      const c = new Map()
      for (const p of cand) { const k = p.rgb.map(v => v >> 4).join(); const v = c.get(k) || { n: 0, rgb: p.rgb }; v.n += 1 / (1 + Math.abs(p.x - lx)); c.set(k, v) }
      let b = null; for (const v of c.values()) if (!b || v.n > b.n) b = v; ultima = b.rgb
    }
    corDaLinha[y] = ultima
  }
  const m = new Map()
  const dy = subir ? -1 : 0
  for (const p of px) { if (p.y > hipY + 2) continue; if (p.y > hipY && Math.abs(p.x - hx) <= 5) continue; m.set(p.x + ',' + (p.y + dy), { ...p, y: p.y + dy }) }
  if (subir) corDaLinha[hipY] = corDaLinha[hipY + 1]
  const pinta = (x, y, rgb) => m.set(x + ',' + y, { x, y, rgb })
  const perna = (x0, x1, bico) => {
    for (let y = hipY + 1 + dy; y <= -1; y++) {
      const sapato = y >= -2; const e = x0 - 1 - (sapato && bico < 0 ? 1 : 0), d = x1 + 1 + (sapato && bico > 0 ? 1 : 0)
      for (let x = e; x <= d; x++) pinta(x, y, (x === e || x === d || y === -1) ? contorno : corDaLinha[y])
    }
  }
  if (vista === 'lado') perna(hx - 1, hx + 1, olha); else { perna(hx - 3, hx - 2, 0); perna(hx + 1, hx + 2, 0) }
  return soMaior([...m.values()])
}
const QL = 32, QA = 40, PE = 37, MAPA = cfg.mapa
function folha(nq, fn) {
  const o = new PNG({ width: QL * nq, height: QA * 8 }); o.data.fill(0)
  for (let lin = 0; lin < 8; lin++) for (let q = 0; q < nq; q++) for (const p of fn(lin, q)) {
    const x = (MAPA[lin][1] ? -p.x : p.x) + QL / 2 + q * QL, y = p.y + PE + 1 + lin * QA
    if (x < q * QL || x >= (q + 1) * QL || y < lin * QA || y >= (lin + 1) * QA) continue
    const i = (y * o.width + x) * 4, c = snap(p.rgb); o.data[i] = c[0]; o.data[i + 1] = c[1]; o.data[i + 2] = c[2]; o.data[i + 3] = 255
  }
  return o
}
fs.mkdirSync(cfg.saida, { recursive: true })
const idleQ = {}
for (let r = 0; r < NL; r++) {
  let bq = 0, bw = 1e9
  for (let q = 0; q < 4; q++) {
    const px = red[r + ',' + q]; const ymin = Math.min(...px.map(p => p.y)); const pes = px.filter(p => p.y > ymin * 0.25)
    const w = Math.max(...pes.map(p => p.x)) - Math.min(...pes.map(p => p.x)); if (w < bw) { bw = w; bq = q }
  }
  idleQ[r] = bq
}
// Caminhada no ciclo do PMD (conferido no Machoke do SpriteCollab, AnimData
// 8/10/8/10): NEUTRO, PASSO, NEUTRO, PASSO. O neutro e a pose em pe com o
// corpo 1 px acima (o balanco do andar); os passos sao os 2 quadros da arte com
// as pernas mais abertas (pe trocado). A arte da IA traz 4 passos sem neutro e sem balanco,
// e as pernas "pedalavam" sem ritmo.
const abertura = px => { const ymin = Math.min(...px.map(p => p.y)); const pes = px.filter(p => p.y > ymin * 0.25); return Math.max(...pes.map(p => p.x)) - Math.min(...pes.map(p => p.x)) }
const passos = {}
// Passos opostos (pe esquerdo/direito a frente) ficam a 2 quadros de distancia
// no ciclo da arte: o par e (0,2) ou (1,3), o mais aberto dos dois.
for (let r = 0; r < NL; r++) {
  const ab = q => abertura(red[r + ',' + q])
  passos[r] = ab(0) + ab(2) >= ab(1) + ab(3) ? [0, 2] : [1, 3]
}
fs.writeFileSync(path.join(cfg.saida, 'Walk-Anim.png'), PNG.sync.write(folha(4, (lin, q) => {
  const [sr, esp] = MAPA[lin]; const lado = lin === 2 || lin === 6
  if (q % 2 === 1) return red[sr + ',' + passos[sr][q === 1 ? 0 : 1]]
  return emPe(red[sr + ',' + idleQ[sr]], lado ? 'lado' : 'frente', (lin === 2 ? 1 : -1) * (esp ? -1 : 1), true)
})))
fs.writeFileSync(path.join(cfg.saida, 'Idle-Anim.png'), PNG.sync.write(folha(2, (lin, q) => {
  const [sr, esp] = MAPA[lin]; const lado = lin === 2 || lin === 6
  const olha = (lin === 2 ? 1 : -1) * (esp ? -1 : 1)
  const px = emPe(red[sr + ',' + idleQ[sr]], lado ? 'lado' : 'frente', olha)
  if (q === 0) return px
  const ymin = Math.min(...px.map(p => p.y)), cint = Math.round(ymin * 0.45)
  const m = new Map()
  for (const p of px) if (p.y >= cint) m.set(p.x + ',' + p.y, p)
  for (const p of px) if (p.y < cint) m.set(p.x + ',' + (p.y + 1), { ...p, y: p.y + 1 })
  return [...m.values()]
})))
// previa: walk 4 colunas + idle 2 colunas lado a lado, x5
const wa = PNG.sync.read(fs.readFileSync(path.join(cfg.saida, 'Walk-Anim.png'))), ia = PNG.sync.read(fs.readFileSync(path.join(cfg.saida, 'Idle-Anim.png')))
const k = 5, o = new PNG({ width: (128 + 8 + 64) * k, height: 320 * k })
for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
  const sx = x / k | 0, sy = y / k | 0; let a = null, ax = 0
  if (sx < 128) { a = wa; ax = sx } else if (sx >= 136) { a = ia; ax = sx - 136 }
  const j = (y * o.width + x) * 4; const bg = ((sx >> 2) + (sy >> 2)) % 2 ? 70 : 90
  if (a) { const i = (sy * a.width + ax) * 4; for (let c = 0; c < 3; c++) o.data[j + c] = a.data[i + 3] ? a.data[i + c] : bg } else for (let c = 0; c < 3; c++) o.data[j + c] = 30
  o.data[j + 3] = 255
}
fs.writeFileSync(cfg.saida + '-previa.png', PNG.sync.write(o))
console.log('ok', cfg.saida, 'idle', JSON.stringify(idleQ), 'passos', JSON.stringify(passos))
