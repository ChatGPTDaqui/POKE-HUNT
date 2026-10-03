// INSETO (BUG) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Pin Missile/Fury Cutter/Twineedle/Fell Stinger; T2
// Signal Beam/Bug Bite/Silver Wind/U-turn/Steamroller; T3 X-Scissor/Bug
// Buzz/Leech Life; T4 Megahorn. Area: A1 Struggle Bug, A2 a Explosao Elemental
// do nivel 50 (70), A3 so por critico.
//
// PERSONALIDADE (o que separa da grama sem olhar a cor): nao e planta, e BICHO.
//   - AGULHA/FERRAO: tracos finos e duros que ESPETAM e ficam cravados;
//   - LAMINA de quitina: crescentes que cortam em X (mandibula, tesoura);
//   - ZUMBIDO: aneis em zigue-zague, a vibracao das asas;
//   - ENXAME: bichinhos com asa batendo que vao e voltam em zigue-zague.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// riscos no que voa, e o rescaldo e o enxame se dispersando.
//
//   T1 Pin Missile   cinco agulhas em rajada; cada uma crava e cai.
//   T2 Signal Beam   feixe ondulado que pisca em duas cores e estoura.
//   T3 X-Scissor     duas laminas cruzam o alvo em X; faisca no cruzamento.
//   T4 Megahorn      chifre enorme avanca com riscos e crava; cunhas estouram.
//   A1 Struggle Bug  zumbido: aneis em zigue-zague do centro; o interior treme.
//   A2 (Expl. Elem.) um enxame sai de quem lanca e pica cada ponto do interior.
//   A3 (critico)     Bug Buzz: tres aneis de zumbido grandes cobrem a area e o
//                    enxame fica no interior inteiro.
import { afinado, comImpacto } from '../acabamento'
import { crescente, entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, em, encolhe, escalaDaArea, fila, interior, sortear, TAU } from './comum'

/** Agulha: losango longo e fino, ponta clara. `a` = pra onde aponta. */
function agulhas(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; a: number; c: number }[], pele: Pele): void {
  for (const [cor, k, w] of [[pele.contorno, 1.25, 1.9], [pele.base, 1, 1.2], [pele.nucleo, 0.55, 0.6]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const g of lista) {
      if (g.c < 1) continue
      const L = g.c * k, ux = Math.cos(g.a), uy = Math.sin(g.a), nx = -uy * w, ny = ux * w
      ctx.moveTo(g.x + ux * L * 0.5, g.y + uy * L * 0.5)
      ctx.lineTo(g.x + nx, g.y + ny)
      ctx.lineTo(g.x - ux * L * 0.5, g.y - uy * L * 0.5)
      ctx.lineTo(g.x - nx, g.y - ny)
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Anel de zumbido: elipse em zigue-zague (n dentes), espessura `w`. */
function zumbido(ctx: CanvasRenderingContext2D, aneis: readonly { x: number; y: number; r: number; w: number; fase: number }[], pele: Pele): void {
  for (const [cor, extra] of [[pele.contorno, 1.4], [pele.meio, 0]] as const) {
    ctx.strokeStyle = cor
    for (const a of aneis) {
      if (a.r < 2 || a.w < 0.3) continue
      ctx.lineWidth = a.w + extra
      ctx.beginPath()
      // Dente a cada ~8 un: mais denso virava serra e custava caro em area.
      const n = Math.max(12, Math.round(a.r * 0.4) * 2)
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * TAU + a.fase
        const r = a.r * (i % 2 ? 0.9 : 1.04)
        const x = a.x + Math.cos(ang) * r, y = a.y + Math.sin(ang) * r * 0.45
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }
}

/** Bichinho do enxame: corpo + duas asas que batem (pisca a cada 40 ms). */
function bichos(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; s: number }[], ms: number, pele: Pele): void {
  const bate = Math.floor(ms / 40) % 2 === 0
  ctx.fillStyle = pele.nucleo
  ctx.beginPath()
  for (const b of lista) {
    if (b.s < 0.3) continue
    const wy = bate ? -1.8 : -0.6
    ctx.moveTo(b.x - 0.3, b.y); ctx.ellipse(b.x - 1.3 * b.s, b.y + wy * b.s * 0.6, 1.4 * b.s, 0.8 * b.s, -0.5, 0, TAU)
    ctx.moveTo(b.x + 2.6 * b.s, b.y); ctx.ellipse(b.x + 1.3 * b.s, b.y + wy * b.s * 0.6, 1.4 * b.s, 0.8 * b.s, 0.5, 0, TAU)
  }
  ctx.fill()
  for (const [cor, r] of [[pele.contorno, 1.3], [pele.base, 0.85]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const b of lista) { if (b.s < 0.3) continue; ctx.moveTo(b.x + r * b.s, b.y); ctx.arc(b.x, b.y, r * b.s, 0, TAU) }
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// T1 — PIN MISSILE
// ---------------------------------------------------------------------------

const PIN_SAIDAS = [80, 140, 200, 260, 320] as const
const PIN_VOO = 110

function pinMissile(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const desvios = PIN_SAIDAS.map(() => sortear(rng, 3))
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 2 }
  const lista: { x: number; y: number; a: number; c: number }[] = []
  ctx.fillStyle = pele.nucleo
  ctx.beginPath()
  PIN_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 12, y: alvo.y + (desvios[i][1] - 0.5) * 12 }
    const a = Math.atan2(fim.y - b.y, fim.x - b.x)
    const u = (ms - sai) / PIN_VOO
    if (u >= 0 && u < 1) {
      const x = b.x + (fim.x - b.x) * u, y = b.y + (fim.y - b.y) * u
      lista.push({ x, y, a, c: 9 })
      // Risco atras da agulha: ela e rapida.
      afinado(ctx, x - Math.cos(a) * 4, y - Math.sin(a) * 4, x - Math.cos(a) * 14, y - Math.sin(a) * 14, 1.4)
    } else if (u >= 1) {
      // Cravada: fica 140 ms tremendo, depois cai girando.
      const crava = ms - sai - PIN_VOO
      const cai = Math.max(0, crava - 140)
      if (cai < 260) {
        const treme = crava < 140 ? Math.sin(crava * 0.8) * 0.15 : 0
        lista.push({ x: fim.x - Math.cos(a) * 3 + cai * 0.01, y: fim.y - Math.sin(a) * 3 + 0.0006 * cai * cai, a: a + treme + cai * 0.01 * (desvios[i][2] - 0.5) * 3, c: 9 * encolhe(cai / 260) })
      }
    }
  })
  ctx.fill()
  agulhas(ctx, lista, pele)
}

// ---------------------------------------------------------------------------
// T2 — SIGNAL BEAM
// ---------------------------------------------------------------------------

const SIGNAL_SAI = 120
const SIGNAL_CHEGA = 240
const SIGNAL_FIM = 560

function signalBeam(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 4 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  if (ms >= SIGNAL_SAI && ms <= SIGNAL_FIM) {
    const u1 = saida(limitar((ms - SIGNAL_SAI) / (SIGNAL_CHEGA - SIGNAL_SAI)))
    const u0 = entrada(limitar((ms - SIGNAL_FIM + 120) / 120))
    // Sinal: onda que corre pelo feixe; a cor PISCA a cada 50 ms.
    const pisca = Math.floor(ms / 50) % 2 === 0
    const pts: [number, number][] = []
    for (let i = 0; i <= 24; i++) {
      const u = u0 + (u1 - u0) * (i / 24)
      const off = Math.sin(u * d * 0.45 - ms * 0.04) * 3
      pts.push([b.x + dx * u - uy * off, b.y + dy * u + ux * off])
    }
    for (const [cor, w] of [[pele.contorno, 4.4], [pisca ? pele.meio : pele.estrela, 3], [pele.nucleo, 1.2]] as const) {
      ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineJoin = 'round'
      ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke()
    }
  }
  if (ms >= SIGNAL_CHEGA && ms < SIGNAL_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 13, (ms - SIGNAL_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — X-SCISSOR
// ---------------------------------------------------------------------------

const X_PRIMEIRO = 220
const X_SEGUNDO = 300
const X_CORTE = 260

function xScissor(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  const semFaiscas = sortear(rng, 10 * 2)
  // Duas laminas em crescente, uma de cima-esq pra baixo-dir e outra cruzando.
  for (const [t0, incl] of [[X_PRIMEIRO - 120, 0.8], [X_SEGUNDO - 120, -0.8]] as const) {
    const p = (ms - t0) / 300
    if (p >= 0 && p <= 1) crescente(ctx, alvo, 16, -1.6, 1.6, 4.2, p, incl, pele, 0.42)
  }
  // Faisca no cruzamento: o metal da mandibula raspando.
  const tf = (ms - X_CORTE) / 320
  if (tf >= 0 && tf <= 1) {
    ctx.fillStyle = tf < 0.4 ? pele.nucleo : pele.meio
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = semFaiscas[i * 2] * TAU, dd = em(semFaiscas[i * 2 + 1], 8, 20) * saida(tf)
      const x = alvo.x + Math.cos(a) * dd, y = alvo.y + Math.sin(a) * dd * 0.8
      afinado(ctx, x, y, x - Math.cos(a) * 4 * (1 - tf), y - Math.sin(a) * 4 * (1 - tf), 1.2)
    }
    ctx.fill()
  }
  if (ms >= X_CORTE && ms < X_CORTE + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - X_CORTE) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — MEGAHORN
// ---------------------------------------------------------------------------

const HORN_CARGA = 320
const HORN_CRAVA = 480

function megahorn(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semRiscos = sortear(rng, 8 * 2)
  const semEstrela = sortear(rng, 9)
  const semCunhas = sortear(rng, 8 * 2)
  const dir = Math.atan2(alvo.y - origem.y, alvo.x - origem.x)
  const ux = Math.cos(dir), uy = Math.sin(dir), nx = -uy, ny = ux
  // O chifre: triangulo enorme que recua (carga) e avanca ate cravar.
  const recua = saida(limitar(ms / HORN_CARGA)) * (1 - limitar((ms - HORN_CARGA) / 60))
  const avanca = saida(limitar((ms - HORN_CARGA) / (HORN_CRAVA - HORN_CARGA)))
  const some = encolhe(limitar((ms - HORN_CRAVA - 120) / 260), 1)
  const d = Math.hypot(alvo.x - origem.x, alvo.y - origem.y)
  const base = { x: origem.x + ux * (6 - 6 * recua + (d - 22) * avanca), y: origem.y - 4 + uy * (6 - 6 * recua + (d - 22) * avanca) }
  if (some > 0 && ms < HORN_CRAVA + 380) {
    const L = 22 * some, W = 7 * some
    for (const [cor, k] of [[pele.contorno, 1.2], [pele.base, 1], [pele.meio, 0.62], [pele.nucleo, 0.3]] as const) {
      ctx.fillStyle = cor
      ctx.beginPath()
      // Curvo pra cima como um chifre de besouro.
      ctx.moveTo(base.x + nx * W * k, base.y + ny * W * k)
      ctx.quadraticCurveTo(base.x + ux * L * 0.6 + nx * W * 0.3, base.y + uy * L * 0.6 + ny * W * 0.3 - 4, base.x + ux * L * (0.55 + 0.45 * k) , base.y + uy * L * (0.55 + 0.45 * k) - 5)
      ctx.quadraticCurveTo(base.x + ux * L * 0.5 - nx * W * 0.4, base.y + uy * L * 0.5 - ny * W * 0.4, base.x - nx * W * k, base.y - ny * W * k)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Riscos de velocidade durante o avanco.
  if (ms >= HORN_CARGA && ms < HORN_CRAVA + 60) {
    ctx.fillStyle = pele.nucleo
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const off = (semRiscos[i * 2] - 0.5) * 22, comp = em(semRiscos[i * 2 + 1], 12, 22)
      const x = base.x - ux * 4 + nx * off, y = base.y - uy * 4 + ny * off
      afinado(ctx, x, y, x - ux * comp, y - uy * comp, 1.8)
    }
    ctx.fill()
  }
  // Cunhas de quitina estouram pra tras do alvo no impacto.
  const tc = (ms - HORN_CRAVA) / 300
  if (tc >= 0 && tc <= 1) {
    for (const [cor, k] of [[pele.contorno, 1.25], [pele.meio, 1], [pele.nucleo, 0.5]] as const) {
      ctx.fillStyle = cor
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = dir + em(semCunhas[i * 2], -1.2, 1.2), dd = em(semCunhas[i * 2 + 1], 12, 26) * saida(tc)
        const x = alvo.x + Math.cos(a) * dd, y = alvo.y + Math.sin(a) * dd
        const L = 7 * k * (1 - tc * 0.7), w = 2.2 * k
        ctx.moveTo(x + Math.cos(a) * L, y + Math.sin(a) * L)
        ctx.lineTo(x - Math.sin(a) * w, y + Math.cos(a) * w)
        ctx.lineTo(x - Math.cos(a) * L * 0.3, y - Math.sin(a) * L * 0.3)
        ctx.lineTo(x + Math.sin(a) * w, y - Math.cos(a) * w)
        ctx.closePath()
      }
      ctx.fill()
    }
  }
  if (ms >= HORN_CRAVA && ms < HORN_CRAVA + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - HORN_CRAVA) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

/** Enxame: bichinhos que saem de `de`, vao em zigue-zague ate `ate` e voltam pro alto. */
function enxameEm(de: Ponto, ate: Ponto, idade: number, vida: number, s: number): { x: number; y: number; s: number } | null {
  const t = idade / vida
  if (t < 0 || t > 1) return null
  const vai = saida(limitar(t / 0.5))
  const zig = Math.sin(t * 22 + s * 9) * 4
  const sobe = t > 0.55 ? (t - 0.55) * 60 : 0
  return { x: de.x + (ate.x - de.x) * vai + zig, y: de.y - 8 + (ate.y - 8 - (de.y - 8)) * vai - sobe, s: encolhe(t, 0.3) }
}

// A1 — STRUGGLE BUG: zumbido em aneis + o interior tremendo.
const STRUGGLE_ONDAS = [80, 260] as const

function struggleBug(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 9, rng() * TAU)
  const aneis: { x: number; y: number; r: number; w: number; fase: number }[] = []
  STRUGGLE_ONDAS.forEach((t0, i) => {
    const t = (ms - t0) / 520
    if (t >= 0 && t <= 1) aneis.push({ x: centro.x, y: centro.y + 12, r: raio * saida(t), w: 1.6 * k * 0.6 * (1 - t), fase: ms * 0.004 + i })
  })
  // Cada ponto treme quando o zumbido passa: um anelzinho vibrando no lugar.
  pontos.forEach(({ p, d }) => {
    const t = (ms - chegaEm(STRUGGLE_ONDAS[0], 520, d, raio)) / 300
    if (t >= 0 && t <= 1) aneis.push({ x: p.x, y: p.y - 6, r: 7 * k * 0.5 * saida(t), w: 1.6 * (1 - t), fase: ms * 0.01 })
  })
  zumbido(ctx, aneis, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): enxame que pica cada ponto do interior.
const ENXAME_SAI = 80

function enxame(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semBichos = sortear(rng, 12 * 3)
  const lista: { x: number; y: number; s: number }[] = []
  const picadas: { x: number; y: number; a: number; c: number }[] = []
  pontos.forEach(({ p }, i) => {
    for (let j = 0; j < 3; j++) {
      const s = semBichos[i * 3 + j]
      const b = enxameEm(origem, p, ms - ENXAME_SAI - i * 30 - j * 25, 900, s)
      if (b) lista.push({ x: b.x, y: b.y, s: b.s * 1.3 * Math.min(k, 1.6) })
    }
    // A picada: um ferrao curto cravado quando o enxame chega.
    const tp = (ms - ENXAME_SAI - i * 30 - 450) / 300
    if (tp >= 0 && tp <= 1) picadas.push({ x: p.x, y: p.y - 8, a: 1.2, c: 7 * encolhe(tp, 0.5) })
  })
  agulhas(ctx, picadas, pele)
  bichos(ctx, lista, ms, pele)
}

// A3 — BUG BUZZ (critico): tres aneis grandes de zumbido + enxame no interior todo.
const BUZZ_ONDAS = [100, 420, 740] as const

function bugBuzz(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 16, rng() * TAU)
  const semBichos = sortear(rng, 16 * 2)
  const aneis: { x: number; y: number; r: number; w: number; fase: number }[] = []
  BUZZ_ONDAS.forEach((t0, i) => {
    const t = (ms - t0) / 620
    if (t >= 0 && t <= 1) aneis.push({ x: centro.x, y: centro.y + 12, r: raio * saida(t), w: 3 * k * 0.6 * (1 - t * 0.7), fase: ms * 0.003 + i })
  })
  const lista: { x: number; y: number; s: number }[] = []
  pontos.forEach(({ p }, i) => {
    for (let j = 0; j < 2; j++) {
      const b = enxameEm(origem, p, ms - 120 - i * 25 - j * 40, 1100, semBichos[i * 2 + j])
      if (b) lista.push({ x: b.x, y: b.y, s: b.s * 1.3 * Math.min(k, 1.6) })
    }
  })
  zumbido(ctx, aneis, pele)
  bichos(ctx, lista, ms, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_INSETO = {
  single: { 1: 'pin_missile', 2: 'signal_beam', 3: 'x_scissor', 4: 'megahorn' },
  area: { 1: 'struggle_bug', 2: 'aoe50_bug', 3: 'aoe50_bug' },
} as const

export const INSETO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: pinMissile, duracao: { 1: 1000 }, alcance: 30, margem: { cima: 30, baixo: 45, lados: 30 }, impactos: { 1: PIN_SAIDAS.map(s => s + PIN_VOO) } },
  2: { desenhar: signalBeam, duracao: { 2: 900 }, alcance: 34, impactos: { 2: [SIGNAL_CHEGA] } },
  3: { desenhar: xScissor, duracao: { 3: 1000 }, alcance: 30, margem: { cima: 30, baixo: 43, lados: 40 }, impactos: { 3: [X_CORTE] } },
  4: { desenhar: megahorn, duracao: { 4: 1300 }, alcance: 44, margem: { cima: 44, baixo: 64, lados: 44 }, impactos: { 4: [HORN_CRAVA] } },
}, false)

export const INSETO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: struggleBug, duracao: { 1: 1100 }, alcance: 30, impactos: { 1: [STRUGGLE_ONDAS[0] + 200] } },
  2: { desenhar: enxame, duracao: { 2: 1500 }, alcance: 49, margem: { cima: 29, baixo: 20, lados: 20 }, impactos: { 2: [ENXAME_SAI + 450] } },
  3: { desenhar: bugBuzz, duracao: { 3: 1700 }, alcance: 40, impactos: { 3: BUZZ_ONDAS.map(t => t + 200) } },
}, true)
