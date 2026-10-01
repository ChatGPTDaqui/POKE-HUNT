// ACO (STEEL) — 4 single + A2 + A3, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Bullet Punch/Metal Claw; T2 Magnet Bomb/Mirror Shot/
// Steel Wing; T3 Flash Cannon/Iron Head/Meteor Mash; T4 Iron Tail/Doom Desire.
// Area: so a Explosao Elemental do nivel 50 (70, A2); A3 so por critico. SEM
// A1: nada cai nele.
//
// PERSONALIDADE (o que separa da rocha sem olhar a cor): rocha e bloco fosco
// que estilhaca. Aco e METAL POLIDO:
//   - REFLEXO: faixa branca que corre pela superficie e o brilho em cruz;
//   - FAISCA DE ATRITO laranja (o acento da pele) — metal batendo em metal;
//   - CACOS de metal finos que giram e piscam ao pegar luz;
//   - formas USINADAS: retas, simetricas, nada organico.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// riscos no que voa, e o rescaldo e faisca caindo e caco piscando.
//
//   T1 Bullet Punch  tres projeteis de aco em rajada; faiscas em cada um.
//   T2 Magnet Bomb   bomba de aco com aneis magneticos, que puxa cacos e
//                    explode em estilhacos metalicos.
//   T3 Flash Cannon  orbe carrega e dispara um feixe reto de luz metalica.
//   T4 Iron Tail     um arco de ferro enorme desce com reflexo e bate numa
//                    chuva de faiscas.
//   A2 (Expl. Elem.) cacos de metal rompem do chao em cada ponto e giram
//                    pegando luz.
//   A3 (critico)     lancas de aco caem do ceu e cravam em cada ponto, com faisca.
import { afinado, comImpacto } from '../acabamento'
import { crescente, entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { chegaEm, CIMA, em, encolhe, escalaDaArea, fila, interior, pintarBolas, sortear, TAU } from './comum'

const BRANCO = '#ffffff'
/** Faisca de atrito: o laranja do acento (amarelo por dentro). */
const faiscaFora = (p: Pele) => p.acento?.[1] ?? p.base
const faiscaDentro = (p: Pele) => p.acento?.[0] ?? p.nucleo

/** Faiscas de atrito: tracos curtos laranja que voam, caem e esfriam. `t` 0..1. */
function faiscas(ctx: CanvasRenderingContext2D, p: Ponto, dir: number, abre: number, t: number, sem: readonly number[], pele: Pele, k = 1): void {
  if (t < 0 || t > 1) return
  for (const [cor, larg] of [[faiscaFora(pele), 1.8], [faiscaDentro(pele), 0.9]] as const) {
    if (cor === faiscaDentro(pele) && t > 0.55) continue
    ctx.fillStyle = cor
    ctx.beginPath()
    for (let i = 0; i * 2 + 1 < sem.length; i++) {
      const a = dir + (sem[i * 2] - 0.5) * 2 * abre, v = em(sem[i * 2 + 1], 16, 32) * k
      const d = v * saida(t)
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d + 12 * k * t * t
      const tr = (5 * (1 - t) + 1) * k
      afinado(ctx, x, y, x - Math.cos(a) * tr, y - Math.sin(a) * tr + 2 * t, larg)
    }
    ctx.fill()
  }
}

/** Brilho especular em cruz: o metal pegando luz. */
function reflexo(ctx: CanvasRenderingContext2D, p: Ponto, r: number): void {
  if (r < 1) return
  ctx.fillStyle = BRANCO
  ctx.beginPath()
  ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r * 0.12, p.y - r * 0.12); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + r * 0.12, p.y + r * 0.12)
  ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r * 0.12, p.y + r * 0.12); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - r * 0.12, p.y - r * 0.12); ctx.closePath()
  ctx.fill()
}

/** Projetil de aco: ogiva afinada com faixa de reflexo no meio. `a` = direcao. */
function projeteis(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; a: number; c: number; w?: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.base, 1], [pele.meio, 0.62]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const g of lista) {
      const L = g.c * k, W = g.c * (g.w ?? 0.32) * k, ux = Math.cos(g.a), uy = Math.sin(g.a), nx = -uy, ny = ux
      ctx.moveTo(g.x + ux * L * 0.55, g.y + uy * L * 0.55)
      ctx.lineTo(g.x + ux * L * 0.1 + nx * W, g.y + uy * L * 0.1 + ny * W)
      ctx.lineTo(g.x - ux * L * 0.45 + nx * W, g.y - uy * L * 0.45 + ny * W)
      ctx.lineTo(g.x - ux * L * 0.45 - nx * W, g.y - uy * L * 0.45 - ny * W)
      ctx.lineTo(g.x + ux * L * 0.1 - nx * W, g.y + uy * L * 0.1 - ny * W)
      ctx.closePath()
    }
    ctx.fill()
  }
  // Faixa de reflexo branca, de ponta a ponta.
  ctx.fillStyle = BRANCO
  ctx.beginPath()
  for (const g of lista) afinado(ctx, g.x - Math.cos(g.a) * g.c * 0.35, g.y - Math.sin(g.a) * g.c * 0.35, g.x + Math.cos(g.a) * g.c * 0.45, g.y + Math.sin(g.a) * g.c * 0.45, 1.1)
  ctx.fill()
}

/** Caco de metal no instante. */
interface Caco { x: number; y: number; r: number; giro: number }

/** Cacos de metal: paralelogramos finos girando; piscam branco quando pegam luz. */
function cacos(ctx: CanvasRenderingContext2D, lista: readonly Caco[], ms: number, pele: Pele): void {
  const forma = (c: Caco, k: number) => {
    const ux = Math.cos(c.giro), uy = Math.sin(c.giro), nx = -uy * 0.35, ny = ux * 0.35
    const r = c.r * k
    ctx.moveTo(c.x + ux * r + nx * r * 0.3, c.y + uy * r + ny * r * 0.3)
    ctx.lineTo(c.x + nx * r, c.y + ny * r)
    ctx.lineTo(c.x - ux * r - nx * r * 0.3, c.y - uy * r - ny * r * 0.3)
    ctx.lineTo(c.x - nx * r, c.y - ny * r)
    ctx.closePath()
  }
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.meio, 1]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const c of lista) if (c.r > 0.8) forma(c, k)
    ctx.fill()
  }
  ctx.fillStyle = BRANCO; ctx.beginPath()
  for (const c of lista) if (c.r > 0.8 && Math.sin(c.giro * 2 + ms * 0.01) > 0.6) forma(c, 0.6)
  ctx.fill()
}

// ---------------------------------------------------------------------------
// T1 — BULLET PUNCH
// ---------------------------------------------------------------------------

const BULLET_SAIDAS = [60, 130, 200] as const
const BULLET_VOO = 90

function bulletPunch(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const desvios = BULLET_SAIDAS.map(() => sortear(rng, 2))
  const semFaiscas = BULLET_SAIDAS.map(() => sortear(rng, 7 * 2))
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 2 }
  const lista: { x: number; y: number; a: number; c: number }[] = []
  ctx.fillStyle = pele.nucleo
  ctx.beginPath()
  BULLET_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 8, y: alvo.y + (desvios[i][1] - 0.5) * 8 }
    const a = Math.atan2(fim.y - b.y, fim.x - b.x)
    const u = (ms - sai) / BULLET_VOO
    if (u >= 0 && u < 1) {
      const x = b.x + (fim.x - b.x) * u, y = b.y + (fim.y - b.y) * u
      lista.push({ x, y, a, c: 9 })
      afinado(ctx, x - Math.cos(a) * 5, y - Math.sin(a) * 5, x - Math.cos(a) * 16, y - Math.sin(a) * 16, 1.8)
    }
  })
  ctx.fill()
  projeteis(ctx, lista, pele)
  BULLET_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 8, y: alvo.y + (desvios[i][1] - 0.5) * 8 }
    faiscas(ctx, fim, Math.atan2(fim.y - b.y, fim.x - b.x) + Math.PI, 1.1, (ms - sai - BULLET_VOO) / 320, semFaiscas[i], pele, 0.8)
  })
}

// ---------------------------------------------------------------------------
// T2 — MAGNET BOMB
// ---------------------------------------------------------------------------

const BOMBA_SAI = 120
const BOMBA_CHEGA = 400

function magnetBomb(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCacos = sortear(rng, 10 * 3)
  const semFaiscas = sortear(rng, 10 * 2)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 6 }
  if (ms < BOMBA_CHEGA) {
    const u = saida(limitar((ms - BOMBA_SAI) / (BOMBA_CHEGA - BOMBA_SAI)))
    const p = { x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u - Math.sin(Math.PI * u) * 8 }
    const r = 4.2 * saida(limitar(ms / BOMBA_SAI))
    // Aneis magneticos girando em volta da bomba (dois eixos).
    for (const [cor, w] of [[pele.contorno, 2.4], [pele.meio, 1.1]] as const) {
      ctx.strokeStyle = cor; ctx.lineWidth = w
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 2, r * 0.7, ms * 0.012, 0, TAU); ctx.stroke()
      ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 2, r * 0.7, -ms * 0.012 + 1.2, 0, TAU); ctx.stroke()
    }
    pintarBolas(ctx, [{ x: p.x, y: p.y, r }], [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.6, -0.25]])
    reflexo(ctx, { x: p.x - r * 0.35, y: p.y - r * 0.35 }, 2.2)
  }
  // Explode em estilhacos metalicos girando + faiscas.
  const t = (ms - BOMBA_CHEGA) / 500
  if (t >= 0 && t <= 1) {
    const lista: Caco[] = []
    for (let i = 0; i < 10; i++) {
      const a = semCacos[i * 3] * TAU, d = em(semCacos[i * 3 + 1], 10, 24) * saida(t)
      lista.push({ x: alvo.x + Math.cos(a) * d, y: alvo.y + Math.sin(a) * d * 0.8 + 10 * t * t, r: em(semCacos[i * 3 + 2], 2, 3.2) * encolhe(t), giro: a + t * 9 })
    }
    cacos(ctx, lista, ms, pele)
  }
  faiscas(ctx, alvo, CIMA, Math.PI, (ms - BOMBA_CHEGA) / 380, semFaiscas, pele)
  if (ms >= BOMBA_CHEGA && ms < BOMBA_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - BOMBA_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — FLASH CANNON
// ---------------------------------------------------------------------------

const CANHAO_CARGA = 260
const CANHAO_FIM = 640

function flashCannon(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semEstrela = sortear(rng, 9)
  const semFaiscas = sortear(rng, 8 * 2)
  const b = { x: origem.x + Math.cos(c.angulo) * 9, y: origem.y - 4 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y, d = Math.hypot(dx, dy) || 1
  const nx = -dy / d, ny = dx / d
  // Carga: orbe que cresce com o brilho em cruz girando.
  if (ms < CANHAO_CARGA + 80) {
    const r = 1.5 + 4 * saida(limitar(ms / CANHAO_CARGA))
    pintarBolas(ctx, [{ x: b.x, y: b.y, r }], [[pele.contorno, 1.2, 0], [pele.meio, 1, 0], [BRANCO, 0.5, 0]])
    reflexo(ctx, b, r * 2.2 * (0.8 + 0.2 * Math.sin(ms * 0.05)))
  }
  // Feixe: reto, de bordas duras, com nucleo branco; afina no fim.
  if (ms >= CANHAO_CARGA && ms < CANHAO_FIM) {
    const t = (ms - CANHAO_CARGA) / (CANHAO_FIM - CANHAO_CARGA)
    const alcance = saida(limitar(t * 6))
    const w = 5.5 * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3)
    const fx = b.x + dx * alcance, fy = b.y + dy * alcance
    for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.7], [BRANCO, 0.32]] as const) {
      const ww = w * k
      if (ww < 0.4) continue
      ctx.fillStyle = cor
      ctx.beginPath()
      ctx.moveTo(b.x + nx * ww, b.y + ny * ww); ctx.lineTo(fx + nx * ww, fy + ny * ww)
      ctx.lineTo(fx - nx * ww, fy - ny * ww); ctx.lineTo(b.x - nx * ww, b.y - ny * ww); ctx.closePath()
      ctx.fill()
    }
    if (alcance >= 1) reflexo(ctx, alvo, 9 + 2 * Math.sin(ms * 0.06))
  }
  // Faisca continua enquanto o feixe raspa no alvo (rajadas de 160 ms).
  if (ms >= CANHAO_CARGA + 60 && ms < CANHAO_FIM) faiscas(ctx, alvo, Math.atan2(dy, dx) + Math.PI, 1.2, ((ms - CANHAO_CARGA - 60) % 160) / 160, semFaiscas, pele, 0.7)
  if (ms >= CANHAO_CARGA + 60 && ms < CANHAO_CARGA + 260) estrelaDeImpacto(ctx, alvo, 16, (ms - CANHAO_CARGA - 60) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — IRON TAIL
// ---------------------------------------------------------------------------

const CAUDA_ERGUE = 120
const CAUDA_BATE = 520

function ironTail(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semFaiscas = sortear(rng, 16 * 2)
  const semCacos = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  // O arco de ferro desce de tras e por cima, enorme, e bate no alvo.
  const p = (ms - CAUDA_ERGUE) / (CAUDA_BATE - CAUDA_ERGUE + 220)
  if (p >= 0 && p <= 1) crescente(ctx, { x: alvo.x - 4, y: alvo.y - 6 }, 26, -2.6, 0.3, 7, p, 0, pele, 0.8)
  // Reflexo correndo pelo arco no meio do golpe.
  const tr = (ms - CAUDA_BATE + 120) / 120
  if (tr >= 0 && tr <= 1) {
    const a = -2.6 + 2.9 * tr
    reflexo(ctx, { x: alvo.x - 4 + Math.cos(a) * 24, y: alvo.y - 6 + Math.sin(a) * 24 * 0.8 }, 6)
  }
  // Chuva de faiscas pra todo lado e cacos que pulam.
  faiscas(ctx, { x: alvo.x, y: alvo.y + 4 }, CIMA, Math.PI * 0.75, (ms - CAUDA_BATE) / 520, semFaiscas, pele, 1.4)
  const t = (ms - CAUDA_BATE) / 520
  if (t >= 0 && t <= 1) {
    const lista: Caco[] = []
    for (let i = 0; i < 8; i++) {
      const a = CIMA + (semCacos[i * 3] - 0.5) * 2.4, d = em(semCacos[i * 3 + 1], 14, 26) * saida(t)
      lista.push({ x: alvo.x + Math.cos(a) * d, y: alvo.y + Math.sin(a) * d + 22 * t * t, r: em(semCacos[i * 3 + 2], 2, 3.4) * encolhe(t), giro: a + t * 11 })
    }
    cacos(ctx, lista, ms, pele)
  }
  if (ms >= CAUDA_BATE && ms < CAUDA_BATE + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - CAUDA_BATE) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A2 — EXPLOSAO ELEMENTAL (nivel 50): cacos de metal rompem do chao e giram.
function cacosDoChao(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semCacos = pontos.map(() => sortear(rng, 4 * 3))
  const semFaiscas = pontos.map(() => sortear(rng, 4 * 2))
  const lista: Caco[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(100, 500, d, raio)
    const t = (ms - t0) / 700
    if (t >= 0 && t <= 1) {
      for (let j = 0; j < 4; j++) {
        const s = semCacos[i]
        // Sobem girando, param no alto e caem de volta.
        const sobe = Math.sin(Math.PI * Math.min(1, t * 1.3)) * em(s[j * 3], 14, 26) * k * 0.6
        lista.push({ x: p.x + (s[j * 3 + 1] - 0.5) * 12 * k * 0.6, y: p.y - 4 - sobe, r: em(s[j * 3 + 2], 2.6, 3.8) * k * 0.6 * encolhe(t, 0.25), giro: t * 14 + j * 1.7 })
      }
    }
    faiscas(ctx, { x: p.x, y: p.y - 2 }, CIMA, 1.2, (ms - t0) / 340, semFaiscas[i], pele, k * 0.5)
  })
  cacos(ctx, lista, ms, pele)
}

// A3 — (critico): lancas de aco caem do ceu e cravam em cada ponto, com faisca.
// (Colunas retas de luz foram testadas: liam como barras brancas.)
function chuvaDeLancas(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semRitmo = sortear(rng, 12)
  const semFaiscas = pontos.map(() => sortear(rng, 5 * 2))
  const lancas: { x: number; y: number; a: number; c: number; w: number }[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(200, 700, d, raio) + semRitmo[i] * 60
    const queda = 200
    const u = (ms - t0) / queda
    // Lanca: comprida e FINA — curta e larga lia como escudo.
    const L = 30 * k * 0.6
    if (u >= 0 && u < 1) {
      lancas.push({ x: p.x, y: p.y - L * 0.5 - 110 * k * 0.6 * (1 - entrada(u)), a: Math.PI / 2, c: L, w: 0.12 })
    } else if (u >= 1) {
      // Cravada: fica de pe, reluz uma vez e afunda encolhendo.
      const t = (ms - t0 - queda) / 520
      if (t <= 1) lancas.push({ x: p.x, y: p.y - L * 0.3 + L * 0.3 * t, a: Math.PI / 2, c: L * encolhe(t, 0.35), w: 0.12 })
      if (t >= 0.1 && t <= 0.35) reflexo(ctx, { x: p.x, y: p.y - L * 0.6 }, 5 * k * 0.6)
    }
    faiscas(ctx, p, CIMA, Math.PI * 0.6, (ms - t0 - queda) / 400, semFaiscas[i], pele, k * 0.6)
  })
  projeteis(ctx, lancas, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_ACO = {
  single: { 1: 'bullet_punch', 2: 'magnet_bomb', 3: 'flash_cannon', 4: 'iron_tail' },
  area: { 2: 'aoe50_steel', 3: 'aoe50_steel' },
} as const

export const ACO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: bulletPunch, duracao: { 1: 800 }, alcance: 30, impactos: { 1: BULLET_SAIDAS.map(s => s + BULLET_VOO) } },
  2: { desenhar: magnetBomb, duracao: { 2: 1100 }, alcance: 36, impactos: { 2: [BOMBA_CHEGA] } },
  3: { desenhar: flashCannon, duracao: { 3: 1000 }, alcance: 34, impactos: { 3: [CANHAO_CARGA + 60] } },
  4: { desenhar: ironTail, duracao: { 4: 1300 }, alcance: 50, impactos: { 4: [CAUDA_BATE] } },
}, false)

/** Sem A1: nenhum golpe de aco em area cai nele (ver cabecalho). */
export const ACO_AREA: Partial<Record<1 | 2 | 3, EntradaDeCoreografia>> = comImpacto({
  2: { desenhar: cacosDoChao, duracao: { 2: 1500 }, alcance: 50, impactos: { 2: [300] } },
  3: { desenhar: chuvaDeLancas, duracao: { 3: 1700 }, alcance: 110, impactos: { 3: [400, 900] } },
}, true)
