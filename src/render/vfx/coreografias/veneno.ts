// VENENO (POISON) — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (o que separa da agua sem olhar a cor): agua tem peso e
// ESPIRRA (gota balistica, coroa de respingo). Veneno e GOSMA:
//   - viscosa: a bola bamboleia (estica e achata) no voo e, quando bate,
//     GRUDA — vira mancha chapada com fios escorrendo pra baixo, nao coroa.
//   - no chao vira POCA que borbulha: bolhas sobem, incham e estouram.
//   - FUMACA toxica: nuvem gorda em bolotas chapadas (sem alfa — o pixelizador
//     transformaria alfa em pontilhado, vetado pelo dono em 29/09).
//
//   T1 Poison Sting   ferrao roxo voa reto, crava e solta bolhas de veneno.
//   T2 Sludge         bola de gosma lancada em arco bamboleando; gruda no alvo e
//                     escorre.
//   T3 Sludge Bomb    bomba de gosma com rastro de pingos; estoura em bolotas que
//                     voam e grudam, poca borbulhando embaixo, estrela.
//   T4 Gunk Shot      poca borbulha sob quem lanca; jato GROSSO de gosma
//                     encaroçada; o alvo some numa nuvem toxica que se espalha
//                     rente ao chao pela cena, poca e bolhas.
//   A1 Acid           gotas de acido caem pela area inteira e chiam em pocinhas.
//   A2 Sludge Wave    onda de gosma encaroçada corre ate a borda deixando pocas
//                     borbulhando por dentro.
//   A3 (critico)      pantano toxico: pocas pela area toda, geiseres de gosma e
//                     nuvens de fumaca subindo.
//
// AREA preenche o interior e a borda marca o limite (dono, 29/09 e 30/09).
import { estrelaDeImpacto, limitar, massaEmCamadas, riscos, saida, type Bolha } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

// ---------------------------------------------------------------------------
// Gosma, poca, bolha, fumaca
// ---------------------------------------------------------------------------

/**
 * Bola de gosma que bamboleia: estica na direcao do voo e achata de lado, em
 * onda. Devolve bolotas que a massa em camadas funde numa forma so.
 */
function bolaDeGosma(p: Ponto, r: number, ms: number, ang: number, fase = 0): Bolha[] {
  const est = 1 + Math.sin(ms * 0.03 + fase) * 0.25
  const ux = Math.cos(ang), uy = Math.sin(ang)
  return [
    { x: p.x, y: p.y, r, ang: 0 },
    { x: p.x + ux * r * 0.55 * est, y: p.y + uy * r * 0.55 * est, r: r * 0.72, ang: 0 },
    { x: p.x - ux * r * 0.6 * est, y: p.y - uy * r * 0.6 * est, r: r * 0.6 / est, ang: 0 },
  ]
}

/**
 * Mancha que GRUDA no alvo: bolotas achatadas no ponto e fios escorrendo pra
 * baixo que alongam com o tempo. `t` 0..1 na vida da mancha.
 */
function mancha(p: Ponto, r: number, t: number, sem: readonly number[], fios = 3): Bolha[] {
  if (t < 0 || t >= 1) return []
  const abre = saida(limitar(t * 4)), some = 1 - limitar((t - 0.7) / 0.3)
  const out: Bolha[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + sem[i]
    out.push({ x: p.x + Math.cos(a) * r * 0.6 * abre, y: p.y + Math.sin(a) * r * 0.35 * abre, r: r * em(sem[i + 5], 0.45, 0.7) * some, ang: 0 })
  }
  // Fios que escorrem, cada um com seu comprimento: fino em cima, GOTA gorda na
  // ponta que, passada a metade da vida, se solta e cai (fio regular e igual
  // parecia perninha).
  for (let f = 0; f < fios; f++) {
    const x = p.x + em(sem[10 + f], -0.6, 0.6) * r
    const longe = r * em(sem[13 + f], 0.9, 1.9)
    const desce = longe * saida(limitar(t * 1.6 - sem[13 + f] * 0.25))
    for (let k = 0; k < 3; k++) {
      const u = k / 3
      out.push({ x, y: p.y + r * 0.2 + desce * u, r: r * (0.16 + 0.06 * u) * some, ang: 0 })
    }
    const solta = limitar((t - 0.45 - sem[10 + f] * 0.1) / 0.3)
    out.push({ x, y: p.y + r * 0.2 + desce + solta * solta * r * 2.2, r: r * 0.3 * (1 - solta * 0.4) * some, ang: 0 })
  }
  return out
}
/** Numeros que `mancha` le da semente (com ate 3 fios). */
const POR_MANCHA = 16

interface Poca { x: number; y: number; r: number }

/**
 * Pocas no chao: elipses achatadas em 3 camadas (contorno, base, reflexo) — a
 * gosma deitada. Uma chamada por camada pra todas.
 */
function pintarPocas(ctx: CanvasRenderingContext2D, pocas: readonly Poca[], pele: Pele): void {
  if (!pocas.length) return
  for (const [cor, k, dy] of [[pele.contorno, 1.18, 0], [pele.base, 1, 0], [pele.meio, 0.5, -0.12]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const p of pocas) {
      const rx = p.r * k, ry = p.r * 0.38 * k
      if (rx < 0.4) continue
      ctx.moveTo(p.x + rx, p.y + p.r * dy); ctx.ellipse(p.x, p.y + p.r * dy, rx, ry, 0, 0, TAU)
    }
    ctx.fill()
  }
}

/** Bolha de veneno: aro escuro, corpo claro e o brilho no canto — estoura no fim. */
interface BolhaDeVeneno { x: number; y: number; r: number }

function pintarBolhas(ctx: CanvasRenderingContext2D, bolhas: readonly BolhaDeVeneno[], pele: Pele): void {
  if (!bolhas.length) return
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.meio, 1], [pele.nucleo, 0.35]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const b of bolhas) {
      const r = b.r * k
      if (r < 0.3) continue
      const ox = k < 0.5 ? -b.r * 0.35 : 0, oy = k < 0.5 ? -b.r * 0.35 : 0
      ctx.moveTo(b.x + ox + r, b.y + oy); ctx.arc(b.x + ox, b.y + oy, r, 0, TAU)
    }
    ctx.fill()
  }
}

/**
 * Bolhas subindo de uma poca/ponto: nascem espalhadas no tempo, sobem
 * tremendo, incham e somem de uma vez (estouro). 3 numeros por bolha.
 */
function borbulhar(ms: number, p: Ponto, t0: number, t1: number, n: number, largura: number, alto: number, tam: number, sem: readonly number[]): BolhaDeVeneno[] {
  const out: BolhaDeVeneno[] = []
  for (let i = 0; i < n; i++) {
    const nasce = t0 + sem[i * 3] * Math.max(0, t1 - t0 - 280)
    const t = (ms - nasce) / 280
    if (t < 0 || t >= 1) continue
    out.push({ x: p.x + em(sem[i * 3 + 1], -largura, largura) + Math.sin(t * 9 + i) * 0.8, y: p.y - alto * t * em(sem[i * 3 + 2], 0.5, 1), r: tam * (0.5 + 0.7 * t) })
  }
  return out
}

/**
 * Nuvem toxica: bolotas gordas que incham e se juntam; na hora de sumir elas
 * ENCOLHEM (nunca ficam transparentes). 3 numeros por bolota.
 */
function nuvem(ms: number, p: Ponto, t0: number, dura: number, n: number, largura: number, alto: number, tam: number, sem: readonly number[]): Bolha[] {
  const out: Bolha[] = []
  const t = (ms - t0) / dura
  if (t < 0 || t >= 1) return out
  const cresce = saida(limitar(t * 2.5)), some = 1 - limitar((t - 0.6) / 0.4)
  for (let i = 0; i < n; i++) {
    const x = p.x + em(sem[i * 3], -largura, largura) * cresce
    const y = p.y - em(sem[i * 3 + 1], 0, alto) * cresce - t * 6
    out.push({ x, y, r: tam * em(sem[i * 3 + 2], 0.6, 1.1) * cresce * some, ang: 0 })
  }
  return out
}

function pintarGosma(ctx: CanvasRenderingContext2D, bolotas: readonly Bolha[], pele: Pele): void {
  if (bolotas.length) massaEmCamadas(ctx, bolotas, pele, 'circulo', 4)
}

function pintarNuvem(ctx: CanvasRenderingContext2D, bolotas: readonly Bolha[], pele: Pele): void {
  // Fumaca sem o nucleo claro: nuvem e opaca e fosca, gosma e que brilha.
  if (bolotas.length) massaEmCamadas(ctx, bolotas, pele, 'circulo', 3)
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })
const peito = (p: Ponto): Ponto => ({ x: p.x, y: p.y - 4 })

// ---------------------------------------------------------------------------
// T1 — POISON STING: ferrao que crava e solta bolhas
// ---------------------------------------------------------------------------

const FERRAO_VOO = 180

function poisonSting(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semBolhas = sortear(rng, 6 * 3)
  const semMancha = sortear(rng, POR_MANCHA)
  const p = peito(alvo)
  // Mancha pequena onde cravou, depois bolhas subindo dela.
  pintarGosma(ctx, mancha(p, 4.5, (ms - FERRAO_VOO) / 600, semMancha, 2), pele)
  pintarBolhas(ctx, borbulhar(ms, p, FERRAO_VOO, FERRAO_VOO + 520, 6, 5, 16, 1.6, semBolhas), pele)
  // Ferrao: agulha roxa grossa, de ponta, que para cravada um instante.
  const u = limitar(ms / FERRAO_VOO), cravado = ms - FERRAO_VOO
  if (cravado < 140) {
    const q = { x: b.x + (p.x - b.x) * u, y: b.y + (p.y - b.y) * u }
    const L = 7, W = 1.6, ux = Math.cos(angulo), uy = Math.sin(angulo)
    for (const [cor, k] of [[pele.contorno, 1.35], [pele.base, 1], [pele.nucleo, 0.45]] as const) {
      ctx.fillStyle = cor; ctx.beginPath()
      ctx.moveTo(q.x + ux * L * k, q.y + uy * L * k)
      ctx.lineTo(q.x - uy * W * k, q.y + ux * W * k)
      ctx.lineTo(q.x - ux * L * 0.9 * k, q.y - uy * L * 0.9 * k)
      ctx.lineTo(q.x + uy * W * k, q.y - ux * W * k)
      ctx.closePath(); ctx.fill()
    }
  }
}

// ---------------------------------------------------------------------------
// T2 — SLUDGE: bola de gosma em arco que gruda e escorre
// ---------------------------------------------------------------------------

const SLUDGE_SAI = 80
const SLUDGE_CHEGA = 380

function sludge(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semMancha = sortear(rng, POR_MANCHA)
  const semBolhas = sortear(rng, 8 * 3)
  const semPingos = sortear(rng, 4 * 3)
  const p = peito(alvo)
  const gosma: Bolha[] = []
  if (ms >= SLUDGE_SAI && ms < SLUDGE_CHEGA) {
    const u = (ms - SLUDGE_SAI) / (SLUDGE_CHEGA - SLUDGE_SAI)
    // Arco alto e lento: gosma e pesada e mole, nao projetil.
    const q = { x: b.x + (p.x - b.x) * u, y: b.y + (p.y - b.y) * u - Math.sin(Math.PI * u) * 18 }
    const ang = Math.atan2(p.y - b.y - Math.cos(Math.PI * u) * Math.PI * 18, p.x - b.x)
    gosma.push(...bolaDeGosma(q, 4.2, ms, ang))
    // Pingos que caem da bola pelo caminho.
    for (let i = 0; i < 4; i++) {
      const quando = SLUDGE_SAI + (i + 1) * 55, t = (ms - quando) / 220
      if (t < 0 || t >= 1) continue
      const uu = (quando - SLUDGE_SAI) / (SLUDGE_CHEGA - SLUDGE_SAI)
      gosma.push({ x: b.x + (p.x - b.x) * uu + em(semPingos[i * 3], -2, 2), y: b.y + (p.y - b.y) * uu - Math.sin(Math.PI * uu) * 18 + 3 + t * t * 14, r: 1.4 * (1 - t * 0.5), ang: 0 })
    }
  }
  gosma.push(...mancha(p, 7, (ms - SLUDGE_CHEGA) / 620, semMancha))
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, borbulhar(ms, p, SLUDGE_CHEGA + 60, SLUDGE_CHEGA + 560, 8, 7, 18, 1.8, semBolhas), pele)
}

// ---------------------------------------------------------------------------
// T3 — SLUDGE BOMB: bomba que estoura em bolotas que grudam
// ---------------------------------------------------------------------------

const BOMBA_SAI = 60
const BOMBA_ESTOURA = 360
const BOMBA_BOLOTAS = 7

function sludgeBomb(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semBolotas = sortear(rng, BOMBA_BOLOTAS * 3)
  const semManchas = Array.from({ length: BOMBA_BOLOTAS + 1 }, () => sortear(rng, POR_MANCHA))
  const semBolhas = sortear(rng, 10 * 3)
  const semRastro = sortear(rng, 6 * 2)
  const semEstrela = sortear(rng, 9)
  const p = peito(alvo)
  const chao = { x: alvo.x, y: alvo.y + 8 }
  const gosma: Bolha[] = []
  // Poca embaixo do alvo, crescendo depois do estouro.
  const cresce = saida(limitar((ms - BOMBA_ESTOURA - 80) / 300)) * (1 - limitar((ms - 1200) / 200))
  pintarPocas(ctx, cresce > 0 ? [{ x: chao.x, y: chao.y, r: 16 * cresce }, { x: chao.x - 8 * cresce, y: chao.y + 2, r: 8 * cresce }, { x: chao.x + 9 * cresce, y: chao.y + 1, r: 7 * cresce }] : [], pele)
  if (ms >= BOMBA_SAI && ms < BOMBA_ESTOURA) {
    const u = (ms - BOMBA_SAI) / (BOMBA_ESTOURA - BOMBA_SAI)
    const q = { x: b.x + (p.x - b.x) * u, y: b.y + (p.y - b.y) * u - Math.sin(Math.PI * u) * 14 }
    gosma.push(...bolaDeGosma(q, 6, ms, Math.atan2(p.y - b.y, p.x - b.x)))
    // Rastro de pingos ficando pra tras.
    for (let i = 0; i < 6; i++) {
      const tr = u - (i + 1) * 0.07
      if (tr < 0) continue
      gosma.push({ x: b.x + (p.x - b.x) * tr + em(semRastro[i * 2], -2, 2), y: b.y + (p.y - b.y) * tr - Math.sin(Math.PI * tr) * 14 + em(semRastro[i * 2 + 1], -1, 3), r: 2.2 * (1 - i / 7), ang: 0 })
    }
  }
  // Estouro: bolotas voam em arco e grudam onde caem.
  for (let i = 0; i < BOMBA_BOLOTAS; i++) {
    const a = (i / BOMBA_BOLOTAS) * TAU + semBolotas[i * 3] * 0.6
    const d = em(semBolotas[i * 3 + 1], 14, 26)
    const fim = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.55 + 4 }
    const voa = 200 + semBolotas[i * 3 + 2] * 80, t = (ms - BOMBA_ESTOURA) / voa
    if (t >= 0 && t < 1) {
      const q = { x: p.x + (fim.x - p.x) * t, y: p.y + (fim.y - p.y) * t - Math.sin(Math.PI * t) * 10 }
      gosma.push(...bolaDeGosma(q, 2.6, ms, a, i))
    }
    gosma.push(...mancha(fim, 3.4, (ms - BOMBA_ESTOURA - voa) / 520, semManchas[i], 1))
  }
  gosma.push(...mancha(p, 8, (ms - BOMBA_ESTOURA) / 700, semManchas[BOMBA_BOLOTAS]))
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, borbulhar(ms, chao, BOMBA_ESTOURA + 200, 1250, 10, 12, 16, 1.9, semBolhas), pele)
  const e = ms - BOMBA_ESTOURA
  if (e >= 0 && e < 240) estrelaDeImpacto(ctx, p, 15, e / 240, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — GUNK SHOT: jato grosso de gosma e nuvem toxica que toma a cena
// ---------------------------------------------------------------------------
//
//   carga     poca borbulhando sob quem lanca, bolas de gosma subindo dela.
//   jato      tubo GROSSO de gosma encaroçada (bolotas de tamanhos diferentes
//             andando juntas) — mais lento e mais gordo que o jato d'agua.
//   impacto   o alvo some numa nuvem toxica grande; nuvens menores escorrem
//             rente ao chao pela cena toda; poca e bolhas; estrela e riscos.

const GUNK_CARGA = 480
const GUNK_CHEGA = 640
const GUNK_FIM = 980

function gunkShot(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const b = boca(c)
  const semCarga = sortear(rng, 10 * 3)
  const semJato = sortear(rng, 22)
  const semNuvem = sortear(rng, 14 * 3)
  const semChao = Array.from({ length: 5 }, () => sortear(rng, 6 * 3))
  const semBolhas = sortear(rng, 14 * 3)
  const semManchas = sortear(rng, POR_MANCHA)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 14 * 3)
  const p = peito(alvo)
  const chaoAlvo = { x: alvo.x, y: alvo.y + 8 }
  const chaoOrigem = { x: origem.x, y: origem.y + 8 }

  // Pocas: sob quem lanca (carga) e sob o alvo (depois do impacto).
  const pOrig = saida(limitar(ms / 200)) * (1 - limitar((ms - GUNK_FIM) / 200))
  const pAlvo = saida(limitar((ms - GUNK_CHEGA) / 300)) * (1 - limitar((ms - 1450) / 200))
  pintarPocas(ctx, [
    ...(pOrig > 0 ? [{ x: chaoOrigem.x, y: chaoOrigem.y, r: 14 * pOrig }] : []),
    ...(pAlvo > 0 ? [{ x: chaoAlvo.x, y: chaoAlvo.y, r: 20 * pAlvo }, { x: chaoAlvo.x + 12 * pAlvo, y: chaoAlvo.y + 2, r: 9 * pAlvo }] : []),
  ], pele)
  const gosma: Bolha[] = []
  // Carga: bolas de gosma subindo da poca e caindo de volta.
  if (ms < GUNK_CARGA + 100) {
    for (let i = 0; i < 10; i++) {
      const t = ((ms + semCarga[i * 3] * 400) % 400) / 400
      if (ms > GUNK_CARGA && t < 0.2) continue
      const x = chaoOrigem.x + em(semCarga[i * 3 + 1], -10, 10)
      gosma.push({ x, y: chaoOrigem.y - Math.sin(Math.PI * t) * em(semCarga[i * 3 + 2], 10, 22), r: 2.2 * (1 - t * 0.3), ang: 0 })
    }
  }
  // Jato: bolotas grossas de tamanhos diferentes ondulando devagar.
  if (ms >= GUNK_CARGA && ms < GUNK_FIM + 120) {
    const ate = limitar((ms - GUNK_CARGA) / (GUNK_CHEGA - GUNK_CARGA))
    const de = limitar((ms - GUNK_FIM) / 120)
    const dx = p.x - b.x, dy = p.y - b.y, L = Math.hypot(dx, dy) || 1
    for (let i = 0; i < 22; i++) {
      const u = i / 21
      if (u < de || u > ate) continue
      const onda = Math.sin(u * 7 - ms * 0.015) * 2.5
      gosma.push({ x: b.x + dx * u - (dy / L) * onda, y: b.y + dy * u + (dx / L) * onda, r: em(semJato[i], 3.2, 6) * (0.7 + 0.3 * Math.sin(Math.PI * u)), ang: 0 })
    }
  }
  gosma.push(...mancha(p, 9, (ms - GUNK_CHEGA) / 800, semManchas))
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, [
    ...borbulhar(ms, chaoOrigem, 0, GUNK_CARGA, 6, 10, 14, 1.8, semBolhas),
    ...borbulhar(ms, chaoAlvo, GUNK_CHEGA + 150, 1500, 8, 14, 18, 2, semBolhas.slice(18)),
  ], pele)
  // Nuvem toxica: grande no alvo + tufos rente ao chao espalhando pela cena.
  const fumaca: Bolha[] = [...nuvem(ms, p, GUNK_CHEGA + 40, 900, 14, 18, 20, 8, semNuvem)]
  for (let i = 0; i < 5; i++) {
    const lado = i - 2
    fumaca.push(...nuvem(ms, { x: chaoAlvo.x + lado * 28, y: chaoAlvo.y - 2 }, GUNK_CHEGA + 120 + Math.abs(lado) * 70, 820, 6, 10, 6, 5, semChao[i]))
  }
  fumaca.sort((q, r) => q.y - r.y)
  pintarNuvem(ctx, fumaca, pele)
  const e = ms - GUNK_CHEGA
  if (e >= 0 && e < 300) estrelaDeImpacto(ctx, p, 22, e / 300, pele, fila(semEstrela))
  if (e >= 0 && e < 420) riscos(ctx, p, 14, 44, e / 420, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175
// ---------------------------------------------------------------------------

const escalaDaArea = (r: number) => Math.max(1, r / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })
/** Ponto `i` de `n` da espiral de Vogel dentro da elipse (fracao `max` do raio). */
const vogel = (centro: Ponto, R: number, i: number, n: number, max: number, giro = 0): Ponto =>
  noChao(centro, i * ANGULO_DOURADO + giro, R * max * Math.sqrt((i + 0.5) / n))
/** Fracao do raio (0..1) de um ponto do chao — inverso de `noChao`. */
const fracaoDoRaio = (centro: Ponto, p: Ponto, R: number) => Math.hypot(p.x - centro.x, (p.y - centro.y - 12) / 0.45) / R

// A1 — ACID: gotas de acido caem pela area inteira e chiam em pocinhas
const ACIDO_DENTRO = 14
const ACIDO_BORDA = 12
const ACIDO_QUEDA = 260

function acid(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const n = ACIDO_DENTRO + ACIDO_BORDA
  const sem = sortear(rng, n * 2)
  const semBolhas = Array.from({ length: n }, () => sortear(rng, 2 * 3))
  const pocas: Poca[] = [], gosma: Bolha[] = [], bolhas: BolhaDeVeneno[] = []
  for (let i = 0; i < n; i++) {
    const naBorda = i >= ACIDO_DENTRO, j = naBorda ? i - ACIDO_DENTRO : i
    const q = naBorda ? noChao(centro, ((j + sem[i * 2] * 0.6) / ACIDO_BORDA) * TAU, R * 0.96) : vogel(centro, R, j, ACIDO_DENTRO, 0.85, sem[i * 2] * 0.4)
    // Caem do centro pra fora: a chuva de acido "abre".
    const cai = 60 + fracaoDoRaio(centro, q, R) * 300 + sem[i * 2 + 1] * 60
    const t = (ms - cai) / ACIDO_QUEDA
    if (t >= 0 && t < 1) {
      // Gota caindo reto, esticada na vertical.
      const y = q.y - 60 * (1 - t * t)
      gosma.push({ x: q.x, y, r: 2.2 * k * 0.8, ang: 0 }, { x: q.x, y: y - 2.6 * k, r: 1.4 * k * 0.8, ang: 0 })
    }
    const p = (ms - cai - ACIDO_QUEDA) / 520
    if (p >= 0 && p < 1) pocas.push({ x: q.x, y: q.y, r: 6 * k * 0.8 * saida(limitar(p * 3)) * (1 - limitar((p - 0.7) / 0.3)) })
    bolhas.push(...borbulhar(ms, q, cai + ACIDO_QUEDA, cai + ACIDO_QUEDA + 480, 2, 3, 10, 1.5 * Math.min(k, 1.3), semBolhas[i]))
  }
  pocas.sort((p, q) => p.y - q.y)
  pintarPocas(ctx, pocas, pele)
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, bolhas, pele)
}

// A2 — SLUDGE WAVE: onda de gosma encaroçada ate a borda, pocas por dentro
const ONDA_SAI = 120
const ONDA_CORRE = 620
const ONDA_POCAS = 14

function sludgeWave(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semCrista = sortear(rng, 40)
  const semPocas = Array.from({ length: ONDA_POCAS }, () => sortear(rng, 3 * 3))
  const semGiro = sortear(rng, 1)[0] * TAU
  const pocas: Poca[] = [], gosma: Bolha[] = [], bolhas: BolhaDeVeneno[] = []
  // Crista: anel de bolotas GROSSAS e desiguais que corre devagar e para na borda.
  const t = (ms - ONDA_SAI) / ONDA_CORRE
  if (t >= 0 && t < 1.35) {
    const d = R * 0.97 * saida(limitar(t))
    const encolhe = 1 - limitar((t - 1) / 0.35)
    const m = Math.max(14, Math.ceil((TAU * d * 0.75) / 9))
    for (let i = 0; i < m; i++) {
      const a = (i / m) * TAU
      const q = noChao(centro, a, d)
      const r = em(semCrista[i % 40], 3, 5.5) * k * 0.8 * (0.6 + 0.4 * limitar(t)) * encolhe
      gosma.push({ x: q.x, y: q.y - r * 0.6, r, ang: 0 })
    }
  }
  // Pocas que a onda deixa pra tras, borbulhando.
  for (let i = 0; i < ONDA_POCAS; i++) {
    const q = vogel(centro, R, i, ONDA_POCAS, 0.88, semGiro)
    const passa = ONDA_SAI + ONDA_CORRE * (1 - Math.cbrt(1 - Math.min(0.99, fracaoDoRaio(centro, q, R) / 0.97)))
    const p = (ms - passa) / 700
    if (p >= 0 && p < 1) pocas.push({ x: q.x, y: q.y, r: 9 * k * 0.8 * saida(limitar(p * 3)) * (1 - limitar((p - 0.75) / 0.25)) })
    bolhas.push(...borbulhar(ms, q, passa + 80, passa + 640, 3, 5, 12, 1.7 * Math.min(k, 1.3), semPocas[i]))
  }
  pocas.sort((p, q) => p.y - q.y)
  pintarPocas(ctx, pocas, pele)
  gosma.sort((p, q) => p.y - q.y)
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, bolhas, pele)
}

// A3 — PANTANO TOXICO (critico): pocas, geiseres de gosma e fumaca pela area
const PANTANO_POCAS = 16
const PANTANO_GEISERES = [220, 330, 440, 550, 660, 770] as const

function pantano(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semPocas = Array.from({ length: PANTANO_POCAS }, () => sortear(rng, 3 * 3))
  const semGeiser = PANTANO_GEISERES.map(() => sortear(rng, 8 * 3))
  const semNuvens = Array.from({ length: 6 }, () => sortear(rng, 6 * 3))
  const semEstrela = sortear(rng, 9)
  const semGiro = sortear(rng, 1)[0] * TAU
  const pocas: Poca[] = [], gosma: Bolha[] = [], bolhas: BolhaDeVeneno[] = []
  const fim = 1 - limitar((ms - 1300) / 250)
  // O chao inteiro vira pantano: pocas pela area toda, do centro pra fora.
  for (let i = 0; i < PANTANO_POCAS; i++) {
    const q = vogel(centro, R, i, PANTANO_POCAS, 0.92, semGiro)
    const abre = saida(limitar((ms - 60 - fracaoDoRaio(centro, q, R) * 260) / 260)) * fim
    if (abre > 0) pocas.push({ x: q.x, y: q.y, r: 13 * k * 0.8 * abre })
    bolhas.push(...borbulhar(ms, q, 200, 1350, 3, 7, 14, 1.8 * Math.min(k, 1.3), semPocas[i]))
  }
  // Geiseres: colunas de gosma que sobem e desabam em pontos da area.
  PANTANO_GEISERES.forEach((t0, i) => {
    const q = vogel(centro, R, i * 2 + 1, PANTANO_POCAS, 0.92, semGiro)
    const t = (ms - t0) / 520
    if (t < 0 || t >= 1) return
    const alto = 34 * Math.min(k, 1.4) * Math.sin(Math.PI * t)
    for (let j = 0; j < 8; j++) {
      const u = j / 7
      gosma.push({ x: q.x + em(semGeiser[i][j * 3], -2, 2), y: q.y - u * alto, r: (4.5 - u * 2) * Math.min(k, 1.4) * 0.8, ang: 0 })
    }
  })
  // Fumaca subindo pela area.
  const fumaca: Bolha[] = []
  for (let i = 0; i < 6; i++) {
    const q = vogel(centro, R, i * 2 + 2, PANTANO_POCAS, 0.92, semGiro + 1)
    fumaca.push(...nuvem(ms, { x: q.x, y: q.y - 6 }, 300 + i * 90, 1000, 6, 12, 18, 6 * Math.min(k, 1.3), semNuvens[i]))
  }
  pocas.sort((p, q) => p.y - q.y)
  pintarPocas(ctx, pocas, pele)
  gosma.sort((p, q) => p.y - q.y)
  pintarGosma(ctx, gosma, pele)
  pintarBolhas(ctx, bolhas, pele)
  fumaca.sort((p, q) => p.y - q.y)
  pintarNuvem(ctx, fumaca, pele)
  const e = ms - PANTANO_GEISERES[0]
  if (e >= 0 && e < 240) estrelaDeImpacto(ctx, { x: centro.x, y: centro.y - 6 }, 15, e / 240, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_VENENO = {
  single: { 1: 'poison_sting', 2: 'sludge', 3: 'sludge_bomb', 4: 'gunk_shot' },
  area: { 1: 'acid', 2: 'sludge_wave', 3: 'aoe50_poison' },
} as const

export const VENENO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: poisonSting, duracao: { 1: 900 }, alcance: 30, impactos: { 1: [FERRAO_VOO] } },
  2: { desenhar: sludge, duracao: { 2: 1100 }, alcance: 44, impactos: { 2: [SLUDGE_CHEGA] } },
  3: { desenhar: sludgeBomb, duracao: { 3: 1500 }, alcance: 46, impactos: { 3: [BOMBA_ESTOURA] } },
  4: { desenhar: gunkShot, duracao: { 4: 1800 }, alcance: 90, impactos: { 4: [GUNK_CHEGA] } },
}

export const VENENO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = {
  1: { desenhar: acid, duracao: { 1: 1300 }, alcance: 70, impactos: { 1: [300] } },
  2: { desenhar: sludgeWave, duracao: { 2: 1500 }, alcance: 30, impactos: { 2: [ONDA_SAI + 250] } },
  3: { desenhar: pantano, duracao: { 3: 1800 }, alcance: 60, impactos: { 3: [...PANTANO_GEISERES] } },
}
