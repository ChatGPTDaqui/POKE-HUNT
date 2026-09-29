// TEXTURA do fogo: as particulas viram um CAMPO DE CALOR pintado por pixel.
//
// Decisao do dono (28/09), depois de comparar tres versoes: a CONSTRUCAO do
// golpe (que particulas nascem, pra onde vao, em que ritmo) e a do lab v2; o
// que melhora e so a TEXTURA da chama. Entao a coreografia continua emitindo
// as mesmas particulas do v2 — e aqui, em vez de cada uma virar uma gota
// recortada, todas SOMAM calor num buffer de 1 px = 1 unidade de mundo:
//
//   - particula nova e quente, particula velha esfria (o nucleo do v2 que
//     "apagava na metade da vida" vira gradiente continuo);
//   - onde varias chamas se sobrepoem o calor soma — o miolo do jato e do
//     incendio fica amarelo sozinho, a borda fica vermelha;
//   - um ruido que ROLA pra cima rasga a borda e solta pedacinhos, a textura
//     da chama procedural que o dono aprovou;
//   - o calor final e fatiado nas 4 cores da pele (contorno, base, meio,
//     nucleo): continua cel-shaded, continua pixel art.
//
// Custo: cada particula so percorre o proprio retangulo (raio x cauda), e o
// fatiamento percorre o retangulo que contem todas. Nada proporcional a tela.
import { entrada, limitar } from './primitivas'
import type { Pele } from './tipos'

/** Particula de fogo no instante do desenho (a mesma `Viva` das coreografias). */
export interface Brasa { x: number; y: number; r: number; f: number; ang: number; semente: number }

/** Limiares de calor das 4 faixas: contorno, base, meio, nucleo. */
const LIMIARES = [0.14, 0.4, 0.72, 1.05] as const
/** Cauda da gota: quanto ela se estica pra tras do movimento, em raios (o 2,1 do v2). */
const CAUDA = 2.1

function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function ruido(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y)
  const fx = x - xi, fy = y - yi
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

/** Raio da gota no instante — a MESMA curva do v2 (cresce 0,55x -> 1,85x, some nos ultimos 40%). */
export function raioNaIdade(p: Brasa): number {
  return p.r * (0.55 + p.f * 1.3) * (1 - entrada(limitar((p.f - 0.6) / 0.4)))
}

/** Temperatura pela idade: nasce quente, esfria. Nunca negativa. */
function temperatura(f: number): number {
  return Math.max(0, 1.25 - f * 1.05)
}

let tela: HTMLCanvasElement | null = null
let calor = new Float32Array(0)
let imagem: ImageData | null = null

/** RGB das 4 faixas, calculado uma vez por pele (o hex nao muda). */
const coresCache = new WeakMap<Pele, number[][]>()
function coresDaPele(pele: Pele): number[][] {
  let c = coresCache.get(pele)
  if (!c) {
    c = [pele.contorno, pele.base, pele.meio, pele.nucleo].map(h => [
      parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16),
    ])
    coresCache.set(pele, c)
  }
  return c
}

/**
 * Pinta `chamas` como fogo em `ctx` (transform de MUNDO ja aplicado). `ms`
 * faz o ruido rolar; sem ele a borda ficaria parada.
 */
export function pintarFogo(ctx: CanvasRenderingContext2D, chamas: readonly Brasa[], pele: Pele, ms: number): void {
  if (!chamas.length || typeof document === 'undefined') return
  const vivas: Quente[] = []
  for (const p of chamas) {
    const r = raioNaIdade(p)
    if (r > 0.3) vivas.push({ p, r, t: temperatura(p.f) })
  }
  for (const ilha of ilhas(vivas)) pintarIlha(ctx, ilha, pele, ms)
}

interface Quente { p: Brasa; r: number; t: number }

/** Lado da celula de agrupamento. Maior que o maior alcance de uma gota em AoE (~63). */
const CELULA = 64

/**
 * Separa as gotas em ILHAS: grupos de celulas ocupadas que se tocam (vizinhas
 * de 8). Em area, o fogo fica em focos espalhados pelo raio de 175; um campo
 * unico varreria o retangulo inteiro, vazio entre os focos — era 1,9 ms do
 * Eruption. Gotas de ilhas diferentes nao se tocam (a celula e maior que o
 * alcance de qualquer gota), entao pintar separado nao muda o desenho.
 */
function ilhas(vivas: readonly Quente[]): Quente[][] {
  const celulas = new Map<string, Quente[]>()
  for (const v of vivas) {
    const k = `${Math.floor(v.p.x / CELULA)},${Math.floor(v.p.y / CELULA)}`
    const lista = celulas.get(k)
    if (lista) lista.push(v); else celulas.set(k, [v])
  }
  const grupos: Quente[][] = []
  const visto = new Set<string>()
  for (const inicio of celulas.keys()) {
    if (visto.has(inicio)) continue
    const grupo: Quente[] = []
    const fila = [inicio]
    visto.add(inicio)
    while (fila.length) {
      const k = fila.pop()!
      grupo.push(...celulas.get(k)!)
      const [cx, cy] = k.split(',').map(Number)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const vizinho = `${cx + dx},${cy + dy}`
        if (!visto.has(vizinho) && celulas.has(vizinho)) { visto.add(vizinho); fila.push(vizinho) }
      }
    }
    grupos.push(grupo)
  }
  return grupos
}

/**
 * Caixa JUSTA da gota, orientada pelo movimento: vai de `CAUDA` raios atras a 1
 * raio na frente, e 1 raio pros lados. O quadrado de 6,2 raios que envolvia a
 * gota em qualquer direcao varria ~4x mais pixels — com o raio escalado x2,5
 * da area, era o grosso do custo do Eruption.
 */
function caixaDaGota({ p, r }: Quente): [number, number, number, number] {
  const cs = Math.cos(p.ang), sn = Math.sin(p.ang)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const a of [-CAUDA * r, r]) for (const b of [-r, r]) {
    const x = p.x + a * cs - b * sn, y = p.y + a * sn + b * cs
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

function pintarIlha(ctx: CanvasRenderingContext2D, vivas: readonly Quente[], pele: Pele, ms: number): void {
  // Retangulo que contem todas as gotas da ilha (cabeca + cauda).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const v of vivas) {
    const c = caixaDaGota(v)
    x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); x1 = Math.max(x1, c[2]); y1 = Math.max(y1, c[3])
  }
  x0 = Math.floor(x0); y0 = Math.floor(y0)
  const w = Math.ceil(x1) - x0 + 1, h = Math.ceil(y1) - y0 + 1
  if (calor.length < w * h) calor = new Float32Array(w * h)
  calor.fill(0, 0, w * h)

  // 1. Cada gota soma calor no proprio retangulo. Forma de gota do v2:
  //    cabeca redonda na frente, cauda esticada pra tras do movimento.
  for (const v of vivas) {
    const { p, r, t } = v
    const cs = Math.cos(p.ang), sn = Math.sin(p.ang)
    const [cx0, cy0, cx1, cy1] = caixaDaGota(v)
    const ax = Math.max(0, Math.floor(cx0 - x0)), bx = Math.min(w - 1, Math.ceil(cx1 - x0))
    const ay = Math.max(0, Math.floor(cy0 - y0)), by = Math.min(h - 1, Math.ceil(cy1 - y0))
    for (let yy = ay; yy <= by; yy++) {
      const dy = yy + y0 + 0.5 - p.y
      for (let xx = ax; xx <= bx; xx++) {
        const dx = xx + x0 + 0.5 - p.x
        let ao = dx * cs + dy * sn // ao longo do movimento
        const perp = -dx * sn + dy * cs
        if (ao < 0) ao /= CAUDA // atras: cauda comprida
        const d2 = (ao * ao + perp * perp) / (r * r)
        if (d2 < 1) calor[yy * w + xx] += t * (1 - d2)
      }
    }
  }

  // 2. Ruido rolando pra cima rasga a borda; 3. fatia nas 4 cores da pele.
  if (!tela) tela = document.createElement('canvas')
  if (tela.width < w) tela.width = w
  if (tela.height < h) tela.height = h
  const tc = tela.getContext('2d', { willReadFrequently: true })!
  // ImageData REAPROVEITADO entre quadros (so cresce): alocar um por quadro
  // gerava os picos de coleta de lixo do p95. A largura dele pode ser maior que
  // `w` — por isso o indice usa `passo`, e a parte usada e limpa a cada quadro.
  if (!imagem || imagem.width < w || imagem.height < h) {
    imagem = tc.createImageData(Math.max(w, imagem?.width ?? 0), Math.max(h, imagem?.height ?? 0))
  }
  const d = imagem.data
  const passo = imagem.width
  for (let yy = 0; yy < h; yy++) d.fill(0, yy * passo * 4, (yy * passo + w) * 4)
  const cores = coresDaPele(pele)
  const rolar = ms * 0.03
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const q = calor[yy * w + xx]
      if (q <= 0.02) continue
      // Coordenada de MUNDO no ruido: a textura nao "anda" junto com o retangulo.
      const wx = xx + x0, wy = yy + y0
      const n = ruido(wx * 0.28, (wy + rolar) * 0.28) * 0.65 + ruido(wx * 0.6, (wy + rolar * 1.6) * 0.6) * 0.35
      const v = q * 1.15 - n * 0.38
      let f = -1
      for (let k = LIMIARES.length - 1; k >= 0; k--) if (v > LIMIARES[k]) { f = k; break }
      if (f < 0) continue
      const i = (yy * passo + xx) * 4
      d[i] = cores[f][0]; d[i + 1] = cores[f][1]; d[i + 2] = cores[f][2]; d[i + 3] = 255
    }
  }
  tc.putImageData(imagem, 0, 0, 0, 0, w, h)
  const suave = ctx.imageSmoothingEnabled
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tela, 0, 0, w, h, x0, y0, w, h)
  ctx.imageSmoothingEnabled = suave
}
