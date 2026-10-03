// GELO (ICE) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Ice Shard/Icicle Spear/Ice Ball; T2 Aurora Beam/Ice
// Fang/Ice Punch/Freeze-Dry/Avalanche/Frost Breath; T3 Ice Beam/Icicle Crash;
// T4 so por critico. Area: A1 Powder Snow/Icy Wind, A2 a Explosao Elemental do
// nivel 50 (70), A3 Blizzard.
//
// PERSONALIDADE (o que separa da agua sem olhar a cor): agua escorre e
// espirra. Gelo e AGUA PARADA E DURA:
//   - CRISTAL: lascas hexagonais e pontas facetadas (a particula `cristal`);
//   - CONGELA: o alvo ganha uma crosta de cristais que cresce por cima, segura
//     e QUEBRA em lascas;
//   - NEVE: pontinhos que caem devagar, balancando — o rescaldo do tipo;
//   - frio e claro: nucleo quase branco, contorno azul-escuro.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// riscos no que voa, e o rescaldo e neve caindo e crosta quebrando.
//
//   T1 Ice Shard     tres lascas de gelo em rajada que cravam e quebram.
//   T2 Aurora Beam   feixe ondulado em faixas de cor, que congela a ponta.
//   T3 Ice Beam      feixe reto e frio; o alvo congela numa crosta que quebra.
//   T4 Icicle Crash  pingentes enormes caem do alto e estilhacam no alvo.
//   A1 Icy Wind      vento de neve rasteiro cruza a area em faixas.
//   A2 (Expl. Elem.) cristais rompem do chao em cada ponto do interior.
//   A3 Blizzard      nevasca: neve em diagonal cobrindo tudo, e cada ponto
//                    congela numa crosta que quebra.
import { afinado, comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, CIMA, em, encolhe, escalaDaArea, fila, interior, sortear, TAU } from './comum'

const BRANCO = '#ffffff'

/** Cristal: losango longo facetado (ponta de gelo). `a` = pra onde aponta. */
interface Cristal { x: number; y: number; a: number; c: number; w?: number }

function cristais(ctx: CanvasRenderingContext2D, lista: readonly Cristal[], pele: Pele): void {
  const forma = (g: Cristal, k: number) => {
    const L = g.c * k, W = g.c * (g.w ?? 0.24) * k, ux = Math.cos(g.a), uy = Math.sin(g.a), nx = -uy, ny = ux
    ctx.moveTo(g.x + ux * L * 0.55, g.y + uy * L * 0.55)
    ctx.lineTo(g.x + ux * L * 0.15 + nx * W, g.y + uy * L * 0.15 + ny * W)
    ctx.lineTo(g.x - ux * L * 0.45 + nx * W * 0.6, g.y - uy * L * 0.45 + ny * W * 0.6)
    ctx.lineTo(g.x - ux * L * 0.45 - nx * W * 0.6, g.y - uy * L * 0.45 - ny * W * 0.6)
    ctx.lineTo(g.x + ux * L * 0.15 - nx * W, g.y + uy * L * 0.15 - ny * W)
    ctx.closePath()
  }
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.base, 1], [pele.meio, 0.7]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const g of lista) if (g.c > 1) forma(g, k)
    ctx.fill()
  }
  // Faceta clara: meia ponta de um lado so (luz batendo).
  ctx.fillStyle = pele.nucleo; ctx.beginPath()
  for (const g of lista) {
    if (g.c < 3) continue
    const L = g.c, W = g.c * (g.w ?? 0.24), ux = Math.cos(g.a), uy = Math.sin(g.a), nx = -uy, ny = ux
    ctx.moveTo(g.x + ux * L * 0.5, g.y + uy * L * 0.5)
    ctx.lineTo(g.x + ux * L * 0.12 + nx * W * 0.7, g.y + uy * L * 0.12 + ny * W * 0.7)
    ctx.lineTo(g.x - ux * L * 0.3, g.y - uy * L * 0.3)
    ctx.closePath()
  }
  ctx.fill()
}

/** Crosta de gelo: leque de cristais grudados num ponto, que cresce e depois quebra. */
function crosta(p: Ponto, t: number, sem: readonly number[], k: number, quebra: number): Cristal[] {
  const out: Cristal[] = []
  if (t < 0 || t > 1) return out
  const n = sem.length / 2
  for (let i = 0; i < n; i++) {
    const a = CIMA + (sem[i * 2] - 0.5) * 3.4
    const cresce = saida(limitar(t / quebra))
    const voa = t > quebra ? (t - quebra) / (1 - quebra) : 0
    const L = em(sem[i * 2 + 1], 7, 13) * k * cresce * encolhe(voa, 0.6)
    const d = L * 0.4 + voa * 18 * k
    out.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d + 14 * k * voa * voa, a: a + voa * 6 * (sem[i * 2] - 0.5), c: L })
  }
  return out
}

/** Neve: pontinhos brancos que caem balancando. `vento` empurra em x. */
function neve(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.base, 1.4], [BRANCO, 1]] as const) {
    ctx.fillStyle = cor
    for (const p of pts) {
      const r = Math.max(1, Math.round(p.r * k))
      if (p.r < 0.4) continue
      ctx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), r, r)
    }
  }
}

/** Flocos que caem de `p` (rescaldo). */
function flocos(p: Ponto, t0: number, ms: number, sem: readonly number[], k = 1, vento = 0): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i * 3 + 2 < sem.length; i++) {
    const t = (ms - t0 - i * 45) / 520
    if (t < 0 || t > 1) continue
    out.push({
      x: p.x + (sem[i * 3] - 0.5) * 30 * k + Math.sin(t * 6 + i) * 2.5 + vento * t,
      y: p.y - 16 * k + em(sem[i * 3 + 1], -6, 4) * k + 22 * k * t,
      r: em(sem[i * 3 + 2], 1, 1.8) * encolhe(t, 0.3),
    })
  }
  return out
}

/** Feixe de gelo: faixa reta (ou ondulada) de `a` ate `b`, em camadas de cor. */
function feixe(ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, u0: number, u1: number, w: number, ondas: number, ms: number, camadas: readonly (readonly [string, number])[]): void {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d
  for (const [cor, k] of camadas) {
    const ww = w * k
    if (ww < 0.4) continue
    ctx.fillStyle = cor
    ctx.beginPath()
    const n = 20
    for (let i = 0; i <= n; i++) {
      const u = u0 + (u1 - u0) * (i / n), o = Math.sin(u * d * 0.25 - ms * 0.03) * ondas
      const x = a.x + dx * u + nx * (o + ww), y = a.y + dy * u + ny * (o + ww)
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
    }
    for (let i = n; i >= 0; i--) {
      const u = u0 + (u1 - u0) * (i / n), o = Math.sin(u * d * 0.25 - ms * 0.03) * ondas
      ctx.lineTo(a.x + dx * u + nx * (o - ww), a.y + dy * u + ny * (o - ww))
    }
    ctx.closePath()
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// T1 — ICE SHARD
// ---------------------------------------------------------------------------

const SHARD_SAIDAS = [70, 150, 230] as const
const SHARD_VOO = 110

function iceShard(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const desvios = SHARD_SAIDAS.map(() => sortear(rng, 2))
  const semQuebra = SHARD_SAIDAS.map(() => sortear(rng, 4 * 2))
  const semFlocos = sortear(rng, 6 * 3)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 2 }
  const lista: Cristal[] = []
  ctx.fillStyle = BRANCO
  ctx.beginPath()
  SHARD_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 10, y: alvo.y + (desvios[i][1] - 0.5) * 10 }
    const a = Math.atan2(fim.y - b.y, fim.x - b.x)
    const u = (ms - sai) / SHARD_VOO
    if (u >= 0 && u < 1) {
      const x = b.x + (fim.x - b.x) * u, y = b.y + (fim.y - b.y) * u
      lista.push({ x, y, a, c: 9 })
      afinado(ctx, x - Math.cos(a) * 5, y - Math.sin(a) * 5, x - Math.cos(a) * 15, y - Math.sin(a) * 15, 1.4)
    }
    // Crava e quebra em quatro lascas.
    lista.push(...crosta(fim, (ms - sai - SHARD_VOO) / 380, semQuebra[i], 0.6, 0.3))
  })
  ctx.fill()
  cristais(ctx, lista, pele)
  neve(ctx, flocos(alvo, SHARD_SAIDAS[2] + SHARD_VOO + 60, ms, semFlocos), pele)
}

// ---------------------------------------------------------------------------
// T2 — AURORA BEAM
// ---------------------------------------------------------------------------

const AURORA_SAI = 120
const AURORA_CHEGA = 260
const AURORA_FIM = 600

function auroraBeam(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCrosta = sortear(rng, 6 * 2)
  const semFlocos = sortear(rng, 6 * 3)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 4 }
  if (ms >= AURORA_SAI && ms < AURORA_FIM) {
    const u1 = saida(limitar((ms - AURORA_SAI) / (AURORA_CHEGA - AURORA_SAI)))
    const u0 = entrada(limitar((ms - AURORA_FIM + 140) / 140))
    // Faixas de aurora: as cores da pele + o branco, ondulando juntas.
    feixe(ctx, b, alvo, u0, u1, 4, 2.5, ms, [[pele.contorno, 1.3], [pele.base, 1], [pele.estrela, 0.7], [pele.meio, 0.45], [BRANCO, 0.18]])
  }
  cristais(ctx, crosta({ x: alvo.x, y: alvo.y + 2 }, (ms - AURORA_CHEGA) / 640, semCrosta, 0.9, 0.55), pele)
  neve(ctx, flocos(alvo, AURORA_CHEGA + 200, ms, semFlocos), pele)
  if (ms >= AURORA_CHEGA && ms < AURORA_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 13, (ms - AURORA_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — ICE BEAM
// ---------------------------------------------------------------------------

const BEAM_SAI = 140
const BEAM_CHEGA = 240
const BEAM_FIM = 560
const BEAM_QUEBRA = 900

function iceBeam(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCrosta = sortear(rng, 9 * 2)
  const semFlocos = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 4 }
  if (ms >= BEAM_SAI && ms < BEAM_FIM) {
    const u1 = saida(limitar((ms - BEAM_SAI) / (BEAM_CHEGA - BEAM_SAI)))
    const u0 = entrada(limitar((ms - BEAM_FIM + 120) / 120))
    feixe(ctx, b, alvo, u0, u1, 3.6, 0, ms, [[pele.contorno, 1.35], [pele.base, 1], [pele.meio, 0.65], [BRANCO, 0.3]])
    // Cristais pequenos brotando ao longo do feixe (o ar congelando).
    const lista: Cristal[] = []
    for (let i = 1; i < 5; i++) {
      const u = i / 5
      if (u > u1 || u < u0) continue
      lista.push({ x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u, a: (i % 2 ? CIMA : Math.PI / 2) + 0.3, c: 6 })
    }
    cristais(ctx, lista, pele)
  }
  // O alvo congela: crosta grande que cresce, segura e quebra.
  const t = (ms - BEAM_CHEGA) / (BEAM_QUEBRA - BEAM_CHEGA + 380)
  cristais(ctx, crosta({ x: alvo.x, y: alvo.y + 4 }, t, semCrosta, 1.3, (BEAM_QUEBRA - BEAM_CHEGA) / (BEAM_QUEBRA - BEAM_CHEGA + 380)), pele)
  neve(ctx, flocos(alvo, BEAM_QUEBRA, ms, semFlocos, 1.2), pele)
  if (ms >= BEAM_CHEGA && ms < BEAM_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - BEAM_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — ICICLE CRASH (critico)
// ---------------------------------------------------------------------------

const PINGENTES = [180, 300, 420] as const
const PINGENTE_QUEDA = 180

function icicleCrash(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const desvios = PINGENTES.map(() => sortear(rng, 1))
  const semQuebras = PINGENTES.map(() => sortear(rng, 6 * 2))
  const semFlocos = sortear(rng, 10 * 3)
  const semEstrela = sortear(rng, 9)
  const lista: Cristal[] = []
  ctx.fillStyle = BRANCO
  ctx.beginPath()
  PINGENTES.forEach((t0, i) => {
    const p = { x: alvo.x + (desvios[i][0] - 0.5) * 14, y: alvo.y - 4 }
    const L = i === 2 ? 30 : 20
    const u = (ms - t0) / PINGENTE_QUEDA
    // Pingentes enormes caem de ponta pra baixo...
    if (u >= 0 && u < 1) {
      const y = p.y - L * 0.4 - 80 * (1 - entrada(u))
      lista.push({ x: p.x, y, a: Math.PI / 2, c: L, w: 0.3 })
      afinado(ctx, p.x, y - L * 0.5, p.x, y - L * 0.5 - 18, 2)
    }
    // ...e estilhacam numa coroa de lascas.
    lista.push(...crosta({ x: p.x, y: p.y + 8 }, (ms - t0 - PINGENTE_QUEDA) / 420, semQuebras[i], i === 2 ? 1.5 : 1, 0.12))
  })
  ctx.fill()
  cristais(ctx, lista, pele)
  neve(ctx, flocos(alvo, PINGENTES[2] + PINGENTE_QUEDA + 100, ms, semFlocos, 1.4), pele)
  const bate = PINGENTES[2] + PINGENTE_QUEDA
  if (ms >= bate && ms < bate + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - bate) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A1 — ICY WIND: vento de neve rasteiro em faixas que cruzam a area.
function icyWind(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semFaixas = sortear(rng, 6 * 3)
  const semNeve = sortear(rng, 40 * 2)
  const pontos = interior(centro, raio, 9, rng() * TAU)
  const semCrosta = pontos.map(() => sortear(rng, 3 * 2))
  // Faixas de vento: tracos longos e finos correndo da esquerda pra direita.
  ctx.fillStyle = pele.meio
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const t = (ms - 60 - semFaixas[i * 3] * 300) / 500
    if (t < 0 || t > 1) continue
    const y = centro.y + 12 + (semFaixas[i * 3 + 1] - 0.5) * raio * 0.8
    const cab = centro.x - raio + raio * 2.4 * saida(t), cauda = cab - em(semFaixas[i * 3 + 2], 40, 80) * k * 0.6
    afinado(ctx, cab, y, cauda, y, 3 * k * 0.6 * encolhe(t, 0.3))
  }
  ctx.fill()
  // Neve sendo varrida junto.
  const pts: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 40; i++) {
    const t = (ms - 40 - semNeve[i * 2] * 500) / 600
    if (t < 0 || t > 1) continue
    pts.push({ x: centro.x - raio + raio * 2.2 * t, y: centro.y + 12 + (semNeve[i * 2 + 1] - 0.5) * raio * 0.9 + Math.sin(t * 9 + i) * 3, r: 1.4 })
  }
  neve(ctx, pts, pele)
  // Crosta pequena em cada ponto quando o vento passa.
  const lista: Cristal[] = []
  pontos.forEach(({ p }, i) => {
    const passa = 200 + ((p.x - (centro.x - raio)) / (raio * 2)) * 400
    lista.push(...crosta(p, (ms - passa) / 520, semCrosta[i], k * 0.5, 0.55))
  })
  cristais(ctx, lista, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): cristais rompem do chao em cada ponto.
function cristaisDoChao(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semCrosta = pontos.map(() => sortear(rng, 5 * 2))
  const semFlocos = pontos.map(() => sortear(rng, 2 * 3))
  const lista: Cristal[] = []
  const pts: { x: number; y: number; r: number }[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(100, 500, d, raio)
    lista.push(...crosta(p, (ms - t0) / 700, semCrosta[i], k * 0.75, 0.6))
    pts.push(...flocos(p, t0 + 400, ms, semFlocos[i], k * 0.6))
  })
  cristais(ctx, lista, pele)
  neve(ctx, pts, pele)
}

// A3 — BLIZZARD: nevasca em diagonal sobre tudo e o interior congelando.
function blizzard(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semNeve = sortear(rng, 70 * 3)
  const pontos = interior(centro, raio, 14, rng() * TAU)
  const semCrosta = pontos.map(() => sortear(rng, 5 * 2))
  const semFaixas = sortear(rng, 8 * 2)
  // Faixas de vento diagonais: a nevasca tem direcao.
  ctx.fillStyle = pele.meio
  ctx.beginPath()
  for (let i = 0; i < 8; i++) {
    const t = ((ms + semFaixas[i * 2] * 600) % 600) / 600
    if (ms > 1500) continue
    const x0 = centro.x - raio + (semFaixas[i * 2 + 1]) * raio * 2 - 60 + 140 * t, y0 = centro.y - 40 + 80 * t
    afinado(ctx, x0, y0, x0 - 34, y0 - 20, 2.4 * k * 0.6)
  }
  ctx.fill()
  // Neve densa em diagonal, nascendo o tempo todo ate perto do fim.
  const pts: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 70; i++) {
    const ciclo = 520, fase = semNeve[i * 3] * ciclo
    const t = ((ms + fase) % ciclo) / ciclo
    if (ms + fase < ciclo * 0.2 || ms > 1500) continue
    const x = centro.x - raio * 1.1 + semNeve[i * 3 + 1] * raio * 2.2 + 50 * t
    const y = centro.y - 50 + semNeve[i * 3 + 2] * (raio * 0.45 + 70) + 30 * t
    pts.push({ x, y, r: 1.6 })
  }
  neve(ctx, pts, pele)
  const lista: Cristal[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(300, 700, d, raio)
    lista.push(...crosta(p, (ms - t0) / 800, semCrosta[i], k * 0.8, 0.65))
  })
  cristais(ctx, lista, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_GELO = {
  single: { 1: 'ice_shard', 2: 'aurora_beam', 3: 'ice_beam', 4: 'icicle_crash' },
  area: { 1: 'icy_wind', 2: 'aoe50_ice', 3: 'blizzard' },
} as const

export const GELO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: iceShard, duracao: { 1: 1100 }, alcance: 30, impactos: { 1: SHARD_SAIDAS.map(s => s + SHARD_VOO) } },
  2: { desenhar: auroraBeam, duracao: { 2: 1200 }, alcance: 34, impactos: { 2: [AURORA_CHEGA] } },
  3: { desenhar: iceBeam, duracao: { 3: 1700 }, alcance: 40, impactos: { 3: [BEAM_CHEGA] } },
  4: { desenhar: icicleCrash, duracao: { 4: 1500 }, alcance: 90, margem: { cima: 132, baixo: 90, lados: 90 }, impactos: { 4: [PINGENTES[0] + PINGENTE_QUEDA, PINGENTES[2] + PINGENTE_QUEDA] } },
}, false)

export const GELO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: icyWind, duracao: { 1: 1300 }, alcance: 30, margem: { cima: 20, baixo: 20, lados: 110 }, impactos: { 1: [300] } },
  2: { desenhar: cristaisDoChao, duracao: { 2: 1500 }, alcance: 50, impactos: { 2: [300] } },
  3: { desenhar: blizzard, duracao: { 3: 1800 }, alcance: 90, margem: { cima: 30, baixo: 42, lados: 79 }, impactos: { 3: [500, 1000] } },
}, true)

