// AGUA — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (o que separa de fogo e raio sem olhar a cor):
//   - PESO. Fogo sobe, raio e instantaneo; agua CAI. Toda gota tem gravidade
//     (arco balistico em forma fechada) e respinga quando bate.
//   - gota de verdade: cabeca redonda na frente, cauda fina pra tras, apontada
//     pela velocidade DO INSTANTE (vira pra baixo quando comeca a cair).
//   - jato e corpo continuo que ondula, nao fila de particulas soltas.
//   - o impacto e uma COROA de respingo: gotas lancadas pra cima em leque que
//     voltam pro chao. Nunca estrela como corpo — estrela so no T3/T4.
//
// TEXTURA: `massaEmCamadas` com forma de gota (contorno, base, meio, nucleo),
// todas as gotas de um quadro fundidas numa massa so — o mesmo truque que o
// fogo usa, mas com a forma e a fisica da agua.
//
//   T1 Water Gun     tres esguichos curtos em arco, cada um respinga no alvo.
//   T2 Water Pulse   esfera de agua tremulando voa e estoura numa coroa.
//   T3 Scald         jato grosso em arco (parabola) + vapor subindo do alvo.
//   T4 Hydro Pump    gotas SUGADAS formam a esfera; jato de pressao enorme com
//                    espuma na boca; o alvo some numa coroa gigante e a agua
//                    chove em volta.
//   A1 Bubble        bolhas tremulando se espalham pela area e estouram nela toda
//                    (metade na borda, marcando o limite).
//   A2 Surf          onda em anel que corre do centro ate a borda e quebra nela.
//   A3 Water Spout   tromba d'agua sobe do corpo, desaba em chuva sobre a area e
//                    geiseres explodem em volta da borda.
//
// AREA mostra o alcance (pedido do dono, 29/09): a borda da elipse (raio 175)
// sempre aparece — bolhas estourando, onda quebrando, geiseres.
import { estrelaDeImpacto, limitar, massaEmCamadas, riscos, saida, type Bolha } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))
/** Gravidade em unidades/ms² — gota de 0,12 u/ms pra cima volta ao chao em ~240 ms. */
const G = 0.001

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

// ---------------------------------------------------------------------------
// Gota balistica sem estado
// ---------------------------------------------------------------------------

interface Lance { x: number; y: number; vx: number; vy: number; r: number; vida: number; t0: number; g?: number; chao?: number }

/**
 * Onde a gota esta em `ms`, com a cauda apontada pela velocidade do instante.
 * `chao` e o y em que ela some (bateu no chao). Encolhe no fim da vida.
 */
function gota(l: Lance, ms: number): Bolha | null {
  const t = ms - l.t0
  if (t < 0 || t > l.vida) return null
  const g = l.g ?? G
  const y = l.y + l.vy * t + 0.5 * g * t * t
  if (l.chao !== undefined && y > l.chao) return null
  const vy = l.vy + g * t
  const f = t / l.vida
  return { x: l.x + l.vx * t, y, r: l.r * (f < 0.75 ? 1 : 1 - (f - 0.75) / 0.25), ang: Math.atan2(vy, l.vx) }
}

function pintarGotas(ctx: CanvasRenderingContext2D, gotas: readonly Bolha[], pele: Pele): void {
  if (gotas.length) massaEmCamadas(ctx, gotas, pele, 'gota', 4)
}

/**
 * Coroa de respingo: `n` gotas lancadas pra cima em leque a partir de `p`,
 * com gravidade, caindo ate o chao (`p.y + queda`). E o impacto da agua.
 * `forca` escala velocidade e tamanho.
 */
function coroa(ms: number, p: Ponto, t0: number, n: number, forca: number, sem: readonly number[], queda = 14, abertura = 1.2): Bolha[] {
  const out: Bolha[] = []
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + em(sem[i * 3], -abertura, abertura)
    const v = em(sem[i * 3 + 1], 0.07, 0.15) * forca
    const b = gota({ x: p.x + em(sem[i * 3 + 2], -3, 3) * forca, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: em(sem[i * 3 + 2], 1.3, 2.2) * Math.sqrt(forca), vida: 600, t0, chao: p.y + queda * forca }, ms)
    if (b) out.push(b)
  }
  return out
}

/**
 * Jato: corpo continuo de `a` ate `b` que ondula, desenhado como gotas grandes
 * sobrepostas ao longo do caminho (a massa em camadas funde tudo num tubo).
 * `arco` levanta o meio (parabola); `ate` 0..1 e quanto do caminho ja foi coberto
 * (a frente do jato); `de` 0..1 e a cauda (o jato cortando no fim).
 */
function jato(ms: number, a: Ponto, b: Ponto, espessura: number, arco: number, de: number, ate: number, fase: number, n = 18): Bolha[] {
  const out: Bolha[] = []
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1
  const nx = -dy / L, ny = dx / L
  for (let i = 0; i <= n; i++) {
    const u = i / n
    if (u < de || u > ate) continue
    const onda = Math.sin(u * 9 - ms * 0.03 + fase) * espessura * 0.25
    const x = a.x + dx * u + nx * onda, y = a.y + dy * u + ny * onda - Math.sin(Math.PI * u) * arco
    // Tangente do arco: a cauda das gotas fica pra tras, o tubo "corre".
    const ang = Math.atan2(dy - Math.cos(Math.PI * u) * Math.PI * arco, dx)
    // Afina na boca, engrossa no meio, abre na frente.
    const r = espessura * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.4)))
    out.push({ x, y, r, ang })
  }
  return out
}

/** Bolha: circulo com contorno, miolo claro e o brilho no canto. Tremula de largura. */
function pintarBolhas(ctx: CanvasRenderingContext2D, bolhas: readonly { x: number; y: number; r: number; w: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.meio, 1], [pele.nucleo, 0.78]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const b of bolhas) { const r = b.r * k; ctx.moveTo(b.x + r * b.w, b.y); ctx.ellipse(b.x, b.y, r * b.w, r / b.w, 0, 0, TAU) }
    ctx.fill()
  }
  ctx.fillStyle = pele.base; ctx.beginPath()
  for (const b of bolhas) { const r = b.r * 0.55; ctx.moveTo(b.x + r * b.w, b.y + b.r * 0.1); ctx.ellipse(b.x, b.y + b.r * 0.1, r * b.w, r / b.w, 0, 0, TAU) }
  ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.beginPath()
  for (const b of bolhas) { const r = Math.max(0.6, b.r * 0.22); ctx.moveTo(b.x - b.r * 0.35 + r, b.y - b.r * 0.4); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.4, r, 0, TAU) }
  ctx.fill()
}

/** Esfera de agua: massa redonda que tremula (raio oscila), com brilho. */
function esferaDeAgua(ctx: CanvasRenderingContext2D, p: Ponto, r: number, ms: number, pele: Pele): void {
  const w = 1 + Math.sin(ms * 0.045) * 0.12
  pintarBolhas(ctx, [{ x: p.x, y: p.y, r, w }], pele)
}

/** Vapor do Scald: bolotas claras subindo e inchando. So nucleo e meio — vapor nao tem o azul da agua. */
function vapor(ctx: CanvasRenderingContext2D, ms: number, p: Ponto, t0: number, t1: number, sem: readonly number[], pele: Pele): void {
  const bolotas: { x: number; y: number; r: number }[] = []
  for (let i = 0; i * 3 < sem.length; i++) {
    const nasce = t0 + (i / (sem.length / 3)) * (t1 - t0)
    const t = (ms - nasce) / 500
    if (t < 0 || t >= 1) continue
    bolotas.push({ x: p.x + em(sem[i * 3], -8, 8) + Math.sin(t * 5 + i) * 2, y: p.y - 4 - t * 22, r: em(sem[i * 3 + 1], 1.5, 2.6) * (0.6 + t) * (1 - t * t) })
  }
  for (const [cor, k] of [[pele.base, 1.2], [pele.meio, 1], [pele.nucleo, 0.6]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const b of bolotas) { const r = b.r * k; if (r > 0.3) { ctx.moveTo(b.x + r, b.y); ctx.arc(b.x, b.y, r, 0, TAU) } }
    ctx.fill()
  }
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })

// ---------------------------------------------------------------------------
// T1 — WATER GUN: tres esguichos curtos em arco
// ---------------------------------------------------------------------------

const GUN_SAIDAS = [0, 110, 220] as const
const GUN_VOO = 150

function waterGun(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semMira = sortear(rng, GUN_SAIDAS.length * 2)
  const semCoroas = GUN_SAIDAS.map(() => sortear(rng, 7 * 3))
  const gotas: Bolha[] = []
  GUN_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + em(semMira[i * 2], -5, 5), y: alvo.y + em(semMira[i * 2 + 1], -4, 4) }
    const t = (ms - sai) / GUN_VOO
    // O esguicho e um jato curto que ANDA: frente e cauda avancam juntas.
    if (t >= 0 && t < 1.3) gotas.push(...jato(ms, b, fim, 2.4, 5, Math.max(0, t - 0.45), Math.min(1, t), i * 2, 12))
    gotas.push(...coroa(ms, fim, sai + GUN_VOO, 7, 0.8, semCoroas[i]))
  })
  pintarGotas(ctx, gotas, pele)
}

// ---------------------------------------------------------------------------
// T2 — WATER PULSE: esfera tremulando que estoura numa coroa
// ---------------------------------------------------------------------------

const PULSE_SAI = 140
const PULSE_CHEGA = 360

function waterPulse(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semRastro = sortear(rng, 12 * 3)
  const semCoroa = sortear(rng, 16 * 3)
  const semAnel = sortear(rng, 12 * 2)
  const gotas: Bolha[] = []
  if (ms < PULSE_SAI) esferaDeAgua(ctx, b, 1.5 + 3 * saida(ms / PULSE_SAI), ms, pele)
  else if (ms < PULSE_CHEGA) {
    const u = (ms - PULSE_SAI) / (PULSE_CHEGA - PULSE_SAI)
    const p = { x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u - Math.sin(Math.PI * u) * 4 }
    esferaDeAgua(ctx, p, 4.5, ms, pele)
  }
  // Gotinhas que a esfera vai perdendo pelo caminho e caem.
  for (let i = 0; i < 12; i++) {
    const quando = PULSE_SAI + (i / 12) * (PULSE_CHEGA - PULSE_SAI)
    const u = (quando - PULSE_SAI) / (PULSE_CHEGA - PULSE_SAI)
    const g = gota({ x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u - Math.sin(Math.PI * u) * 4 + 3, vx: em(semRastro[i * 3], -0.02, 0.02), vy: em(semRastro[i * 3 + 1], -0.02, 0.01), r: em(semRastro[i * 3 + 2], 0.9, 1.5), vida: 260, t0: quando }, ms)
    if (g) gotas.push(g)
  }
  // Estouro: um anel de gotas voa PRA FORA no plano (a esfera se desfaz) e a coroa sobe.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + semAnel[i * 2] * 0.4, v = em(semAnel[i * 2 + 1], 0.09, 0.13)
    const g = gota({ x: alvo.x, y: alvo.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 0.05, r: 2.2, vida: 380, t0: PULSE_CHEGA }, ms)
    if (g) gotas.push(g)
  }
  gotas.push(...coroa(ms, alvo, PULSE_CHEGA + 20, 16, 1.1, semCoroa))
  pintarGotas(ctx, gotas, pele)
}

// ---------------------------------------------------------------------------
// T3 — SCALD: jato grosso em parabola + vapor
// ---------------------------------------------------------------------------

const SCALD_INICIO = 150
const SCALD_CHEGA = 260
const SCALD_FIM = 640

function scald(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semCoroas = Array.from({ length: 5 }, () => sortear(rng, 8 * 3))
  const semVapor = sortear(rng, 14 * 3)
  const semEstrela = sortear(rng, 9)
  const gotas: Bolha[] = []
  if (ms < SCALD_INICIO) esferaDeAgua(ctx, b, 1 + 2.5 * saida(ms / SCALD_INICIO), ms, pele)
  if (ms >= SCALD_INICIO && ms < SCALD_FIM + 120) {
    const ate = limitar((ms - SCALD_INICIO) / (SCALD_CHEGA - SCALD_INICIO))
    const de = limitar((ms - SCALD_FIM) / 120)
    gotas.push(...jato(ms, b, alvo, 3.6, 12, de, ate, 0, 22))
  }
  // Enquanto o jato bate, uma coroa nova a cada 80 ms: o alvo "ferve" de respingo.
  for (let i = 0; i < 5; i++) gotas.push(...coroa(ms, alvo, SCALD_CHEGA + i * 80, 8, 1, semCoroas[i]))
  pintarGotas(ctx, gotas, pele)
  vapor(ctx, ms, alvo, SCALD_CHEGA + 60, SCALD_FIM + 150, semVapor, pele)
  const e = ms - SCALD_CHEGA
  if (e >= 0 && e < 200) estrelaDeImpacto(ctx, alvo, 13, e / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — HYDRO PUMP: a pressao inteira de um rio num jato
// ---------------------------------------------------------------------------
//
//   carga     gotas SUGADAS de todo lado em arco pra dentro da esfera, que incha.
//   disparo   jato de pressao GROSSO (dois tubos torcidos), espuma branca na
//             boca e o atacante recuando por tras (gotas voando pra tras).
//   impacto   o alvo some numa coroa gigante de 40 gotas, estrela grande e
//             riscos; a agua respingada CHOVE em volta por meio segundo.

const PUMP_CARGA = 380
const PUMP_CHEGA = 470
const PUMP_FIM = 950

function hydroPump(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semSuga = sortear(rng, 22 * 3)
  const semTras = sortear(rng, 14 * 3)
  const semCoroa = sortear(rng, 40 * 3)
  const semBatida = Array.from({ length: 6 }, () => sortear(rng, 8 * 3))
  const semChuva = sortear(rng, 30 * 3)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 14 * 3)
  const semParede = sortear(rng, 24 * 3)
  const gotas: Bolha[] = []

  // Carga: gotas nascem num anel de 30 e sao puxadas em arco pra esfera.
  if (ms < PUMP_CARGA) {
    for (let i = 0; i < 22; i++) {
      const nasce = semSuga[i * 3 + 2] * (PUMP_CARGA - 140)
      const t = (ms - nasce) / 140
      if (t < 0 || t >= 1) continue
      const a = semSuga[i * 3] * TAU, d = 30 * (1 - saida(t))
      const giro = a + saida(t) * 1.4 // espiral: a agua gira ao ser puxada
      gotas.push({ x: b.x + Math.cos(giro) * d, y: b.y + Math.sin(giro) * d * 0.8, r: em(semSuga[i * 3 + 1], 1.2, 2) * (1 - t * 0.4), ang: giro + Math.PI * 0.6 })
    }
    esferaDeAgua(ctx, b, 1.5 + 5 * saida(ms / PUMP_CARGA), ms, pele)
  }
  // Jato de pressao: dois tubos torcidos um no outro (fases opostas) = corpo grosso.
  if (ms >= PUMP_CARGA && ms < PUMP_FIM + 140) {
    const ate = limitar((ms - PUMP_CARGA) / (PUMP_CHEGA - PUMP_CARGA))
    const de = limitar((ms - PUMP_FIM) / 140)
    const k = ms < PUMP_FIM - 150 ? 1 : 1 - 0.35 * limitar((ms - (PUMP_FIM - 150)) / 150)
    gotas.push(...jato(ms, b, alvo, 9 * k, 3, de, ate, 0, 26), ...jato(ms, b, alvo, 6.5 * k, 3, de, ate, Math.PI, 26))
    // Recuo: gotas espirrando pra TRAS de quem lanca (a pressao empurra).
    for (let i = 0; i < 14; i++) {
      const quando = PUMP_CARGA + (i / 14) * (PUMP_FIM - PUMP_CARGA)
      const a = c.angulo + Math.PI + em(semTras[i * 3], -0.7, 0.7), v = em(semTras[i * 3 + 1], 0.08, 0.14)
      const g = gota({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.06, r: em(semTras[i * 3 + 2], 1.2, 2), vida: 320, t0: quando }, ms)
      if (g) gotas.push(g)
    }
  }
  // Impacto: coroa gigante + batidas continuas enquanto o jato bate.
  gotas.push(...coroa(ms, alvo, PUMP_CHEGA, 40, 2.4, semCoroa, 16, 1.4))
  // Parede d'agua: o jato bate e a agua sobe ALTA atras do alvo, quase reta.
  gotas.push(...coroa(ms, { x: alvo.x + Math.cos(c.angulo) * 6, y: alvo.y }, PUMP_CHEGA + 30, 24, 3.2, semParede, 16, 0.35))
  for (let i = 0; i < 6; i++) gotas.push(...coroa(ms, alvo, PUMP_CHEGA + 60 + i * 70, 8, 1.3, semBatida[i]))
  // Chuva: o que subiu desce em volta do alvo, gotas finas caindo reto.
  for (let i = 0; i < 30; i++) {
    const quando = PUMP_CHEGA + 200 + semChuva[i * 3] * 500
    const x = alvo.x + em(semChuva[i * 3 + 1], -40, 40), y0 = alvo.y - 50 - semChuva[i * 3 + 2] * 30
    const g = gota({ x, y: y0, vx: 0, vy: 0.08, r: em(semChuva[i * 3 + 2], 0.9, 1.4), vida: 700, t0: quando, g: 0.0006, chao: alvo.y + 14 }, ms)
    if (g) gotas.push(g)
  }
  pintarGotas(ctx, gotas, pele)
  const e = ms - PUMP_CHEGA
  // Espuma na boca: o branco da pressao, um disco chapado que pulsa.
  if (ms >= PUMP_CARGA && ms < PUMP_FIM) {
    const r = 3.5 + Math.sin(ms * 0.06) * 0.8
    ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(b.x, b.y, r + 1.2, 0, TAU); ctx.fill()
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill()
  }
  if (e >= 0 && e < 300) estrelaDeImpacto(ctx, alvo, 26, e / 300, pele, fila(semEstrela))
  if (e >= 0 && e < 420) riscos(ctx, alvo, 14, 44, e / 420, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175
// ---------------------------------------------------------------------------

const escalaDaArea = (r: number) => Math.max(1, r / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

/**
 * Onda: anel de agua deitado no chao que corre do centro ate `ate` (0..1 do
 * raio). A crista e feita de gotas grandes em volta, com a espuma (nucleo)
 * por cima; quando chega na borda ela QUEBRA — cada ponto da crista vira uma
 * coroa. Mostra o alcance.
 */
function onda(ms: number, centro: Ponto, R: number, t0: number, dura: number, n: number, k: number, sem: readonly number[]): Bolha[] {
  const out: Bolha[] = []
  const t = (ms - t0) / dura
  if (t >= 0 && t < 1) {
    const d = R * saida(t) * 0.98
    // Gotas suficientes pra crista ser uma FAIXA continua, nao pontilhado:
    // uma a cada ~6 unidades do perimetro da elipse, grandes o bastante pra
    // se encostarem. Mais densa que isso custava 6 ms no Surf (o AoE do nivel 50).
    const m = Math.max(12, Math.ceil((TAU * d * 0.75) / 6))
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU
      const alto = (3 + Math.sin(a * 5 + ms * 0.02) * 0.9) * k * (0.6 + 0.4 * t)
      // Corpo da onda (mais baixo, por dentro) e crista (mais alta, na frente).
      const p = noChao(centro, a, d)
      out.push({ x: p.x, y: p.y - alto * 0.7, r: alto * 1.05, ang: -Math.PI / 2 + Math.cos(a) * 0.9 })
    }
  }
  // Quebra na borda: coroas em volta da elipse inteira.
  if (ms >= t0 + dura * 0.85) {
    for (let i = 0; i < n; i += 2) {
      const a = (i / n) * TAU
      out.push(...coroa(ms, noChao(centro, a, R * 0.97), t0 + dura * 0.85 + (i % 4) * 15, 3, k * 0.75, sem.slice((i / 2) * 9, (i / 2) * 9 + 9), 10, 0.8))
    }
  }
  return out
}

// A1 — BUBBLE: bolhas se espalham ate a borda e estouram nela
const BOLHAS = 26

function bubble(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const sem = sortear(rng, BOLHAS * 4)
  const semEstouro = Array.from({ length: BOLHAS }, () => sortear(rng, 4 * 3))
  const bolhas: { x: number; y: number; r: number; w: number }[] = []
  const gotas: Bolha[] = []
  for (let i = 0; i < BOLHAS; i++) {
    // Metade vai ate a borda em setores iguais (desenha o limite); a outra
    // metade estoura espalhada pelo INTERIOR numa espiral de Vogel — o golpe
    // pega todo mundo dentro, nao so quem esta na borda (dono, 30/09).
    const naBorda = i % 2 === 0, j = i >> 1, meio = BOLHAS >> 1
    const a = naBorda ? ((j + sem[i * 4] * 0.7) / meio) * TAU : j * ANGULO_DOURADO + sem[i * 4] * 0.4
    const d = naBorda ? em(sem[i * 4 + 3], 0.9, 1) : 0.85 * Math.sqrt((j + 0.5) / meio)
    // As de dentro chegam antes: o estouro corre do centro pra borda.
    const sai = sem[i * 4 + 1] * 120, dur = em(sem[i * 4 + 2], 380, 460) * (0.45 + 0.55 * d)
    const t = (ms - sai) / dur
    const fim = noChao(centro, a, R * d)
    if (t >= 0 && t < 1) {
      // Bolha nao anda reta: vai boiando, subindo e descendo.
      const u = saida(t)
      const x = centro.x + (fim.x - centro.x) * u, y = centro.y + (fim.y - 10 - centro.y) * u - Math.sin(t * Math.PI * 3 + i) * 3 * k
      bolhas.push({ x, y, r: em(sem[i * 4 + 3], 2.6, 3.8) * Math.min(k, 1.8) * (0.5 + 0.5 * u), w: 1 + Math.sin(ms * 0.04 + i) * 0.12 })
    }
    // Estoura na borda: 4 gotinhas pulando.
    gotas.push(...coroa(ms, { x: fim.x, y: fim.y - 10 }, sai + dur, 4, 0.7 * Math.min(k, 1.8), semEstouro[i], 10, 1.6))
  }
  pintarGotas(ctx, gotas, pele)
  pintarBolhas(ctx, bolhas, pele)
}

// A2 — SURF: a onda sai do corpo e corre ate a borda
const SURF_SAI = 120
const SURF_CORRE = 520

function surf(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const semOnda = sortear(rng, 16 * 9)
  const semSegunda = sortear(rng, 16 * 9)
  const semSobe = sortear(rng, 16 * 3)
  // Quem lanca: agua jorra do chao em volta dele antes da onda sair.
  const gotas = coroa(ms, { x: centro.x, y: centro.y + 8 }, 0, 16, 1.4, semSobe, 10, 1.5)
  gotas.push(...onda(ms, centro, R, SURF_SAI, SURF_CORRE, 32, k, semOnda))
  // Segunda onda, menor, logo atras: o mar nao manda uma so.
  gotas.push(...onda(ms, centro, R * 0.85, SURF_SAI + 180, SURF_CORRE * 0.9, 24, k * 0.6, semSegunda))
  gotas.sort((p, q) => p.y - q.y)
  pintarGotas(ctx, gotas, pele)
}

// A3 — WATER SPOUT: tromba sobe, chove na area, geiseres na borda
const SPOUT_SOBE = 380
/** 12 geiseres em volta da borda, explodindo em sequencia pelos dois lados. */
export const SPOUT_GEISERES = [600, 630, 630, 660, 660, 690, 690, 720, 720, 750, 750, 780] as const

function waterSpout(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = escalaDaArea(R)
  const semChuva = sortear(rng, 60 * 3)
  const semGeiser = Array.from({ length: SPOUT_GEISERES.length * 2 }, () => sortear(rng, 10 * 3))
  const semPoco = sortear(rng, 12 * 3)
  const semEstrela = sortear(rng, 9)
  const gotas: Bolha[] = []
  const chao = { x: centro.x, y: centro.y + 12 }
  const alto = 110 * Math.min(k, 1.6)
  // Tromba: coluna de gotas grandes subindo em espiral do corpo.
  if (ms < SPOUT_SOBE + 200) {
    const sobe = saida(limitar(ms / SPOUT_SOBE)), corta = limitar((ms - SPOUT_SOBE) / 200)
    const n = 30
    for (let i = 0; i < n; i++) {
      const u = i / n
      if (u > sobe || u < corta) continue
      const giro = u * 14 - ms * 0.02
      const larg = (6 + u * 12) * Math.min(k, 1.6)
      gotas.push({ x: chao.x + Math.sin(giro) * larg * 0.5, y: chao.y - u * alto, r: larg * 0.55, ang: -Math.PI / 2 })
    }
    gotas.push(...coroa(ms, { x: chao.x, y: chao.y - 4 }, 30, 12, 1.5, semPoco, 8, 1.5))
  }
  // Chuva: o topo desaba em 60 gotas sobre a area inteira.
  for (let i = 0; i < 60; i++) {
    const a = semChuva[i * 3] * TAU, d = R * Math.sqrt(semChuva[i * 3 + 1])
    const fim = noChao(centro, a, d)
    const quando = SPOUT_SOBE + semChuva[i * 3 + 2] * 300
    // Sai do topo da tromba em arco balistico ate o ponto do chao.
    const T = 360
    const x0 = chao.x, y0 = chao.y - alto
    const vx = (fim.x - x0) / T, vy = (fim.y - y0 - 0.5 * G * T * T) / T
    const g = gota({ x: x0, y: y0, vx, vy, r: em(semChuva[i * 3 + 2], 2, 3.2) * Math.min(k, 1.6), vida: T, t0: quando }, ms)
    if (g) gotas.push(g)
  }
  // Geiseres: 8 em volta da borda, em setores iguais, explodindo em sequencia.
  SPOUT_GEISERES.forEach((quando, i) => {
    // Ordem alternada pelos dois lados a partir da frente: a borda "fecha".
    const lado = i % 2 ? 1 : -1, passo = Math.ceil(i / 2)
    const a = Math.PI / 2 + lado * (passo / SPOUT_GEISERES.length) * TAU
    const p = noChao(centro, a, R * 0.95)
    // Pilar alto e estreito + saia larga: geiser, nao respingo.
    gotas.push(...coroa(ms, p, quando, 12, 2.8 * Math.min(k, 1.6) * 0.8, semGeiser[i * 2], 8, 0.25))
    gotas.push(...coroa(ms, p, quando + 50, 10, 1.4 * Math.min(k, 1.6) * 0.8, semGeiser[i * 2 + 1], 8, 1.3))
  })
  gotas.sort((p, q) => p.y - q.y)
  pintarGotas(ctx, gotas, pele)
  const e = ms - SPOUT_SOBE
  if (e >= 0 && e < 220) estrelaDeImpacto(ctx, { x: chao.x, y: chao.y - alto }, 14, e / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DA_AGUA = {
  single: { 1: 'water_gun', 2: 'water_pulse', 3: 'scald', 4: 'hydro_pump' },
  area: { 1: 'bubble', 2: 'surf', 3: 'water_spout' },
} as const

export const AGUA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: waterGun, duracao: { 1: 900 }, alcance: 30, impactos: { 1: GUN_SAIDAS.map(s => s + GUN_VOO) } },
  2: { desenhar: waterPulse, duracao: { 2: 1000 }, alcance: 34, impactos: { 2: [PULSE_CHEGA] } },
  3: { desenhar: scald, duracao: { 3: 1100 }, alcance: 40, impactos: { 3: [SCALD_CHEGA] } },
  4: { desenhar: hydroPump, duracao: { 4: 1600 }, alcance: 80, impactos: { 4: [PUMP_CHEGA] } },
}

export const AGUA_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = {
  1: { desenhar: bubble, duracao: { 1: 900 }, alcance: 30, impactos: { 1: [400] } },
  2: { desenhar: surf, duracao: { 2: 1200 }, alcance: 40, impactos: { 2: [SURF_SAI + 200] } },
  3: { desenhar: waterSpout, duracao: { 3: 1500 }, alcance: 190, impactos: { 3: [SPOUT_SOBE + 300, ...SPOUT_GEISERES] } },
}
