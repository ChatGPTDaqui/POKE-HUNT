// SOMBRIO (DARK) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Pursuit/Payback; T2 Bite/Night Slash/Sucker Punch/
// Knock Off/Feint Attack/Assurance/Thief; T3 Dark Pulse/Crunch/Foul Play; T4 so
// por critico. Area: A1 Snarl, A2 a Explosao Elemental do nivel 50 (70), A3 so
// por critico.
//
// PERSONALIDADE (o que separa do fantasma sem olhar a cor): fantasma e alma
// que flutua. Sombrio e BRIGA SUJA no escuro:
//   - MANDIBULA: presas brancas que fecham (morder e o golpe do tipo);
//   - GARRA: tres rasgos paralelos com o fio VERMELHO (o acento da pele);
//   - FIAPO DE SOMBRA: lingua escura que escorre e agarra (a particula
//     `sombra`);
//   - o vermelho e so detalhe — olho, fio, marca de raiva — nunca a massa.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// rastro de sombra no que avanca, e o rescaldo e a sombra escorrendo e sumindo.
//
//   T1 Pursuit       a sombra de quem lanca dispara em rastro e rasga o alvo.
//   T2 Bite          mandibula enorme abre e FECHA no alvo; faisca vermelha.
//   T3 Dark Pulse    ondas escuras de borda vermelha correm ate o alvo e o
//                    envolvem numa explosao de sombra.
//   T4 Crunch        duas mordidas: a segunda maior, que racha o ar em
//                    vermelho; fiapos de sombra agarram em volta.
//   A1 Snarl         rosnado: ondas serrilhadas do centro e marcas de raiva
//                    vermelhas em cada ponto do interior.
//   A2 (Expl. Elem.) fiapos de sombra sobem do chao em cada ponto e agarram.
//   A3 (critico)     sombra se espalha embaixo de cada um e cada ponto leva um rasgo de garra, em
//                    sequencia, do centro pra borda.
import { afinado, comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, CIMA, em, encolhe, escalaDaArea, fila, interior, pintarBolas, sortear, TAU } from './comum'

const vermelho = (p: Pele) => p.acento?.[0] ?? p.estrela

/**
 * Mandibula: arco de cima e arco de baixo com presas, abrindo `abre` (0..1) e
 * FECHANDO quando abre volta a 0. `r` = meia-largura. Achatada pela camera.
 */
function mandibula(ctx: CanvasRenderingContext2D, p: Ponto, r: number, abre: number, pele: Pele): void {
  if (r < 1) return
  const gap = r * 0.9 * abre
  for (const lado of [-1, 1] as const) {
    const cy = p.y + lado * (gap + r * 0.15)
    // Gengiva: meia-lua grossa.
    for (const [cor, k] of [[pele.contorno, 1.18], [pele.base, 1]] as const) {
      ctx.fillStyle = cor
      ctx.beginPath()
      ctx.ellipse(p.x, cy + lado * r * 0.25 * k, r * k, r * 0.42 * k, 0, lado < 0 ? Math.PI : 0, lado < 0 ? TAU : Math.PI)
      ctx.closePath()
      ctx.fill()
    }
    // Presas: triangulos brancos apontando pro outro lado da boca.
    for (const [cor, k] of [[pele.contorno, 1.3], [pele.nucleo, 1]] as const) {
      ctx.fillStyle = cor
      ctx.beginPath()
      for (let i = 0; i < 5; i++) {
        const u = (i + 0.5) / 5
        const x = p.x - r * 0.85 + u * r * 1.7
        const h = r * (i === 0 || i === 4 ? 0.55 : 0.35) * k
        const w = r * 0.13 * k
        ctx.moveTo(x - w, cy); ctx.lineTo(x, cy - lado * h); ctx.lineTo(x + w, cy); ctx.closePath()
      }
      ctx.fill()
    }
  }
}

/** Rasgo de garra: tres tracos paralelos diagonais com fio vermelho. `t` 0..1. */
function garra(ctx: CanvasRenderingContext2D, p: Ponto, tam: number, ang: number, t: number, pele: Pele): void {
  if (t < 0 || t > 1) return
  const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux
  const cab = saida(limitar(t * 2.5)), cauda = entrada(limitar((t - 0.35) / 0.65))
  for (const [cor, larg] of [[pele.contorno, 3.6], [vermelho(pele), 2.4], [pele.nucleo, 0.9]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (let i = -1; i <= 1; i++) {
      const o = i * tam * 0.32
      const a0 = -tam / 2 + tam * cauda, a1 = -tam / 2 + tam * cab
      if (a1 - a0 < 0.5) continue
      afinado(ctx, p.x + nx * o + ux * a0, p.y + ny * o + uy * a0, p.x + nx * o + ux * a1, p.y + ny * o + uy * a1, larg * (i ? 0.8 : 1))
    }
    ctx.fill()
  }
}

/** Fiapo de sombra: lingua escura ondulando, nasce em `p` e sobe/agarra ate `alt`. */
interface Fiapo { x: number; y: number; alt: number; larg: number; fase: number; ang?: number }

function fiapos(ctx: CanvasRenderingContext2D, lista: readonly Fiapo[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.4]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const f of lista) {
      if (f.alt < 1.5) continue
      const a = f.ang ?? CIMA, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux
      const n = 6
      const pts: [number, number][] = []
      for (let i = 0; i <= n; i++) {
        const u = i / n, w = f.larg * k * (1 - u) ** 0.8, onda = Math.sin(u * 5 + f.fase) * f.larg * 0.8 * u
        pts.push([f.x + ux * f.alt * u + nx * (onda + w), f.y + uy * f.alt * u + ny * (onda + w)])
      }
      for (let i = n; i >= 0; i--) {
        const u = i / n, w = f.larg * k * (1 - u) ** 0.8, onda = Math.sin(u * 5 + f.fase) * f.larg * 0.8 * u
        pts.push([f.x + ux * f.alt * u + nx * (onda - w), f.y + uy * f.alt * u + ny * (onda - w)])
      }
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Marca de raiva do manga: quatro cantos curvos em cruz, vermelhos. */
function raivas(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, w] of [[pele.contorno, 2.6], [vermelho(pele), 1.4]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w
    ctx.beginPath()
    for (const m of lista) {
      if (m.r < 1) continue
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * TAU + Math.PI / 4
        const cx = m.x + Math.cos(a) * m.r * 0.75, cy = m.y + Math.sin(a) * m.r * 0.75
        ctx.moveTo(cx + Math.cos(a + 1.9) * m.r * 0.5, cy + Math.sin(a + 1.9) * m.r * 0.5)
        ctx.arc(cx, cy, m.r * 0.5, a + 1.9, a - 1.9 + TAU, false)
      }
    }
    ctx.stroke()
  }
}

/** Poca de sombra no chao: elipse achatada pela camera (bola redonda lia como bola de boliche). */
function pocas(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, k, dy] of [[pele.contorno, 1.15, 0], [pele.base, 0.95, -0.08], [pele.meio, 0.45, -0.18]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const b of lista) { const r = b.r * k; if (r < 0.6) continue; const y = b.y + dy * b.r; ctx.moveTo(b.x + r, y); ctx.ellipse(b.x, y, r, r * 0.38, 0, 0, TAU) }
    ctx.fill()
  }
}

/** Rastro de sombra: borroes escuros que ficam onde algo passou e escorrem. */
function rastro(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  pintarBolas(ctx, pts, [[pele.contorno, 1.2, 0], [pele.base, 0.95, 0], [pele.meio, 0.4, -0.3]])
}

// ---------------------------------------------------------------------------
// T1 — PURSUIT
// ---------------------------------------------------------------------------

const PURSUIT_SAI = 80
const PURSUIT_BATE = 260

function pursuit(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  // A sombra dispara: borroes deixados no caminho, que escorrem e somem.
  const pts: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 9; i++) {
    const nasce = PURSUIT_SAI + i * ((PURSUIT_BATE - PURSUIT_SAI) / 9)
    const t = (ms - nasce) / 320
    if (t < 0 || t > 1) continue
    const u = i / 8
    pts.push({ x: origem.x + (alvo.x - origem.x) * u, y: origem.y + (alvo.y - origem.y) * u + 6 * t, r: (2.5 + u * 2.5) * encolhe(t, 0.6) })
  }
  rastro(ctx, pts, pele)
  garra(ctx, alvo, 18, -0.9, (ms - PURSUIT_BATE + 40) / 260, pele)
  if (ms >= PURSUIT_BATE && ms < PURSUIT_BATE + 180) estrelaDeImpacto(ctx, alvo, 12, (ms - PURSUIT_BATE) / 180, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T2 — BITE
// ---------------------------------------------------------------------------

const BITE_ABRE = 60
const BITE_FECHA = 320

function bite(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  // Abre devagar (ameaca), fecha num estalo, segura e some.
  if (ms >= BITE_ABRE && ms < BITE_FECHA + 260) {
    const abre = ms < BITE_FECHA - 60 ? saida(limitar((ms - BITE_ABRE) / 180)) : 1 - saida(limitar((ms - BITE_FECHA + 60) / 60))
    const some = encolhe(limitar((ms - BITE_FECHA - 120) / 140), 1)
    mandibula(ctx, alvo, 14 * some, abre, pele)
  }
  if (ms >= BITE_FECHA && ms < BITE_FECHA + 200) estrelaDeImpacto(ctx, alvo, 14, (ms - BITE_FECHA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — DARK PULSE
// ---------------------------------------------------------------------------

const PULSE_SAI = 120
const PULSE_CHEGA = 340

function darkPulse(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semFiapos = sortear(rng, 8 * 2)
  const semEstrela = sortear(rng, 9)
  const dx = alvo.x - origem.x, dy = alvo.y - origem.y
  // Ondas: aneis escuros de borda vermelha que nascem em quem lanca e correm.
  for (const [cor, extra] of [[pele.contorno, 2], [pele.base, 0.6], [vermelho(pele), -0.6]] as const) {
    ctx.strokeStyle = cor
    for (let i = 0; i < 5; i++) {
      const u = (ms - PULSE_SAI - i * 45) / (PULSE_CHEGA - PULSE_SAI)
      if (u < 0 || u > 1) continue
      const r = 5 + 6 * u
      ctx.lineWidth = Math.max(0.6, 2.2 + extra)
      ctx.beginPath(); ctx.ellipse(origem.x + dx * u, origem.y - 4 + dy * u, r * 0.5, r, Math.atan2(dy, dx), 0, TAU); ctx.stroke()
    }
  }
  // Explosao de sombra: fiapos que saem do alvo pra todos os lados e escorrem.
  const t = (ms - PULSE_CHEGA) / 520
  if (t >= 0 && t <= 1) {
    const lista: Fiapo[] = []
    for (let i = 0; i < 8; i++) {
      const a = semFiapos[i * 2] * TAU
      lista.push({ x: alvo.x, y: alvo.y, alt: em(semFiapos[i * 2 + 1], 12, 20) * saida(limitar(t * 3)) * encolhe(t, 0.5), larg: 2.4, fase: ms * 0.02 + i, ang: a })
    }
    fiapos(ctx, lista, pele)
  }
  if (ms >= PULSE_CHEGA && ms < PULSE_CHEGA + 220) estrelaDeImpacto(ctx, alvo, 16, (ms - PULSE_CHEGA) / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — CRUNCH (critico)
// ---------------------------------------------------------------------------

const CRUNCH_1 = 300
const CRUNCH_2 = 700

function crunch(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semFiapos = sortear(rng, 6 * 2)
  const semRachas = sortear(rng, 6)
  const semEstrela = sortear(rng, 9)
  // Fiapos de sombra agarram o alvo por baixo enquanto a boca trabalha.
  const tf = (ms - 60) / 1100
  if (tf >= 0 && tf <= 1) {
    const lista: Fiapo[] = []
    for (let i = 0; i < 6; i++) {
      const a = CIMA + (semFiapos[i * 2] - 0.5) * 2.4
      lista.push({ x: alvo.x + (semFiapos[i * 2 + 1] - 0.5) * 20, y: alvo.y + 12, alt: 16 * saida(limitar(tf * 4)) * encolhe(tf, 0.3), larg: 2.2, fase: ms * 0.015 + i, ang: a })
    }
    fiapos(ctx, lista, pele)
  }
  // Duas mordidas: a segunda maior.
  for (const [t0, r] of [[CRUNCH_1, 13], [CRUNCH_2, 19]] as const) {
    const ini = t0 - 220
    if (ms < ini || ms > t0 + 220) continue
    const abre = ms < t0 - 50 ? saida(limitar((ms - ini) / 140)) : 1 - saida(limitar((ms - t0 + 50) / 50))
    mandibula(ctx, alvo, r * encolhe(limitar((ms - t0 - 80) / 140), 1), abre, pele)
  }
  // A segunda racha o ar: tracos vermelhos quebrados saindo do alvo.
  const tr = (ms - CRUNCH_2) / 320
  if (tr >= 0 && tr <= 1) {
    ctx.fillStyle = vermelho(pele)
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + semRachas[i]
      const d0 = 8, d1 = 8 + 16 * saida(tr)
      const meio = (d0 + d1) / 2
      afinado(ctx, alvo.x + Math.cos(a) * d0, alvo.y + Math.sin(a) * d0, alvo.x + Math.cos(a + 0.25) * meio, alvo.y + Math.sin(a + 0.25) * meio, 2.4 * (1 - tr))
      afinado(ctx, alvo.x + Math.cos(a + 0.25) * meio, alvo.y + Math.sin(a + 0.25) * meio, alvo.x + Math.cos(a) * d1, alvo.y + Math.sin(a) * d1, 1.6 * (1 - tr))
    }
    ctx.fill()
  }
  if (ms >= CRUNCH_2 && ms < CRUNCH_2 + 260) estrelaDeImpacto(ctx, alvo, 20, (ms - CRUNCH_2) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A1 — SNARL: rosnado em ondas serrilhadas + marcas de raiva no interior.
const SNARL_ONDAS = [80, 260] as const

function snarl(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  // Olhos vermelhos de quem rosna.
  if (ms < 700) {
    ctx.fillStyle = vermelho(pele)
    const pisca = Math.floor(ms / 90) % 4 === 3 ? 0 : 1
    if (pisca) { ctx.fillRect(Math.round(origem.x - 4), Math.round(origem.y - 10), 2, 1); ctx.fillRect(Math.round(origem.x + 2), Math.round(origem.y - 10), 2, 1) }
  }
  // Ondas serrilhadas escuras.
  for (const [cor, extra] of [[pele.contorno, 1.4], [pele.meio, 0]] as const) {
    ctx.strokeStyle = cor
    SNARL_ONDAS.forEach(t0 => {
      const t = (ms - t0) / 560
      if (t < 0 || t > 1) return
      const r = raio * saida(t)
      ctx.lineWidth = 2 * k * 0.6 * (1 - t) + extra
      ctx.beginPath()
      const n = Math.max(12, Math.round(r * 0.25) * 2)
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * TAU, rr = r * (i % 2 ? 0.92 : 1.04)
        const x = centro.x + Math.cos(a) * rr, y = centro.y + 12 + Math.sin(a) * rr * 0.45
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      }
      ctx.stroke()
    })
  }
  // Marca de raiva que salta em cada ponto quando a onda passa.
  const marcas: { x: number; y: number; r: number }[] = []
  pontos.forEach(({ p, d }) => {
    const t = (ms - chegaEm(SNARL_ONDAS[0], 560, d, raio)) / 420
    if (t >= 0 && t <= 1) marcas.push({ x: p.x + 4, y: p.y - 16 - 4 * saida(t), r: 4.5 * k * 0.6 * (t < 0.15 ? saida(t / 0.15) : encolhe(t, 0.3)) })
  })
  raivas(ctx, marcas, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): fiapos de sombra sobem e agarram no interior.
function maosDaSombra(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semFiapos = pontos.map(() => sortear(rng, 3 * 2))
  // Poca escura que se espalha embaixo de todos: o chao da sombra.
  const tp = (ms - 60) / 1100
  const lista: Fiapo[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(100, 500, d, raio)
    const t = (ms - t0) / 760
    if (t < 0 || t > 1) return
    for (let j = 0; j < 3; j++) {
      const s = semFiapos[i]
      // Sobem e CURVAM pra dentro, como dedos fechando.
      const a = CIMA + (j - 1) * 0.45 + (s[j * 2] - 0.5) * 0.3
      lista.push({ x: p.x + (j - 1) * 4 * k * 0.6, y: p.y, alt: em(s[j * 2 + 1], 14, 22) * k * 0.6 * saida(limitar(t * 3)) * encolhe(t, 0.4), larg: 2.4 * k * 0.6, fase: ms * 0.018 + i + j * 2, ang: a - (j - 1) * 0.6 * saida(t) })
    }
  })
  if (tp >= 0 && tp <= 1) pocas(ctx, pontos.map(({ p }) => ({ x: p.x, y: p.y + 2, r: 8 * k * 0.6 * saida(limitar(tp * 3)) * encolhe(tp, 0.3) })), pele)
  fiapos(ctx, lista, pele)
}

// A3 — (critico): a area escurece e cada ponto leva um rasgo de garra.
function noiteDeGarras(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semAng = sortear(rng, 12)
  // Sombra no chao de cada ponto antes do rasgo (veu por alfa foi vetado:
  // o pixelizador vira pontilhado, que o dono reprovou no eletrico).
  const poca = pontos.map(({ p, d }) => {
    const t = (ms - chegaEm(100, 600, d, raio)) / 1100
    return { x: p.x, y: p.y + 2, r: t < 0 || t > 1 ? 0 : 7 * k * 0.6 * saida(limitar(t * 4)) * encolhe(t, 0.3) }
  })
  pocas(ctx, poca, pele)
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(300, 700, d, raio)
    garra(ctx, { x: p.x, y: p.y - 10 }, 26 * k * 0.6, -0.9 + (semAng[i] - 0.5) * 0.6, (ms - t0) / 300, pele)
  })
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_SOMBRIO = {
  single: { 1: 'pursuit', 2: 'bite', 3: 'dark_pulse', 4: 'crunch' },
  area: { 1: 'snarl', 2: 'aoe50_dark', 3: 'aoe50_dark' },
} as const

export const SOMBRIO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: pursuit, duracao: { 1: 800 }, alcance: 30, impactos: { 1: [PURSUIT_BATE] } },
  2: { desenhar: bite, duracao: { 2: 900 }, alcance: 30, margem: { cima: 30, baixo: 39, lados: 30 }, impactos: { 2: [BITE_FECHA] } },
  3: { desenhar: darkPulse, duracao: { 3: 1100 }, alcance: 40, margem: { cima: 40, baixo: 49, lados: 40 }, impactos: { 3: [PULSE_CHEGA] } },
  4: { desenhar: crunch, duracao: { 4: 1400 }, alcance: 44, margem: { cima: 44, baixo: 55, lados: 44 }, impactos: { 4: [CRUNCH_1, CRUNCH_2] } },
}, false)

export const SOMBRIO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: snarl, duracao: { 1: 1100 }, alcance: 30, impactos: { 1: [SNARL_ONDAS[0] + 200] } },
  2: { desenhar: maosDaSombra, duracao: { 2: 1500 }, alcance: 50, impactos: { 2: [350] } },
  3: { desenhar: noiteDeGarras, duracao: { 3: 1700 }, alcance: 40, impactos: { 3: [400, 900] } },
}, true)
