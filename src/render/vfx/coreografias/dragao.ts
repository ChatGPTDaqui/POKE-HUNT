// DRAGAO (DRAGON) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Dual Chop; T2 Dragon Breath/Dragon Tail; T3 Dragon
// Pulse/Dragon Claw; T4 Outrage/Dragon Rush. Area: A1 Twister, A2 a Explosao
// Elemental do nivel 50 (70), A3 so por critico.
//
// PERSONALIDADE (o que separa do fogo e do psiquico sem olhar a cor): dragao e
// FORCA ANCESTRAL — fera, nao feitico:
//   - CHAMA DE DRAGAO: a mesma textura de calor do fogo, nas cores do dragao
//     (azul-violeta) — o sopro e fogo, mas de outra criatura;
//   - ESCAMA: lascas em losango que voam e giram (a particula `escama`);
//   - SERPENTE: o que viaja ondula como corpo de dragao, com cabeca;
//   - RUGIDO: ondas de choque grossas que empurram.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// riscos no que voa, e o rescaldo sao escamas caindo e brasa azul.
//
//   T1 Dual Chop      dois golpes de garra em X rapido; escamas voam.
//   T2 Dragon Breath  sopro de chama azul-violeta ate o alvo, que pega fogo.
//   T3 Dragon Pulse   feixe em forma de serpente, com cabeca, morde o alvo.
//   T4 Outrage        furia: tres ondas de choque, garras por todo lado e uma
//                     tempestade de escamas.
//   A1 Twister        um torvelinho gira no centro e abre ate a borda,
//                     levantando escamas em cada ponto.
//   A2 (Expl. Elem.)  rugido: duas ondas grossas cobrem a area e cada ponto
//                     estoura em escamas.
//   A3 (critico)      meteoros de chama de dragao caem pelo interior todo.
import { comImpacto } from '../acabamento'
import { pintarFogo, type Brasa } from '../campoDeFogo'
import { crescente, entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, CIMA, em, encolhe, escalaDaArea, fila, interior, sortear, TAU } from './comum'

/** Escamas: losangos curtos e largos girando, em 3 camadas. */
interface Escama { x: number; y: number; r: number; giro: number }

function escamas(ctx: CanvasRenderingContext2D, lista: readonly Escama[], pele: Pele): void {
  const forma = (e: Escama, k: number) => {
    const r = e.r * k, ux = Math.cos(e.giro), uy = Math.sin(e.giro)
    ctx.moveTo(e.x + ux * r, e.y + uy * r)
    ctx.lineTo(e.x - uy * r * 0.6, e.y + ux * r * 0.6)
    ctx.lineTo(e.x - ux * r * 0.8, e.y - uy * r * 0.8)
    ctx.lineTo(e.x + uy * r * 0.6, e.y - ux * r * 0.6)
    ctx.closePath()
  }
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.5]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const e of lista) if (e.r > 0.8) forma(e, k)
    ctx.fill()
  }
}

/** Escamas que estouram de `p` pra fora e caem girando. `t` 0..1. */
function estouroDeEscamas(p: Ponto, t: number, sem: readonly number[], k = 1): Escama[] {
  const out: Escama[] = []
  if (t < 0 || t > 1) return out
  for (let i = 0; i * 3 + 2 < sem.length; i++) {
    const a = sem[i * 3] * TAU, d = em(sem[i * 3 + 1], 10, 22) * k * saida(t)
    out.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8 + 14 * k * t * t, r: em(sem[i * 3 + 2], 2, 3.2) * Math.min(k, 1.6) * encolhe(t), giro: a + t * 10 })
  }
  return out
}

/** Onda de choque grossa (rugido): elipse de traco largo em 3 passadas. */
function ondas(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; rx: number; ry: number; w: number }[], pele: Pele): void {
  for (const [cor, extra, k] of [[pele.contorno, 1.6, 1], [pele.base, 0, 1], [pele.nucleo, 0, 0.35]] as const) {
    ctx.strokeStyle = cor
    for (const o of lista) {
      if (o.w < 0.3 || o.rx < 2) continue
      ctx.lineWidth = o.w * k + extra
      ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, 0, 0, TAU); ctx.stroke()
    }
  }
}

// ---------------------------------------------------------------------------
// T1 — DUAL CHOP
// ---------------------------------------------------------------------------

const CHOP_1 = 180
const CHOP_2 = 320

function dualChop(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semEsc = sortear(rng, 6 * 3)
  const semEstrela = sortear(rng, 9)
  for (const [t0, incl] of [[CHOP_1 - 90, 0.7], [CHOP_2 - 90, -0.7]] as const) {
    const p = (ms - t0) / 240
    if (p >= 0 && p <= 1) crescente(ctx, alvo, 14, -1.5, 1.5, 4.6, p, incl, pele, 0.5)
  }
  escamas(ctx, estouroDeEscamas(alvo, (ms - CHOP_2) / 480, semEsc), pele)
  if (ms >= CHOP_2 && ms < CHOP_2 + 180) estrelaDeImpacto(ctx, alvo, 13, (ms - CHOP_2) / 180, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T2 — DRAGON BREATH
// ---------------------------------------------------------------------------

const BAFO_SAI = 140
const BAFO_FIM = 560

function dragonBreath(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semJato = sortear(rng, 30 * 2)
  const semAlvo = sortear(rng, 16 * 3)
  const semEsc = sortear(rng, 5 * 3)
  const b = { x: origem.x + Math.cos(c.angulo) * 9, y: origem.y - 3 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy) || 1
  const dir = Math.atan2(dy, dx)
  const voo = 160
  // Jato: uma lingua a cada 14 ms viajando da boca ao alvo (chama de dragao).
  const chamas: Brasa[] = []
  for (let i = 0; i < 30; i++) {
    const nasce = BAFO_SAI + i * 14
    if (nasce > BAFO_FIM) break
    const idade = ms - nasce
    if (idade < 0 || idade > voo * 1.05) continue
    const u = idade / voo
    const a = dir + (semJato[i * 2] - 0.5) * 0.2
    chamas.push({ x: b.x + Math.cos(a) * d * u, y: b.y + Math.sin(a) * d * u, r: em(semJato[i * 2 + 1], 3.4, 4.6), f: u * 0.6, ang: a, semente: i })
  }
  // O alvo pega fogo azul: linguas subindo.
  for (let i = 0; i < 16; i++) {
    const nasce = BAFO_SAI + voo + i * 30
    const t = (ms - nasce) / 360
    if (t < 0 || t > 1) continue
    chamas.push({ x: alvo.x + (semAlvo[i * 3] - 0.5) * 12, y: alvo.y + 6 - 18 * t * (0.6 + semAlvo[i * 3 + 1] * 0.6), r: em(semAlvo[i * 3 + 2], 3, 4.4), f: t, ang: CIMA, semente: i + 40 })
  }
  // Sem o nucleo branco do fogo novo: no azul-violeta o branco lia como gelo.
  pintarFogo(ctx, chamas, pele, ms)
  escamas(ctx, estouroDeEscamas(alvo, (ms - BAFO_FIM) / 500, semEsc, 0.9), pele)
}

// ---------------------------------------------------------------------------
// T3 — DRAGON PULSE
// ---------------------------------------------------------------------------

const PULSO_SAI = 160
const PULSO_CHEGA = 380

function dragonPulse(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEsc = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 6 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d
  // Serpente: corpo ondulando que avanca; a cabeca e a ponta mais grossa.
  if (ms >= PULSO_SAI && ms < PULSO_CHEGA + 220) {
    const cab = saida(limitar((ms - PULSO_SAI) / (PULSO_CHEGA - PULSO_SAI)))
    const cauda = entrada(limitar((ms - PULSO_CHEGA) / 220))
    const pts: Ponto[] = []
    const n = 18
    for (let i = 0; i <= n; i++) {
      const u = cauda + (cab - cauda) * (i / n)
      const onda = Math.sin(u * 10 - ms * 0.03) * 4 * (1 - u * 0.5)
      pts.push({ x: b.x + dx * u + nx * onda, y: b.y + dy * u + ny * onda })
    }
    for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.6], [pele.nucleo, 0.25]] as const) {
      ctx.strokeStyle = cor; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      // Grossura cresce da cauda pra cabeca, em 3 trechos.
      for (let s = 0; s < 3; s++) {
        ctx.lineWidth = (2 + s * 1.6) * k * 2
        ctx.beginPath()
        for (let i = Math.floor((s / 3) * n); i <= Math.ceil(((s + 1) / 3) * n); i++) { const p = pts[i]; if (i === Math.floor((s / 3) * n)) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) }
        ctx.stroke()
      }
      // Cabeca.
      const h = pts[n]
      ctx.fillStyle = cor
      ctx.beginPath(); ctx.arc(h.x, h.y, 5.5 * k, 0, TAU); ctx.fill()
    }
    ctx.lineCap = 'butt'
  }
  escamas(ctx, estouroDeEscamas(alvo, (ms - PULSO_CHEGA) / 520, semEsc, 1.1), pele)
  if (ms >= PULSO_CHEGA && ms < PULSO_CHEGA + 220) estrelaDeImpacto(ctx, alvo, 17, (ms - PULSO_CHEGA) / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — OUTRAGE
// ---------------------------------------------------------------------------

const FURIA = [200, 480, 760] as const

function outrage(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semEsc = FURIA.map(() => sortear(rng, 8 * 3))
  const semEstrela = sortear(rng, 9)
  const lista: { x: number; y: number; rx: number; ry: number; w: number }[] = []
  FURIA.forEach((t0, i) => {
    // Cada golpe de furia: garra cruzada + onda de choque + escamas.
    const p = (ms - t0 + 100) / 260
    if (p >= 0 && p <= 1) crescente(ctx, alvo, 16 + i * 3, -1.6, 1.6, 5 + i, p, i % 2 ? -0.9 : 0.9, pele, 0.5)
    const t = (ms - t0) / 380
    if (t >= 0 && t <= 1) lista.push({ x: alvo.x, y: alvo.y, rx: (12 + 14 * saida(t)) * (1 + i * 0.15), ry: (7 + 8 * saida(t)) * (1 + i * 0.15), w: 3.2 * (1 - t) })
  })
  ondas(ctx, lista, pele)
  const esc: Escama[] = []
  FURIA.forEach((t0, i) => esc.push(...estouroDeEscamas(alvo, (ms - t0) / 520, semEsc[i], 1 + i * 0.25)))
  escamas(ctx, esc, pele)
  const derradeiro = FURIA[2]
  if (ms >= derradeiro && ms < derradeiro + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - derradeiro) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A1 — TWISTER: torvelinho no centro que abre ate a borda e levanta escamas.
function twister(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  const semEsc = pontos.map(() => sortear(rng, 3 * 3))
  const t = (ms - 60) / 900
  // Funil: elipses empilhadas que giram, mais largas em cima, e o funil abre.
  if (t >= 0 && t <= 1) {
    const abre = saida(limitar(t * 1.5))
    const lista: { x: number; y: number; rx: number; ry: number; w: number }[] = []
    for (let i = 0; i < 6; i++) {
      const h = i / 5
      const r = (6 + 18 * h) * k * 0.6 * (0.6 + 0.6 * abre) * encolhe(t, 0.3)
      const giro = Math.sin(ms * 0.02 + i) * 3
      lista.push({ x: centro.x + giro, y: centro.y + 10 - h * 50 * k * 0.6, rx: r, ry: r * 0.35, w: 2 * k * 0.6 * (1 - h * 0.4) })
    }
    ondas(ctx, lista, pele)
    // O vento varre do centro pra borda: anel rasteiro.
    ondas(ctx, [{ x: centro.x, y: centro.y + 12, rx: raio * abre, ry: raio * abre * 0.45, w: 1.8 * k * 0.6 * (1 - t) }], pele)
  }
  const esc: Escama[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(100, 600, d, raio)
    const tt = (ms - t0) / 600
    if (tt < 0 || tt > 1) return
    // Escamas levantadas girando em espiral pra cima.
    for (let j = 0; j < 3; j++) {
      const s = semEsc[i]
      const a = tt * TAU * 2 + s[j * 3] * TAU
      esc.push({ x: p.x + Math.cos(a) * 7 * k * 0.6, y: p.y - 4 - 24 * k * 0.6 * saida(tt) + Math.sin(a) * 2, r: em(s[j * 3 + 1], 2.4, 3.4) * k * 0.6 * encolhe(tt, 0.3), giro: a * 2 })
    }
  })
  escamas(ctx, esc, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): rugido em duas ondas + escamas no interior.
const RUGIDO = [100, 380] as const

function rugido(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semEsc = pontos.map(() => sortear(rng, 3 * 3))
  const lista: { x: number; y: number; rx: number; ry: number; w: number }[] = []
  RUGIDO.forEach(t0 => {
    const t = (ms - t0) / 600
    if (t >= 0 && t <= 1) lista.push({ x: centro.x, y: centro.y + 12, rx: raio * saida(t), ry: raio * saida(t) * 0.45, w: 3.6 * k * 0.6 * (1 - t * 0.7) })
  })
  ondas(ctx, lista, pele)
  const esc: Escama[] = []
  pontos.forEach(({ p, d }, i) => esc.push(...estouroDeEscamas({ x: p.x, y: p.y - 6 }, (ms - chegaEm(RUGIDO[0], 600, d, raio)) / 520, semEsc[i], k * 0.6)))
  escamas(ctx, esc, pele)
}

// A3 — (critico): meteoros de chama de dragao caem pelo interior todo.
function meteoros(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  const semRitmo = sortear(rng, 10)
  const semEsc = pontos.map(() => sortear(rng, 4 * 3))
  const semChamas = pontos.map(() => sortear(rng, 6 * 2))
  const chamas: Brasa[] = []
  const esc: Escama[] = []
  const ondasL: { x: number; y: number; rx: number; ry: number; w: number }[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(150, 700, d, raio) + semRitmo[i] * 80
    const queda = 260
    const u = (ms - t0) / queda
    const de = { x: p.x - 50 * k * 0.6, y: p.y - 110 * k * 0.6 }
    if (u >= 0 && u < 1) {
      // Cometa: cabeca + rastro de chama azul.
      const uu = entrada(u)
      for (let j = 0; j < 6; j++) {
        const uj = Math.max(0, uu - j * 0.06)
        chamas.push({ x: de.x + (p.x - de.x) * uj, y: de.y + (p.y - 6 - de.y) * uj, r: (5 - j * 0.6) * k * 0.6, f: j * 0.12, ang: Math.atan2(p.y - de.y, p.x - de.x), semente: i * 10 + j })
      }
    }
    // Pouso: estouro de chama baixa, onda curta e escamas.
    const tp = (ms - t0 - queda) / 420
    if (tp >= 0 && tp <= 1) {
      for (let j = 0; j < 6; j++) chamas.push({ x: p.x + (semChamas[i][j * 2] - 0.5) * 14 * k * 0.6, y: p.y - 2 - 14 * k * 0.6 * tp * semChamas[i][j * 2 + 1], r: 4 * k * 0.6, f: tp, ang: CIMA, semente: i * 10 + j + 100 })
      ondasL.push({ x: p.x, y: p.y, rx: 14 * k * 0.6 * saida(tp), ry: 6 * k * 0.6 * saida(tp), w: 2 * (1 - tp) })
    }
    esc.push(...estouroDeEscamas({ x: p.x, y: p.y - 6 }, (ms - t0 - queda) / 520, semEsc[i], k * 0.6))
  })
  ondas(ctx, ondasL, pele)
  pintarFogo(ctx, chamas, pele, ms)
  escamas(ctx, esc, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_DRAGAO = {
  single: { 1: 'dual_chop', 2: 'dragon_breath', 3: 'dragon_pulse', 4: 'outrage' },
  area: { 1: 'twister', 2: 'aoe50_dragon', 3: 'aoe50_dragon' },
} as const

export const DRAGAO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: dualChop, duracao: { 1: 900 }, alcance: 30, impactos: { 1: [CHOP_1, CHOP_2] } },
  2: { desenhar: dragonBreath, duracao: { 2: 1200 }, alcance: 36, impactos: { 2: [BAFO_SAI + 160] } },
  3: { desenhar: dragonPulse, duracao: { 3: 1000 }, alcance: 40, impactos: { 3: [PULSO_CHEGA] } },
  4: { desenhar: outrage, duracao: { 4: 1400 }, alcance: 50, impactos: { 4: [...FURIA] } },
}, false)

export const DRAGAO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: twister, duracao: { 1: 1300 }, alcance: 60, impactos: { 1: [300] } },
  2: { desenhar: rugido, duracao: { 2: 1400 }, alcance: 40, impactos: { 2: [RUGIDO[0] + 200] } },
  3: { desenhar: meteoros, duracao: { 3: 1800 }, alcance: 110, impactos: { 3: [500, 1000] } },
}, true)
