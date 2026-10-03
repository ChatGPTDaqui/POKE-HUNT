// FADA (FAIRY) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Fairy Wind/Draining Kiss; T2 nenhum (so por critico
// do T1); T3 Moonblast/Play Rough; T4 so por critico do T3. Area: A1
// Disarming Voice, A2 a Explosao Elemental do nivel 50 (70), A3 so por critico.
//
// PERSONALIDADE (o que separa do psiquico sem olhar a cor): psiquico e onda
// mental, aneis e pressao. Fada e ENCANTO de desenho animado:
//   - ESTRELA de 5 pontas que pisca e quica (nunca o brilho de 4 pontas);
//   - CORACAO e LUA — formas de feitico infantil;
//   - tudo REDONDO e fofo; o impacto e "puf", nao estilhaco.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// rastro de estrelas no que voa, e o rescaldo e estrelinha caindo e piscando.
//
//   T1 Fairy Wind     um vento-espiral de estrelinhas corre ate o alvo.
//   T2 Draining Kiss  um beijo-coracao voa, estoura em coracoezinhos e o
//                     brilho volta pra quem lancou.
//   T3 Moonblast      uma lua cheia se forma no alto, desce no alvo e
//                     explode numa chuva de estrelas.
//   T4 Play Rough     a nuvem de briga do desenho: bolotas fofas girando com
//                     estrelas e coracoes pulando pra fora.
//   A1 Disarming Voice aneis-coracao saem de quem lanca; cada um no interior
//                     ganha um coracaozinho que estoura.
//   A2 (Expl. Elem.)  chuva de estrelas pelo interior; cada uma pousa piscando.
//   A3 (critico)      lua enorme no alto; um feixe de luar desce em cada
//                     ponto do interior.
import { comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, cresce, em, encolhe, escalaDaArea, fila, interior, pintarBolas, sortear, TAU } from './comum'

const BRANCO = '#ffffff'

type Peca = { x: number; y: number; r: number; giro?: number }

/** Estrelas de 5 pontas em 3 camadas (contorno, base, nucleo). */
function estrelas(ctx: CanvasRenderingContext2D, lista: readonly Peca[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.nucleo, 0.5]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const e of lista) {
      if (e.r < 0.8) continue
      const g = (e.giro ?? 0) - Math.PI / 2
      for (let i = 0; i < 10; i++) {
        const a = g + (i / 10) * TAU, r = (i % 2 ? e.r * 0.45 : e.r) * k
        const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      }
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Coracoes: duas bolas + ponta, em 3 camadas. */
function coracoes(ctx: CanvasRenderingContext2D, lista: readonly Peca[], pele: Pele): void {
  for (const [cor, k, dy] of [[pele.contorno, 1.3, 0], [pele.base, 1, 0], [pele.nucleo, 0.4, -0.35]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const h of lista) {
      const r = h.r * k
      if (r < 0.6) continue
      const x = h.x + (dy ? -h.r * 0.35 : 0), y = h.y + dy * h.r
      if (dy) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU); continue }
      ctx.moveTo(h.x, h.y + r * 1.15)
      ctx.lineTo(h.x - r * 1.05, h.y)
      ctx.arc(h.x - r * 0.5, h.y - r * 0.15, r * 0.58, Math.PI * 0.9, Math.PI * 2.05)
      ctx.arc(h.x + r * 0.5, h.y - r * 0.15, r * 0.58, Math.PI * 0.95, Math.PI * 2.1)
      ctx.lineTo(h.x, h.y + r * 1.15)
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Lua cheia: disco claro com mar escuro de um lado e halo. */
function lua(ctx: CanvasRenderingContext2D, p: Ponto, r: number, pele: Pele): void {
  if (r < 1) return
  pintarBolas(ctx, [{ x: p.x, y: p.y, r }], [[pele.contorno, 1.18, 0], [pele.meio, 1, 0], [pele.nucleo, 0.82, -0.12], [BRANCO, 0.35, -0.35]])
  // Mares: duas manchas na cor do meio, pra a lua nao ser so uma bola.
  ctx.fillStyle = pele.meio
  ctx.beginPath()
  ctx.arc(p.x + r * 0.3, p.y + r * 0.2, r * 0.22, 0, TAU)
  ctx.moveTo(p.x - r * 0.05 + r * 0.14, p.y + r * 0.45)
  ctx.arc(p.x - r * 0.05, p.y + r * 0.45, r * 0.14, 0, TAU)
  ctx.fill()
}

/** Estrelinhas do rescaldo: caem devagar balancando e piscam ate sumir. */
function estrelinhasCaindo(p: Ponto, t0: number, ms: number, sem: readonly number[], k = 1): Peca[] {
  const out: Peca[] = []
  for (let i = 0; i * 3 + 2 < sem.length; i++) {
    const t = (ms - t0 - i * 40) / 460
    if (t < 0 || t > 1) continue
    const pisca = Math.floor((ms + i * 47) / 80) % 3 === 0 ? 0.55 : 1
    out.push({
      x: p.x + (sem[i * 3] - 0.5) * 30 * k + Math.sin(t * 7 + i) * 2,
      y: p.y - 10 * k + em(sem[i * 3 + 1], -4, 6) * k + 14 * k * t,
      r: em(sem[i * 3 + 2], 1.8, 2.8) * Math.min(k, 1.6) * pisca * encolhe(t),
      giro: t * 3 + i,
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// T1 — FAIRY WIND
// ---------------------------------------------------------------------------

const VENTO_SAI = 80
const VENTO_CHEGA = 300

function fairyWind(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCaindo = sortear(rng, 6 * 3)
  const b = { x: origem.x + Math.cos(c.angulo) * 6, y: origem.y - 4 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy) || 1
  const nx = -dy / d, ny = dx / d
  // Doze estrelinhas em espiral: cada uma gira em volta do eixo do vento.
  const lista: Peca[] = []
  for (let i = 0; i < 12; i++) {
    const u = (ms - VENTO_SAI - i * 22) / (VENTO_CHEGA - VENTO_SAI)
    if (u < 0 || u > 1.15) continue
    const uu = Math.min(1, u)
    const giro = uu * TAU * 1.5 + i * 0.9
    const raio = 6 * Math.sin(Math.PI * uu) + (u > 1 ? (u - 1) * 60 : 0)
    lista.push({ x: b.x + dx * uu + nx * Math.cos(giro) * raio, y: b.y + dy * uu + ny * Math.cos(giro) * raio - Math.sin(giro) * raio * 0.4, r: 2.6 * (u > 1 ? encolhe((u - 1) / 0.15, 1) : 1), giro: u * 6 })
  }
  lista.push(...estrelinhasCaindo(alvo, VENTO_CHEGA + 60, ms, semCaindo))
  estrelas(ctx, lista, pele)
}

// ---------------------------------------------------------------------------
// T2 — DRAINING KISS
// ---------------------------------------------------------------------------

const BEIJO_SAI = 140
const BEIJO_CHEGA = 360
const BEIJO_VOLTA = 520

function drainingKiss(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCoracoes = sortear(rng, 8 * 2)
  const semVolta = sortear(rng, 6)
  const b = { x: origem.x + Math.cos(c.angulo) * 6, y: origem.y - 8 }
  const lista: Peca[] = []
  // O beijo: coracao que cresce na boca e flutua ondulando ate o alvo.
  const u = (ms - BEIJO_SAI) / (BEIJO_CHEGA - BEIJO_SAI)
  if (ms < BEIJO_CHEGA) {
    const cresce = saida(limitar(ms / BEIJO_SAI))
    const uu = Math.max(0, u)
    lista.push({ x: b.x + (alvo.x - b.x) * uu, y: b.y + (alvo.y - b.y) * uu + Math.sin(uu * TAU) * 4, r: 4.4 * cresce })
  }
  // Estoura em oito coracoezinhos.
  const te = (ms - BEIJO_CHEGA) / 380
  if (te >= 0 && te <= 1) {
    for (let i = 0; i < 8; i++) {
      const a = semCoracoes[i * 2] * TAU, dd = em(semCoracoes[i * 2 + 1], 8, 18) * saida(te)
      lista.push({ x: alvo.x + Math.cos(a) * dd, y: alvo.y + Math.sin(a) * dd * 0.8 - 6 * te, r: 2.2 * encolhe(te) })
    }
  }
  coracoes(ctx, lista, pele)
  // O dreno: brilho que volta pra quem lancou, em fila.
  const brilhos: Peca[] = []
  for (let i = 0; i < 6; i++) {
    const t = (ms - BEIJO_VOLTA - i * 40) / 300
    if (t < 0 || t > 1) continue
    const off = (semVolta[i] - 0.5) * 10
    brilhos.push({ x: alvo.x + (b.x - alvo.x) * saida(t), y: alvo.y + (b.y - alvo.y) * saida(t) + off * Math.sin(Math.PI * t), r: 2 * encolhe(t, 0.3), giro: t * 5 })
  }
  estrelas(ctx, brilhos, pele)
}

// ---------------------------------------------------------------------------
// T3 — MOONBLAST
// ---------------------------------------------------------------------------

const LUA_FORMA = 60
const LUA_DESCE = 380
const LUA_BATE = 560

function moonblast(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEstrelas = sortear(rng, 12 * 3)
  const semCaindo = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const alto = { x: origem.x + (alvo.x - origem.x) * 0.3, y: origem.y - 30 }
  // A lua se forma no alto (cresce e brilha) e desce em arco ate o alvo.
  if (ms < LUA_BATE) {
    const forma = saida(limitar((ms - LUA_FORMA) / 220))
    const u = entrada(limitar((ms - LUA_DESCE) / (LUA_BATE - LUA_DESCE)))
    const p = { x: alto.x + (alvo.x - alto.x) * u, y: alto.y + (alvo.y - alto.y) * u }
    lua(ctx, p, 7 * forma, pele)
  }
  // Explosao: estrelas saem girando em todas as direcoes, e depois caem piscando.
  const lista: Peca[] = []
  const te = (ms - LUA_BATE) / 460
  if (te >= 0 && te <= 1) {
    for (let i = 0; i < 12; i++) {
      const a = semEstrelas[i * 3] * TAU, dd = em(semEstrelas[i * 3 + 1], 12, 28) * saida(te)
      lista.push({ x: alvo.x + Math.cos(a) * dd, y: alvo.y + Math.sin(a) * dd * 0.8 + 8 * te * te, r: em(semEstrelas[i * 3 + 2], 2.2, 3.4) * encolhe(te), giro: te * 6 + i })
    }
  }
  lista.push(...estrelinhasCaindo(alvo, LUA_BATE + 300, ms, semCaindo, 1.2))
  estrelas(ctx, lista, pele)
  if (ms >= LUA_BATE && ms < LUA_BATE + 220) estrelaDeImpacto(ctx, alvo, 18, (ms - LUA_BATE) / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — PLAY ROUGH (critico do T3)
// ---------------------------------------------------------------------------

const BRIGA_INICIO = 160
const BRIGA_FIM = 1100

function playRough(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semNuvem = sortear(rng, 9 * 2)
  const semPulos = sortear(rng, 10 * 3)
  const semEstrela = sortear(rng, 9)
  const centro = { x: alvo.x, y: alvo.y - 2 }
  // A nuvem de briga: nove bolotas fofas que giram e pulsam em volta do alvo.
  const t = (ms - BRIGA_INICIO) / (BRIGA_FIM - BRIGA_INICIO)
  if (t >= 0 && t <= 1) {
    const forte = saida(limitar(t * 5)) * encolhe(t, 0.25)
    const bolotas: Peca[] = []
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + ms * 0.006
      const pulsa = 1 + 0.18 * Math.sin(ms * 0.03 + semNuvem[i * 2] * 9)
      bolotas.push({ x: centro.x + Math.cos(a) * 11 * forte, y: centro.y + Math.sin(a) * 7 * forte, r: em(semNuvem[i * 2 + 1], 5, 7.5) * pulsa * forte })
    }
    pintarBolas(ctx, bolotas, [[pele.contorno, 1.15, 0], [pele.meio, 1, 0], [pele.nucleo, 0.55, -0.3]])
  }
  // Coisas pulando pra fora da nuvem: estrela, coracao, estrela...
  const estrelasFora: Peca[] = [], coracoesFora: Peca[] = []
  for (let i = 0; i < 10; i++) {
    const t0 = BRIGA_INICIO + 80 + i * 85
    const u = (ms - t0) / 380
    if (u < 0 || u > 1) continue
    const a = -Math.PI / 2 + (semPulos[i * 3] - 0.5) * 2.6, v = em(semPulos[i * 3 + 1], 18, 28)
    const p = { x: centro.x + Math.cos(a) * v * u, y: centro.y + Math.sin(a) * v * u + 22 * u * u, r: em(semPulos[i * 3 + 2], 2.4, 3.4) * encolhe(u), giro: u * 8 }
    if (i % 3 === 1) coracoesFora.push(p); else estrelasFora.push(p)
  }
  estrelas(ctx, estrelasFora, pele)
  coracoes(ctx, coracoesFora, pele)
  if (ms >= BRIGA_INICIO + 120 && ms < BRIGA_INICIO + 360) estrelaDeImpacto(ctx, centro, 20, (ms - BRIGA_INICIO - 120) / 240, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A1 — DISARMING VOICE: aneis-coracao + coracaozinho estourando em cada ponto.
const VOZ_ONDAS = [80, 280] as const

function disarmingVoice(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  // Ondas: coracoes em anel que abrem do centro ate a borda.
  const lista: Peca[] = []
  VOZ_ONDAS.forEach(t0 => {
    const t = (ms - t0) / 600
    if (t < 0 || t > 1) return
    const r = raio * saida(t)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + t
      lista.push({ x: centro.x + Math.cos(a) * r, y: centro.y + 12 + Math.sin(a) * r * 0.45 - 6, r: 2.6 * k * 0.6 * encolhe(t, 0.3) })
    }
  })
  // Cada ponto: um coracao que salta e estoura quando a onda passa.
  pontos.forEach(({ p, d }) => {
    const t = (ms - chegaEm(VOZ_ONDAS[0], 600, d, raio)) / 360
    if (t >= 0 && t <= 1) lista.push({ x: p.x, y: p.y - 10 - 10 * saida(t), r: 3.4 * k * 0.6 * cresce(t, 0.3) * encolhe(t, 0.3) })
  })
  coracoes(ctx, lista, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): chuva de estrelas no interior.
const CHUVA_INICIO = 100

function chuvaDeEstrelas(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semRitmo = sortear(rng, 12)
  const semPousos = pontos.map(() => sortear(rng, 4 * 3))
  const lista: Peca[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(CHUVA_INICIO, 500, d, raio) + semRitmo[i] * 80
    // Cai do alto girando, com um rastro curto de estrelinhas.
    const u = (ms - t0) / 260
    if (u >= 0 && u < 1) {
      for (let j = 0; j < 3; j++) {
        const uu = Math.max(0, u - j * 0.1)
        lista.push({ x: p.x + (1 - uu) * 20, y: p.y - 10 - (1 - entrada(uu)) * 70 * k * 0.6, r: (6 - j * 1.4) * k * 0.6, giro: uu * 8 })
      }
    }
    // Pousa e solta estrelinhas piscando.
    lista.push(...estrelinhasCaindo({ x: p.x, y: p.y + 4 }, t0 + 260, ms, semPousos[i], k * 0.8))
  })
  estrelas(ctx, lista, pele)
}

// A3 — (critico): lua no alto + feixe de luar em cada ponto do interior.
const LUAR_LUA = 60
const LUAR_FEIXES = 420

function luar(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  const semRitmo = sortear(rng, 10)
  const semCaindo = pontos.map(() => sortear(rng, 3 * 3))
  // A lua: grande, no alto do centro, cresce e some no fim.
  const t = (ms - LUAR_LUA) / 1300
  // Feixes de luar: colunas claras que descem em cada ponto, uma por vez.
  const luaP = { x: centro.x, y: centro.y - 70 }
  const feixes: { x: number; y: number; w: number; u: number }[] = []
  const lista: Peca[] = []
  pontos.forEach(({ p }, i) => {
    const t0 = LUAR_FEIXES + i * 60 + semRitmo[i] * 40
    const tf = (ms - t0) / 360
    if (tf >= 0 && tf <= 1) feixes.push({ x: p.x, y: p.y, w: 6 * k * 0.6 * encolhe(tf, 0.5), u: saida(limitar(tf * 3)) })
    lista.push(...estrelinhasCaindo({ x: p.x, y: p.y + 2 }, t0 + 200, ms, semCaindo[i], k * 0.6))
  })
  // Feixe: da lua ate o ponto, fino em cima e largo no chao, descendo rapido.
  for (const [cor, kk] of [[pele.base, 1.5], [pele.nucleo, 1], [BRANCO, 0.35]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const f of feixes) {
      const w = f.w * kk
      if (w < 0.4) continue
      const bx = luaP.x + (f.x - luaP.x) * f.u, by = luaP.y + (f.y - luaP.y) * f.u
      ctx.moveTo(luaP.x - w * 0.15, luaP.y); ctx.lineTo(luaP.x + w * 0.15, luaP.y); ctx.lineTo(bx + w, by); ctx.lineTo(bx - w, by); ctx.closePath()
    }
    ctx.fill()
  }
  // A lua por cima dos feixes: eles nascem dela.
  if (t >= 0 && t <= 1) lua(ctx, luaP, 16 * saida(limitar(t * 4)) * encolhe(t, 0.25), pele)
  estrelas(ctx, lista, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DA_FADA = {
  single: { 1: 'fairy_wind', 2: 'draining_kiss', 3: 'moonblast', 4: 'play_rough' },
  area: { 1: 'disarming_voice', 2: 'aoe50_fairy', 3: 'aoe50_fairy' },
} as const

export const FADA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: fairyWind, duracao: { 1: 1000 }, alcance: 30, impactos: { 1: [VENTO_CHEGA] } },
  2: { desenhar: drainingKiss, duracao: { 2: 1000 }, alcance: 34, impactos: { 2: [BEIJO_CHEGA] } },
  3: { desenhar: moonblast, duracao: { 3: 1700 }, alcance: 50, impactos: { 3: [LUA_BATE] } },
  4: { desenhar: playRough, duracao: { 4: 1300 }, alcance: 44, margem: { cima: 44, baixo: 60, lados: 44 }, impactos: { 4: [BRIGA_INICIO + 120, BRIGA_INICIO + 500] } },
}, false)

export const FADA_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: disarmingVoice, duracao: { 1: 1100 }, alcance: 30, impactos: { 1: [VOZ_ONDAS[0] + 200] } },
  2: { desenhar: chuvaDeEstrelas, duracao: { 2: 1500 }, alcance: 175, margem: { cima: 115, baixo: 20, lados: 20 }, impactos: { 2: [CHUVA_INICIO + 260] } },
  3: { desenhar: luar, duracao: { 3: 1700 }, alcance: 110, impactos: { 3: [LUAR_FEIXES, LUAR_FEIXES + 500] } },
}, true)
