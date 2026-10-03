// FANTASMA (GHOST) — 4 single + A2 + A3, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Lick/Astonish/Shadow Sneak; T2 Shadow Punch/Hex/
// Shadow Claw/Ominous Wind; T3 Shadow Ball/Phantom Force; T4 so por critico.
// Area: nenhum golpe; so a Explosao Elemental do nivel 50 (70, A2) e o
// critico (A3). SEM A1.
//
// PERSONALIDADE (o que separa do sombrio sem olhar a cor): sombrio e briga
// suja. Fantasma e ALMA PENADA, assombracao de desenho:
//   - ESPIRITO: cabeca redonda, cauda ondulando e dois olhos — flutua, nunca
//     anda (a particula `fantasma`);
//   - FOGO-FATUO: chama roxa que gira e deixa rastro;
//   - SURGE DO NADA: as coisas aparecem do lado do alvo, sem viajar;
//   - meio comico (lingua, cara de susto) e meio assustador.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// rastro no que voa, e o rescaldo sao espiritos subindo e sumindo.
//
//   T1 Lick           uma lingua enorme surge e lambe o alvo de baixo pra cima.
//   T2 Shadow Punch   um punho de sombra aparece do nada ao lado e soca.
//   T3 Shadow Ball    bola de sombra com fiapos girando voa e explode em
//                     espiritos.
//   T4 Phantom Force  quem lanca some; fogos-fatuos cercam o alvo e uma cara
//                     enorme de boca aberta da o bote.
//   A2 (Expl. Elem.)  espiritos sobem do chao em cada ponto, girando.
//   A3 (critico)      fogos-fatuos rodam pela borda e mergulham em cada ponto.
import { comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, em, encolhe, escalaDaArea, fila, interior, pintarBolas, sortear, TAU } from './comum'

const BRANCO = '#ffffff'

/** Espirito: cabeca redonda + cauda ondulando pra baixo + olhos. `s` = tamanho. */
interface Espirito { x: number; y: number; s: number; fase: number }

function espiritos(ctx: CanvasRenderingContext2D, lista: readonly Espirito[], pele: Pele): void {
  const corpo = (e: Espirito, k: number) => {
    const r = e.s * k
    ctx.moveTo(e.x + r, e.y)
    ctx.arc(e.x, e.y, r, 0, Math.PI, true)
    // Cauda: afina em zigue-zague ondulante.
    for (let i = 1; i <= 4; i++) {
      const u = i / 4
      ctx.lineTo(e.x - r * (1 - u * 0.9) + Math.sin(e.fase + u * 4) * r * 0.35, e.y + r * 2.2 * u)
    }
    for (let i = 4; i >= 1; i--) {
      const u = i / 4
      ctx.lineTo(e.x + r * (1 - u * 0.95) + Math.sin(e.fase + u * 4) * r * 0.35, e.y + r * 2.2 * u - r * 0.2)
    }
    ctx.closePath()
  }
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.meio, 1], [pele.nucleo, 0.5]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const e of lista) if (e.s > 0.8) corpo(e, k)
    ctx.fill()
  }
  // Olhos: dois pontinhos escuros.
  ctx.fillStyle = pele.contorno
  for (const e of lista) {
    if (e.s < 1.6) continue
    const o = Math.max(1, Math.round(e.s * 0.3))
    ctx.fillRect(Math.round(e.x - e.s * 0.45), Math.round(e.y - e.s * 0.15), o, o + 1)
    ctx.fillRect(Math.round(e.x + e.s * 0.2), Math.round(e.y - e.s * 0.15), o, o + 1)
  }
}

/** Fogo-fatuo: chama roxa redonda com rastro de bolinhas que encolhem. */
function fogosFatuos(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; r: number; rastro: readonly Ponto[] }[], pele: Pele): void {
  const bolas: { x: number; y: number; r: number }[] = []
  for (const f of lista) {
    f.rastro.forEach((p, i) => bolas.push({ x: p.x, y: p.y, r: f.r * (1 - (i + 1) / (f.rastro.length + 1)) * 0.8 }))
    bolas.push({ x: f.x, y: f.y, r: f.r })
  }
  pintarBolas(ctx, bolas, [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.7, -0.15], [pele.nucleo, 0.35, -0.2]])
}

/** Fiapos de sombra girando em volta de um centro (a bola de sombra). */
function fiaposGirando(ctx: CanvasRenderingContext2D, p: Ponto, r: number, ms: number, pele: Pele): void {
  for (const [cor, w] of [[pele.contorno, 2.6], [pele.meio, 1.2]] as const) {
    ctx.strokeStyle = cor; ctx.lineWidth = w
    ctx.beginPath()
    for (let i = 0; i < 3; i++) {
      const a0 = ms * 0.012 + (i / 3) * TAU
      ctx.moveTo(p.x + Math.cos(a0) * r * 1.3, p.y + Math.sin(a0) * r * 1.3)
      ctx.arc(p.x, p.y, r * 1.3, a0, a0 + 1.6)
    }
    ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// T1 — LICK
// ---------------------------------------------------------------------------

const LICK_SURGE = 100
const LICK_LAMBE = 300

function lick(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semBaba = sortear(rng, 5 * 2)
  const semEspiritos = sortear(rng, 3 * 2)
  const lado = alvo.x >= origem.x ? -1 : 1
  // A lingua sobe de baixo do alvo num arco, lambe e recolhe.
  const t = (ms - LICK_SURGE) / 520
  if (t >= 0 && t <= 1) {
    const sobe = t < 0.4 ? saida(t / 0.4) : 1 - entrada((t - 0.4) / 0.6)
    const base = { x: alvo.x + lado * 12, y: alvo.y + 14 }
    const ponta = { x: alvo.x - lado * 4, y: alvo.y + 12 - 30 * sobe }
    const L = Math.hypot(ponta.x - base.x, ponta.y - base.y) || 1
    const nx = -(ponta.y - base.y) / L, ny = (ponta.x - base.x) / L
    for (const [cor, k] of [[pele.contorno, 1.3], [pele.meio, 1], [pele.nucleo, 0.5]] as const) {
      const w = 4.2 * k
      ctx.fillStyle = cor
      ctx.beginPath()
      ctx.moveTo(base.x + nx * w, base.y + ny * w)
      ctx.quadraticCurveTo(base.x + (ponta.x - base.x) * 0.5 + nx * w * 2, base.y + (ponta.y - base.y) * 0.5 + ny * w * 2, ponta.x + nx * w * 0.6, ponta.y + ny * w * 0.6)
      ctx.arc(ponta.x, ponta.y, w * 0.85, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI, true)
      ctx.quadraticCurveTo(base.x + (ponta.x - base.x) * 0.5 - nx * w * 0.5, base.y + (ponta.y - base.y) * 0.5 - ny * w * 0.5, base.x - nx * w, base.y - ny * w)
      ctx.closePath()
      ctx.fill()
    }
  }
  // Baba que pinga depois da lambida.
  const tb = (ms - LICK_LAMBE) / 500
  if (tb >= 0 && tb <= 1) {
    const gotas: { x: number; y: number; r: number }[] = []
    for (let i = 0; i < 5; i++) gotas.push({ x: alvo.x + (semBaba[i * 2] - 0.5) * 12, y: alvo.y - 6 + semBaba[i * 2 + 1] * 8 + 22 * tb * tb, r: 1.6 * encolhe(tb) })
    pintarBolas(ctx, gotas, [[pele.contorno, 1.4, 0], [pele.nucleo, 1, 0]])
  }
  // Rescaldo: espiritinhos sobem rindo.
  const lista: Espirito[] = []
  for (let i = 0; i < 3; i++) {
    const te = (ms - LICK_LAMBE - 100 - i * 90) / 520
    if (te < 0 || te > 1) continue
    lista.push({ x: alvo.x + (semEspiritos[i * 2] - 0.5) * 20 + Math.sin(te * 6) * 3, y: alvo.y - 8 - 22 * saida(te), s: 2.6 * encolhe(te, 0.35), fase: ms * 0.02 + i })
  }
  espiritos(ctx, lista, pele)
}

// ---------------------------------------------------------------------------
// T2 — SHADOW PUNCH
// ---------------------------------------------------------------------------

const PUNCH_SURGE = 160
const PUNCH_BATE = 340

function shadowPunch(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  // Do lado de LA do alvo: surge do nada atras dele, longe de quem lanca.
  const lado = alvo.x >= origem.x ? 1 : -1
  // O punho SURGE do nada ao lado do alvo (cresce no lugar), recua e soca.
  const t = (ms - PUNCH_SURGE) / 420
  if (t >= 0 && t <= 1) {
    const surge = saida(limitar(t * 4))
    const soca = saida(limitar((ms - PUNCH_BATE + 60) / 60))
    const recua = 1 - limitar((ms - PUNCH_SURGE) / 120) * (1 - soca)
    const some = encolhe(t, 0.35)
    const x = alvo.x + lado * (20 - 12 * soca + 4 * (1 - recua)), y = alvo.y - 2
    const r = 5.5 * surge * some
    // Punho: bola + nos dos dedos + pulso que vira fiapo.
    const bolas = [{ x, y, r }, { x: x - lado * r * 0.75, y: y - r * 0.55, r: r * 0.45 }, { x: x - lado * r * 0.75, y: y + r * 0.05, r: r * 0.45 }, { x: x - lado * r * 0.7, y: y + r * 0.6, r: r * 0.42 }]
    for (let i = 1; i <= 4; i++) bolas.push({ x: x + lado * r * (0.6 + i * 0.55), y: y + Math.sin(ms * 0.02 + i) * 1.5, r: r * (0.75 - i * 0.15) })
    pintarBolas(ctx, bolas, [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.55, -0.25]])
  }
  if (ms >= PUNCH_BATE && ms < PUNCH_BATE + 200) estrelaDeImpacto(ctx, alvo, 14, (ms - PUNCH_BATE) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — SHADOW BALL
// ---------------------------------------------------------------------------

const BALL_CARGA = 220
const BALL_CHEGA = 460

function shadowBall(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEspiritos = sortear(rng, 6 * 2)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 6 }
  if (ms < BALL_CHEGA) {
    const cresce = saida(limitar(ms / BALL_CARGA))
    const u = entrada(limitar((ms - BALL_CARGA) / (BALL_CHEGA - BALL_CARGA)))
    const p = { x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u }
    const r = 5.5 * cresce
    // Rastro de bolinhas de sombra.
    const rastro: Ponto[] = []
    for (let i = 1; i <= 3; i++) { const uu = Math.max(0, u - i * 0.08); rastro.push({ x: b.x + (alvo.x - b.x) * uu, y: b.y + (alvo.y - b.y) * uu }) }
    fogosFatuos(ctx, [{ x: p.x, y: p.y, r, rastro: u > 0 ? rastro : [] }], pele)
    fiaposGirando(ctx, p, r, ms, pele)
  }
  // Explode em espiritos que fogem pra todo lado.
  const te = (ms - BALL_CHEGA) / 620
  if (te >= 0 && te <= 1) {
    const lista: Espirito[] = []
    for (let i = 0; i < 6; i++) {
      const a = semEspiritos[i * 2] * TAU, d = em(semEspiritos[i * 2 + 1], 12, 24) * saida(te)
      lista.push({ x: alvo.x + Math.cos(a) * d, y: alvo.y + Math.sin(a) * d * 0.7 - 10 * te, s: 2.8 * encolhe(te, 0.4), fase: ms * 0.02 + i })
    }
    espiritos(ctx, lista, pele)
  }
  if (ms >= BALL_CHEGA && ms < BALL_CHEGA + 220) estrelaDeImpacto(ctx, alvo, 17, (ms - BALL_CHEGA) / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — PHANTOM FORCE (critico)
// ---------------------------------------------------------------------------

const PHANTOM_CERCA = 120
const PHANTOM_BOTE = 700

function phantomForce(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const giro0 = rng() * TAU
  const semEspiritos = sortear(rng, 8 * 2)
  const semEstrela = sortear(rng, 9)
  // Fogos-fatuos cercam o alvo, girando cada vez mais rapido.
  if (ms >= PHANTOM_CERCA && ms < PHANTOM_BOTE + 80) {
    const t = (ms - PHANTOM_CERCA) / (PHANTOM_BOTE - PHANTOM_CERCA)
    const lista: { x: number; y: number; r: number; rastro: Ponto[] }[] = []
    for (let i = 0; i < 5; i++) {
      const giro = giro0 + (i / 5) * TAU + t * t * TAU * 1.8
      const R = 20 * (1 - 0.3 * t)
      const rastro: Ponto[] = [1, 2, 3].map(j => ({ x: alvo.x + Math.cos(giro - j * 0.18) * R, y: alvo.y - 4 + Math.sin(giro - j * 0.18) * R * 0.5 }))
      lista.push({ x: alvo.x + Math.cos(giro) * R, y: alvo.y - 4 + Math.sin(giro) * R * 0.5, r: 3 * saida(limitar(t * 5)), rastro })
    }
    fogosFatuos(ctx, lista, pele)
  }
  // O bote: uma cara enorme de boca aberta surge sobre o alvo e fecha.
  const tb = (ms - PHANTOM_BOTE + 220) / 420
  if (tb >= 0 && tb <= 1) {
    const r = 15 * saida(limitar(tb * 3)) * encolhe(tb, 0.3)
    const boca = tb < 0.5 ? 1 : 1 - (tb - 0.5) / 0.25
    const p = { x: alvo.x, y: alvo.y - 10 }
    pintarBolas(ctx, [{ x: p.x, y: p.y, r }], [[pele.contorno, 1.15, 0], [pele.meio, 1, 0], [pele.nucleo, 0.6, -0.3]])
    if (r > 3) {
      // Olhos vazios e boca escura.
      ctx.fillStyle = pele.contorno
      ctx.beginPath()
      ctx.ellipse(p.x - r * 0.38, p.y - r * 0.2, r * 0.18, r * 0.24, 0, 0, TAU)
      ctx.moveTo(p.x + r * 0.56, p.y - r * 0.2); ctx.ellipse(p.x + r * 0.38, p.y - r * 0.2, r * 0.18, r * 0.24, 0, 0, TAU)
      ctx.moveTo(p.x + r * 0.5, p.y + r * 0.35); ctx.ellipse(p.x, p.y + r * 0.35, r * 0.5, r * 0.35 * Math.max(0.1, boca), 0, 0, TAU)
      ctx.fill()
      ctx.fillStyle = BRANCO
      ctx.fillRect(Math.round(p.x - r * 0.42), Math.round(p.y - r * 0.28), 1, 1)
      ctx.fillRect(Math.round(p.x + r * 0.34), Math.round(p.y - r * 0.28), 1, 1)
    }
  }
  // Espiritos fogem depois do bote.
  const te = (ms - PHANTOM_BOTE) / 600
  if (te >= 0 && te <= 1) {
    const lista: Espirito[] = []
    for (let i = 0; i < 8; i++) {
      const a = semEspiritos[i * 2] * TAU, d = em(semEspiritos[i * 2 + 1], 14, 28) * saida(te)
      lista.push({ x: alvo.x + Math.cos(a) * d, y: alvo.y + Math.sin(a) * d * 0.7 - 12 * te, s: 3 * encolhe(te, 0.4), fase: ms * 0.02 + i })
    }
    espiritos(ctx, lista, pele)
  }
  if (ms >= PHANTOM_BOTE && ms < PHANTOM_BOTE + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - PHANTOM_BOTE) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A2 — EXPLOSAO ELEMENTAL (nivel 50): espiritos sobem do chao em cada ponto.
function assombracao(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semEsp = pontos.map(() => sortear(rng, 2 * 2))
  const lista: Espirito[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(100, 500, d, raio)
    for (let j = 0; j < 2; j++) {
      const t = (ms - t0 - j * 120) / 800
      if (t < 0 || t > 1) continue
      const s = semEsp[i]
      const a = t * TAU * 1.2 + s[j * 2] * TAU
      lista.push({ x: p.x + Math.cos(a) * 6 * k * 0.6, y: p.y - 4 - 30 * k * 0.6 * saida(t), s: em(s[j * 2 + 1], 3, 4) * k * 0.6 * saida(limitar(t * 4)) * encolhe(t, 0.35), fase: ms * 0.02 + i + j })
    }
  })
  espiritos(ctx, lista, pele)
}

// A3 — (critico): fogos-fatuos rodam pela borda e mergulham em cada ponto.
function rodaDeFogoFatuo(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  const RODA = 700
  const lista: { x: number; y: number; r: number; rastro: Ponto[] }[] = []
  const naRoda = (a: number) => ({ x: centro.x + Math.cos(a) * raio * 0.97, y: centro.y + 12 + Math.sin(a) * raio * 0.97 * 0.45 - 8 })
  pontos.forEach(({ p }, i) => {
    const a0 = (i / pontos.length) * TAU
    const t = ms / RODA
    if (ms > RODA + 300 + i * 50) {
      return
    }
    if (ms < RODA + i * 50) {
      // Rodando pela borda (mostra o alcance).
      const a = a0 + t * TAU * 0.6
      const q = naRoda(a)
      lista.push({ ...q, r: 3.4 * k * 0.6 * saida(limitar(ms / 150)), rastro: [1, 2, 3].map(j => naRoda(a - j * 0.07)) })
    } else {
      // Mergulha no ponto.
      const u = saida(limitar((ms - RODA - i * 50) / 300))
      const de = naRoda(a0 + ((RODA + i * 50) / RODA) * TAU * 0.6)
      const q = { x: de.x + (p.x - de.x) * u, y: de.y + (p.y - 8 - de.y) * u }
      lista.push({ ...q, r: 3.4 * k * 0.6 * (1 - u * 0.4), rastro: [{ x: q.x - (p.x - de.x) * 0.08, y: q.y - (p.y - de.y) * 0.08 }] })
    }
  })
  fogosFatuos(ctx, lista, pele)
  // Cada ponto atingido solta um espirito que sobe.
  const esp: Espirito[] = []
  pontos.forEach(({ p }, i) => {
    const t = (ms - RODA - 300 - i * 50) / 600
    if (t >= 0 && t <= 1) esp.push({ x: p.x, y: p.y - 8 - 26 * k * 0.6 * saida(t), s: 3.6 * k * 0.6 * encolhe(t, 0.35), fase: ms * 0.02 + i })
  })
  espiritos(ctx, esp, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_FANTASMA = {
  single: { 1: 'lick', 2: 'shadow_punch', 3: 'shadow_ball', 4: 'phantom_force' },
  area: { 2: 'aoe50_ghost', 3: 'aoe50_ghost' },
} as const

export const FANTASMA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: lick, duracao: { 1: 1200 }, alcance: 40, impactos: { 1: [LICK_LAMBE] } },
  2: { desenhar: shadowPunch, duracao: { 2: 800 }, alcance: 34, margem: { cima: 34, baixo: 34, lados: 44 }, impactos: { 2: [PUNCH_BATE] } },
  3: { desenhar: shadowBall, duracao: { 3: 1200 }, alcance: 40, impactos: { 3: [BALL_CHEGA] } },
  4: { desenhar: phantomForce, duracao: { 4: 1400 }, alcance: 50, impactos: { 4: [PHANTOM_BOTE] } },
}, false)

/** Sem A1: nenhum golpe fantasma em area cai nele (ver cabecalho). */
export const FANTASMA_AREA: Partial<Record<1 | 2 | 3, EntradaDeCoreografia>> = comImpacto({
  2: { desenhar: assombracao, duracao: { 2: 1600 }, alcance: 85, margem: { cima: 45, baixo: 20, lados: 20 }, impactos: { 2: [300] } },
  3: { desenhar: rodaDeFogoFatuo, duracao: { 3: 2100 }, alcance: 88, margem: { cima: 48, baixo: 20, lados: 20 }, impactos: { 3: [1000, 1300] } },
}, true)
