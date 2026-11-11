// Recorta a arte original sem reamostrar nem quantizar cores. O Idle e uma pose
// da fonte, intacta; o Walk e gerado dela (ver PASSO DE VERDADE).
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
      // Centro de massa vertical do corpo (29/10/2026): referencia pra
      // estabilizar o quadro — ver ESTABILIZACAO abaixo.
      let sumY = 0, nY = 0
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const lab = labels[y * W + x]
        if (lab >= 0 && meus.has(lab) && D[(y * W + x) * 4 + 3] > 128) { sumY += y; nY++ }
      }
      frames[row][q] = { x0: Math.max(0, x0 - 3), x1: Math.min(W - 1, x1 + 3),
        y0: Math.max(bounds[row], y0 - 3), y1: Math.min(bounds[row + 1] - 1, y1 + 3),
        foot: y1, top: y0, center: Math.round(sumX / count), bodyHeight: y1 - y0 + 1, meus,
        massa: y1 - sumY / nY }
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
  const subida = Math.max(0, ...all.map(f => -f.ajuste || 0))
  const descida = Math.max(0, ...all.map(f => f.ajuste || 0))
  const footY = Math.max(...all.map(f => f.foot - f.y0)) + 2 + contorno + subida
  const frameHeight = footY + 6 + contorno + descida
  // Abertura das pernas: largura do corpo no quinto de baixo.
  const abertura = (f) => {
    let left = W, right = -1
    for (let y = f.foot - Math.ceil(f.bodyHeight * .2); y <= f.foot; y++) for (let x = f.x0; x <= f.x1; x++) {
      const lab = labels[y * W + x]
      if (lab >= 0 && f.meus.has(lab) && D[(y * W + x) * 4 + 3] > 128) { left = Math.min(left, x); right = Math.max(right, x) }
    }
    return right - left
  }
  for (const row of frames) for (const f of row) f.abertura = abertura(f)

  // IDLE ERETO (29/10/2026): o quadro de pes mais juntos E corpo mais alto
  // (menos curvado no passo). A respiracao e feita no desenho, nao na arte.
  const idle = frames.map(row => {
    const nota = row.map(f => f.abertura - f.bodyHeight * 0.6)
    return nota.indexOf(Math.min(...nota))
  })
  // Quadro da fonte desenhado numa celula propria (pe em footY, tronco no meio).
  function celula(f) {
    const cel = Buffer.alloc(frameWidth * frameHeight * 4)
    for (let y = f.y0; y <= f.y1; y++) for (let x = f.x0; x <= f.x1; x++) {
      const tx = halfWidth + x - f.center, ty = footY + y - f.foot
      if (tx < 0 || tx >= frameWidth || ty < 0 || ty >= frameHeight) throw new Error('Recorte ultrapassa o quadro')
      // Pixel forte de outro boneco (a borda da vizinha entrando no retangulo)
      // fica de fora; franja semitransparente (sem corpo) segue como sempre.
      const dono = labels[y * W + x]
      if (dono >= 0 && !f.meus.has(dono) && D[(y * W + x) * 4 + 3] > 128) continue
      D.copy(cel, (ty * frameWidth + tx) * 4, (y * W + x) * 4, (y * W + x) * 4 + 4)
    }
    return cel
  }

  // PASSO DE VERDADE (10/11/2026, "efeito de andar de verdade"). Na arte de
  // origem as pernas quase nao mudam de um quadro pro outro (Mochileiro de
  // frente: 51/50/50/51 px de abertura) — reordenar quadros (29/10) nao criava
  // passo, e o boneco deslizava. Agora o ciclo sai de UM quadro por direcao:
  //   0 em pe · 1 um pe no ar · 2 em pe · 3 o outro pe no ar
  // O pe sobe inteiro (o sapato nao amassa); a perna encurta acima dele, por
  // descarte de linhas, e vai pro meio do corpo na vista de lado. Tronco e
  // cabeca sao identicos nos 4 quadros: nada treme alem das pernas.
  const QUADRIL = 0.24, SAPATO = 0.08, LEVANTA = 0.09, PRO_MEIO = 0.55
  function divisaDasPernas(cel, bh) {
    const forte = (x, y) => cel[(y * frameWidth + x) * 4 + 3] > 128
    const ocupa = new Array(frameWidth).fill(0)
    for (let y = footY - Math.round(bh * SAPATO); y <= footY; y++) for (let x = 0; x < frameWidth; x++) if (forte(x, y)) ocupa[x]++
    let xl = ocupa.findIndex(n => n > 0), xr = frameWidth - 1 - [...ocupa].reverse().findIndex(n => n > 0)
    // Maior vao entre os pes; sem vao (pes sobrepostos), o vale do terco do meio.
    let melhor = null, ini = -1
    for (let x = xl; x <= xr + 1; x++) {
      const vazio = x <= xr && ocupa[x] === 0
      if (vazio && ini < 0) ini = x
      if (!vazio && ini >= 0) { if (!melhor || x - ini > melhor.fim - melhor.ini) melhor = { ini, fim: x }; ini = -1 }
    }
    if (melhor) return { divisa: Math.round((melhor.ini + melhor.fim) / 2), vao: true, folga: [melhor.fim - melhor.ini, melhor.fim - melhor.ini].map(v => v / 2) }
    const a = Math.round(xl + (xr - xl) / 3), b = Math.round(xr - (xr - xl) / 3)
    let divisa = a
    for (let x = a; x <= b; x++) if (ocupa[x] < ocupa[divisa]) divisa = x
    return { divisa, vao: false, folga: [0, 0] }
  }
  function levantar(cel, f, lado) {
    const bh = f.bodyHeight
    const out = Buffer.from(cel)
    const { divisa, folga } = divisaDasPernas(cel, bh)
    const topo = footY - Math.round(bh * QUADRIL), base = Math.min(frameHeight - 1, footY + 4)
    const L = Math.round(bh * LEVANTA), S = Math.round(bh * SAPATO) + 4
    const puxa = folga[lado] * PRO_MEIO * (lado === 0 ? 1 : -1)
    const forte = (x, y) => cel[(y * frameWidth + x) * 4 + 3] > 128
    // Quem sobe: o lado da divisa, linha a linha. Um trecho curto do MESMO pe
    // que atravessa a reta vai junto (senao fica um palito no chao).
    const LASCA = Math.round(bh * 0.07)
    const limite = new Int32Array(frameHeight)
    for (let y = topo; y <= base; y++) {
      let x = divisa
      if (lado === 0) { while (x < frameWidth && x - divisa <= LASCA && forte(x, y)) x++; limite[y] = x - divisa > LASCA ? divisa : x }
      else { x = divisa - 1; while (x >= 0 && divisa - 1 - x <= LASCA && forte(x, y)) x--; limite[y] = divisa - 1 - x > LASCA ? divisa : x + 1 }
    }
    const sobe = (x, y) => y >= topo && y <= base && (lado === 0 ? x < limite[y] : x >= limite[y])
    for (let y = topo; y <= base; y++) for (let x = 0; x < frameWidth; x++) if (sobe(x, y)) out.fill(0, (y * frameWidth + x) * 4, (y * frameWidth + x) * 4 + 4)
    const perna = base - S - topo
    for (let y = topo; y <= base - L; y++) {
      const sy = y > base - L - S ? y + L : Math.round(topo + (y - topo) * perna / (perna - L))
      const t = Math.min(1, (y - topo) / (base - L - topo))
      const dx = Math.round(puxa * t)
      for (let x = 0; x < frameWidth; x++) {
        const sx = x - dx
        if (sx < 0 || sx >= frameWidth || !sobe(sx, sy)) continue
        const from = (sy * frameWidth + sx) * 4
        if (cel[from + 3] === 0) continue
        // A perna que sobe passa NA FRENTE da outra; a franja so entra no vazio.
        const to = (y * frameWidth + x) * 4
        if (cel[from + 3] > 128 || out[to + 3] === 0) cel.copy(out, to, from, from + 4)
      }
    }
    // A divisa e uma reta e o pe nao: quando os pes se encostam, sobra uma
    // lasca do pe levantado do lado que ficou no chao. Ilha pequena solta do
    // corpo sai, com a franja em volta dela.
    const rotulo = new Int32Array(frameWidth * frameHeight).fill(-1), ilhas = []
    for (let i = 0; i < rotulo.length; i++) {
      if (out[i * 4 + 3] <= 128 || rotulo[i] >= 0) continue
      const pilha = [i], pontos = []
      rotulo[i] = ilhas.length
      while (pilha.length) {
        const p = pilha.pop(), x = p % frameWidth, y = (p - x) / frameWidth
        pontos.push(p)
        for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + ax, ny = y + ay, n = ny * frameWidth + nx
          if (nx < 0 || nx >= frameWidth || ny < 0 || ny >= frameHeight || rotulo[n] >= 0 || out[n * 4 + 3] <= 128) continue
          rotulo[n] = ilhas.length; pilha.push(n)
        }
      }
      ilhas.push(pontos)
    }
    const maior = Math.max(...ilhas.map(p => p.length))
    for (const pontos of ilhas) {
      if (pontos.length >= maior * 0.02) continue
      for (const p of pontos) {
        const x = p % frameWidth, y = (p - x) / frameWidth
        for (let ay = -5; ay <= 5; ay++) for (let ax = -5; ax <= 5; ax++) {
          const nx = x + ax, ny = y + ay
          if (nx < 0 || nx >= frameWidth || ny < topo || ny >= frameHeight) continue
          const n = ny * frameWidth + nx
          if (rotulo[n] === rotulo[p] || out[n * 4 + 3] <= 128) out.fill(0, n * 4, n * 4 + 4)
        }
      }
    }
    return out
  }
  function folha(columns, quadroDe) {
    const out = new PNG({ width: frameWidth * columns, height: frameHeight * 8 })
    out.data.fill(0)
    for (let row = 0; row < 8; row++) for (let q = 0; q < columns; q++) {
      const mirror = map[row][1], cel = quadroDe(row, q)
      for (let y = 0; y < frameHeight; y++) for (let x = 0; x < frameWidth; x++) {
        const from = (y * frameWidth + (mirror ? frameWidth - 1 - x : x)) * 4
        cel.copy(out.data, ((row * frameHeight + y) * out.width + q * frameWidth + x) * 4, from, from + 4)
      }
    }
    return out
  }
  // Base do passo: de frente/costas, o quadro mais ereto (o do Idle); de lado e
  // nas diagonais, o de passo mais aberto (os dois pes separados no chao).
  const linhasDeFrente = new Set([map[0][0], map[4][0]])
  const base = frames.map((row, r) => linhasDeFrente.has(r) ? idle[r] : row.map(f => f.abertura).indexOf(Math.max(...row.map(f => f.abertura))))
  // DE FRENTE E DE COSTAS a arte costuma ter um pe so a mostra (o outro esta
  // atras, no meio do passo): nao ha dois pes pra alternar. Ai o passo oposto
  // e a MESMA perna espelhada no eixo do corpo, do quadril pra baixo — a linha
  // e o eixo sao os de menor diferenca entre o corpo e o seu espelho, pra
  // emenda nao aparecer.
  function espelharPernas(cel, f) {
    const bh = f.bodyHeight, out = Buffer.from(cel)
    const dif = (y, eixo2) => {
      let d = 0
      for (let x = 0; x < frameWidth; x++) {
        const mx = eixo2 - x, i = (y * frameWidth + x) * 4
        const j = mx >= 0 && mx < frameWidth ? (y * frameWidth + mx) * 4 : -1
        const a = cel[i + 3], b = j < 0 ? 0 : cel[j + 3]
        if (a <= 128 && b <= 128) continue
        d += a > 128 && b > 128 ? (Math.abs(cel[i] - cel[j]) + Math.abs(cel[i + 1] - cel[j + 1]) + Math.abs(cel[i + 2] - cel[j + 2])) / 765 : 1
      }
      return d
    }
    let melhor = null
    for (let y = footY - Math.round(bh * 0.30); y <= footY - Math.round(bh * 0.16); y++) {
      for (let eixo2 = 2 * halfWidth - 12; eixo2 <= 2 * halfWidth + 12; eixo2++) {
        const d = dif(y - 1, eixo2) + dif(y, eixo2) + dif(y + 1, eixo2)
        if (!melhor || d < melhor.d) melhor = { d, y, eixo2 }
      }
    }
    // So a faixa das pernas espelha: o que pende ao lado delas (a ponta do
    // cabelo da Jessie, a mao, a barra da capa) fica onde esta.
    const eixo = melhor.eixo2 / 2, teto = Math.round(bh * 0.2)
    const ocupa = new Array(frameWidth).fill(0)
    for (let y = footY - Math.round(bh * SAPATO); y <= footY; y++) for (let x = 0; x < frameWidth; x++) if (cel[(y * frameWidth + x) * 4 + 3] > 128) ocupa[x]++
    let meia = 0
    for (const passo of [-1, 1]) {
      let x = Math.round(eixo), vazios = 0
      while (x >= 0 && x < frameWidth && Math.abs(x - eixo) < teto && vazios < 4) { vazios = ocupa[x] ? 0 : vazios + 1; if (ocupa[x]) meia = Math.max(meia, Math.abs(x - eixo)); x += passo }
    }
    meia = Math.min(teto, meia + 4)
    for (let y = melhor.y; y < frameHeight; y++) for (let x = Math.ceil(eixo - meia); x <= Math.floor(eixo + meia); x++) {
      const mx = melhor.eixo2 - x, to = (y * frameWidth + x) * 4
      if (x < 0 || x >= frameWidth) continue
      if (mx < 0 || mx >= frameWidth) out.fill(0, to, to + 4)
      else cel.copy(out, to, (y * frameWidth + mx) * 4, (y * frameWidth + mx) * 4 + 4)
    }
    return out
  }
  const ciclo = map.map(([r], dir) => {
    const f = frames[r][base[r]], cel = celula(f)
    const { vao } = divisaDasPernas(cel, f.bodyHeight)
    if (!vao && (dir === 0 || dir === 4)) {
      // Corpo quase simetrico (casaco longo da Cynthia de costas): o espelho
      // sai igual a pose e nada mexeria — ai vale o pe no ar, como nas outras.
      const esp = espelharPernas(cel, f)
      let muda = 0
      for (let i = 3; i < cel.length; i += 4) if ((cel[i] > 128) !== (esp[i] > 128)) muda++
      if (muda > (f.bodyHeight / 30) ** 2 * 4) return [cel, cel, esp, esp]
    }
    return [cel, levantar(cel, f, 0), cel, levantar(cel, f, 1)]
  })
  const walk = folha(4, (row, q) => ciclo[row][q])
  const idleAtlas = folha(2, (row) => celula(frames[map[row][0]][idle[map[row][0]]]))
  if (contorno > 0) { aplicarContorno(walk, frameWidth, frameHeight, contorno); aplicarContorno(idleAtlas, frameWidth, frameHeight, contorno) }
  return { walk, idle: idleAtlas,
    geometry: { frameWidth, frameHeight, footX: halfWidth, footY, bodyHeight, walkFrames: 4 }, frames, idleFrames: idle, base }
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
    console.log(skin, JSON.stringify(result.geometry), 'idle', result.idleFrames.join(','), 'base', result.base.join(','))
  }
  fs.writeFileSync(path.join(root, 'src/data/quadrosDoTreinador.json'), JSON.stringify(geometry, null, 2) + '\n')
}
module.exports = { recortar }
if (require.main === module) main()
