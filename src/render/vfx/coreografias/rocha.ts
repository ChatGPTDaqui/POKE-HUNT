// ROCHA (ROCK) — 4 single + A2 + A3, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Rock Throw/Rollout/Smack Down/Rock Blast; T2 Rock
// Tomb/Ancient Power; T3 Power Gem; T4 Stone Edge/Head Smash. Area: Rock Slide
// (75) e a Explosao Elemental do nivel 50 (70) caem no A2; A3 so por critico.
// SEM A1: nada cai nele.
//
// PERSONALIDADE (o que separa da terra sem olhar a cor): terra e solo que vem
// de BAIXO, mole, que vira poeira. Rocha e PEDRA DURA:
//   - blocos ANGULOSOS de facetas chapadas (nunca bolota redonda);
//   - vem do ALTO ou e arremessada, bate seco e ESTILHACA em lascas que
//     quicam (a particula `pedra`);
//   - gema: losango facetado com brilho branco — a rocha que brilha.
// Linguagem das referencias: raios e fagulhas no impacto (acabamento.ts),
// riscos no que cai/voa, e o rescaldo e o estilhaco quicando ate parar.
//
//   T1 Rock Throw    duas pedras em arco; batem e estilhacam.
//   T2 Rock Tomb     lajes caem do alto em volta do alvo, prendem e racham.
//   T3 Power Gem     gemas se formam e disparam um feixe de lascas de luz.
//   T4 Stone Edge    agulhas de pedra rompem em anel em volta do alvo e
//                    a maior por baixo dele; tudo estilhaca.
//   A2 Rock Slide    pedras caem do ceu pelo interior todo; cada uma bate,
//                    levanta poeira e estilhaca.
//   A3 (critico)     blocos maiores caem e agulhas rompem no interior; a borda
//                    vira uma cerca de pedra.
import { afinado, comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { CIMA, chegaEm, em, encolhe, escalaDaArea, fila, interior, pe, pintarBrilhos, sortear, TAU } from './comum'

const GRAVIDADE = 0.0012

/** Pedra no instante: centro, raio, giro e semente das facetas. */
interface Pedra { x: number; y: number; r: number; giro: number; s: number }

/**
 * Blocos angulosos: 5 vertices irregulares, faceta clara em cima-esquerda e um
 * risco de brilho. Um `fill` por camada pra todas as pedras.
 */
function pintarPedras(ctx: CanvasRenderingContext2D, pedras: readonly Pedra[], pele: Pele): void {
  const vertice = (p: Pedra, i: number, k: number) => {
    const a = p.giro + (i / 5) * TAU
    const rr = p.r * k * (0.75 + 0.25 * Math.abs(Math.sin(p.s * 53 + i * 2.7)))
    return [p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr] as const
  }
  for (const [cor, k] of [[pele.contorno, 1.22], [pele.base, 1]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const p of pedras) {
      if (p.r * k < 0.6) continue
      for (let i = 0; i < 5; i++) { const [x, y] = vertice(p, i, k); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) }
      ctx.closePath()
    }
    ctx.fill()
  }
  // Faceta clara: o triangulo entre o centro e os dois vertices de cima-esquerda.
  ctx.fillStyle = pele.meio
  ctx.beginPath()
  for (const p of pedras) {
    if (p.r < 1.2) continue
    let melhor = 0, menor = Infinity
    for (let i = 0; i < 5; i++) { const [x, y] = vertice(p, i, 1); const v = x - p.x + (y - p.y); if (v < menor) { menor = v; melhor = i } }
    const [ax, ay] = vertice(p, melhor, 0.95), [bx, by] = vertice(p, (melhor + 1) % 5, 0.95), [cx, cy] = vertice(p, (melhor + 4) % 5, 0.95)
    ctx.moveTo(p.x - p.r * 0.1, p.y - p.r * 0.1); ctx.lineTo(bx, by); ctx.lineTo(ax, ay); ctx.lineTo(cx, cy); ctx.closePath()
  }
  ctx.fill()
}

/** Pedra em queda livre do alto ate `chao`, no instante `idade` (ms). Bate e some. */
function caindo(alvoChao: Ponto, altura: number, r: number, idade: number, dura: number, s: number): Pedra | null {
  if (idade < 0 || idade > dura) return null
  const u = entrada(idade / dura)
  return { x: alvoChao.x + (s - 0.5) * 6 * (1 - u), y: alvoChao.y - altura * (1 - u) - r * 0.6, r, giro: s * TAU + idade * 0.006, s }
}

/** Lascas: triangulos pequenos que voam, caem e QUICAM uma vez antes de sumir. */
function lascas(p: Ponto, idade: number, sem: readonly number[], k: number, vida = 520): Pedra[] {
  const out: Pedra[] = []
  if (idade < 0 || idade > vida) return out
  for (let i = 0; i * 3 + 2 < sem.length; i++) {
    const a = CIMA + (sem[i * 3] - 0.5) * 2.6, v = em(sem[i * 3 + 1], 0.08, 0.17) * k
    let y = p.y + Math.sin(a) * v * idade + 0.5 * GRAVIDADE * idade * idade
    const chao = p.y + 6
    if (y > chao) y = chao - Math.abs(Math.sin((idade - 200) * 0.02)) * 3 * (1 - idade / vida)
    out.push({ x: p.x + Math.cos(a) * v * idade, y, r: em(sem[i * 3 + 2], 1, 1.8) * Math.min(k, 1.6) * encolhe(idade / vida), giro: sem[i * 3] * TAU + idade * 0.02, s: sem[i * 3 + 2] })
  }
  return out
}

/** Poeira seca do baque: tres bolotas baixas que abrem e encolhem. */
function baque(ctx: CanvasRenderingContext2D, lista: readonly { p: Ponto; t: number; k: number }[], pele: Pele): void {
  for (const [cor, kk, dy] of [[pele.base, 1.05, 0.3], [pele.meio, 0.9, 0], [pele.nucleo, 0.4, -0.4]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const { p, t, k } of lista) {
      if (t < 0 || t > 1) continue
      const r = 3.6 * k * saida(limitar(t * 3)) * encolhe(t, 0.5) * kk
      if (r < 0.5) continue
      for (const dx of [-1, 0, 1]) {
        const x = p.x + dx * (3 + 9 * saida(t)) * k, y = p.y + dy * r - (dx ? 0 : 1.5 * k)
        ctx.moveTo(x + r, y); ctx.arc(x, y, r * (dx ? 0.8 : 1), 0, TAU)
      }
    }
    ctx.fill()
  }
}

/** Agulha de pedra: triangulo alto e torto que rompe do chao. `h` = altura. */
function pintarAgulhas(ctx: CanvasRenderingContext2D, lista: readonly { x: number; y: number; h: number; w: number; incl: number }[], pele: Pele): void {
  for (const [cor, k, luz] of [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.55, -0.35]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const g of lista) {
      if (g.h < 1.5) continue
      const tx = g.x + g.incl * g.h, ty = g.y - g.h * (k > 1 ? 1.05 : 1)
      ctx.moveTo(g.x - g.w * k + luz * g.w, g.y + 1)
      ctx.lineTo(tx + luz * g.w * 0.3, ty)
      ctx.lineTo(g.x + g.w * k * (luz ? 0.1 : 1), g.y + 1)
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Gema: losango facetado em 4 tons + risco branco. */
function pintarGemas(ctx: CanvasRenderingContext2D, gemas: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  const losango = (g: { x: number; y: number; r: number }, k: number) => {
    const r = g.r * k
    ctx.moveTo(g.x, g.y - r * 1.3); ctx.lineTo(g.x + r, g.y); ctx.lineTo(g.x, g.y + r * 1.3); ctx.lineTo(g.x - r, g.y); ctx.closePath()
  }
  for (const [cor, k] of [[pele.contorno, 1.25], [pele.meio, 1], [pele.nucleo, 0.6]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const g of gemas) if (g.r > 0.6) losango(g, k)
    ctx.fill()
  }
  // Faceta de brilho branca: a pedra preciosa reluz.
  ctx.fillStyle = '#ffffff'; ctx.beginPath()
  for (const g of gemas) {
    if (g.r < 1) continue
    ctx.moveTo(g.x, g.y - g.r * 1.2); ctx.lineTo(g.x + g.r * 0.9, g.y); ctx.lineTo(g.x, g.y); ctx.closePath()
  }
  ctx.fill()
}

// ---------------------------------------------------------------------------
// T1 — ROCK THROW
// ---------------------------------------------------------------------------

const THROW_SAIDAS = [80, 200] as const
const THROW_VOO = 200

function rockThrow(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semLascas = THROW_SAIDAS.map(() => sortear(rng, 6 * 3))
  const desvios = THROW_SAIDAS.map(() => sortear(rng, 2))
  const b = { x: origem.x + Math.cos(c.angulo) * 6, y: origem.y - 6 }
  const pedras: Pedra[] = []
  const poeira: { p: Ponto; t: number; k: number }[] = []
  THROW_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 8, y: alvo.y + (desvios[i][1] - 0.5) * 6 }
    const u = (ms - sai) / THROW_VOO
    if (u >= 0 && u < 1) {
      // Arco alto: pedra arremessada tem peso, sobe e desce.
      pedras.push({ x: b.x + (fim.x - b.x) * u, y: b.y + (fim.y - b.y) * u - Math.sin(Math.PI * u) * 16, r: 3.2, giro: u * 5 + i, s: desvios[i][0] })
    }
    pedras.push(...lascas(fim, ms - sai - THROW_VOO, semLascas[i], 0.9))
    poeira.push({ p: { x: fim.x, y: fim.y + 8 }, t: (ms - sai - THROW_VOO) / 420, k: 0.7 })
  })
  baque(ctx, poeira, pele)
  pintarPedras(ctx, pedras, pele)
}

// ---------------------------------------------------------------------------
// T2 — ROCK TOMB
// ---------------------------------------------------------------------------

const TOMB_CAI = [140, 200, 260, 320] as const
const TOMB_QUEDA = 160
const TOMB_RACHA = 760

function rockTomb(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semLascas = sortear(rng, 12 * 3)
  const giro0 = rng() * TAU
  const chao = pe(alvo)
  const lajes: { x: number; y: number; h: number; w: number; incl: number }[] = []
  const poeira: { p: Ponto; t: number; k: number }[] = []
  // Quatro lajes caem do alto em volta do alvo, uma por vez, e ficam de pe.
  TOMB_CAI.forEach((t0, i) => {
    const a = giro0 + (i / 4) * TAU
    const p = { x: chao.x + Math.cos(a) * 11, y: chao.y + Math.sin(a) * 5 }
    const u = (ms - t0) / TOMB_QUEDA
    if (u < 0) return
    const cai = u < 1 ? (1 - entrada(u)) * 40 : 0
    const racha = limitar((ms - TOMB_RACHA) / 160)
    if (racha >= 1) return
    lajes.push({ x: p.x, y: p.y - cai, h: 16 * (1 - racha * 0.5), w: 5 * (1 - racha), incl: (Math.cos(a) > 0 ? -1 : 1) * 0.12 })
    poeira.push({ p, t: (ms - t0 - TOMB_QUEDA) / 380, k: 0.7 })
  })
  // As lajes da frente sao pintadas depois (cobrem o alvo por baixo, nao por cima).
  lajes.sort((p, q) => p.y - q.y)
  baque(ctx, poeira, pele)
  pintarAgulhas(ctx, lajes, pele)
  // Racha: tudo estilhaca de uma vez.
  pintarPedras(ctx, lascas({ x: chao.x, y: chao.y - 8 }, ms - TOMB_RACHA, semLascas, 1.2, 560), pele)
}

// ---------------------------------------------------------------------------
// T3 — POWER GEM
// ---------------------------------------------------------------------------

const GEM_FORMA = 60
const GEM_DISPARA = 320
const GEM_CHEGA = 420

function powerGem(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semRaios = sortear(rng, 12 * 2)
  const semBrilhos = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 6, y: origem.y - 10 }
  // Tres gemas se formam girando acima de quem lanca.
  const gemas: { x: number; y: number; r: number }[] = []
  if (ms < GEM_CHEGA) {
    for (let i = 0; i < 3; i++) {
      const forma = saida(limitar((ms - GEM_FORMA - i * 60) / 140))
      const vai = entrada(limitar((ms - GEM_DISPARA) / (GEM_CHEGA - GEM_DISPARA)))
      const a = (i / 3) * TAU + ms * 0.008
      const x0 = b.x + Math.cos(a) * 9, y0 = b.y + Math.sin(a) * 4
      gemas.push({ x: x0 + (alvo.x - x0) * vai, y: y0 + (alvo.y - y0) * vai, r: 4.2 * forma })
    }
  }
  // Feixe de lascas de luz: tracos afinados que correm das gemas ao alvo.
  if (ms >= GEM_DISPARA && ms < GEM_CHEGA + 160) {
    const t = (ms - GEM_DISPARA) / (GEM_CHEGA - GEM_DISPARA + 160)
    ctx.fillStyle = pele.nucleo
    ctx.beginPath()
    for (let i = 0; i < 12; i++) {
      const u = limitar(t * 1.4 - semRaios[i * 2] * 0.4)
      const off = (semRaios[i * 2 + 1] - 0.5) * 8
      const x = b.x + (alvo.x - b.x) * u, y = b.y + (alvo.y - b.y) * u + off * (1 - u)
      afinado(ctx, x, y, x - (alvo.x - b.x) * 0.15, y - (alvo.y - b.y) * 0.15, 2.4)
    }
    ctx.fill()
  }
  pintarGemas(ctx, gemas, pele)
  // Brilho que fica: a rocha que reluz.
  const brilhos: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 8; i++) {
    const t = (ms - GEM_CHEGA - i * 40) / 380
    if (t < 0 || t > 1) continue
    brilhos.push({ x: alvo.x + (semBrilhos[i * 3] - 0.5) * 26, y: alvo.y + (semBrilhos[i * 3 + 1] - 0.5) * 20, r: em(semBrilhos[i * 3 + 2], 1.6, 2.8) * (Math.floor(ms / 60 + i) % 2 ? 1 : 0.6) * encolhe(t) })
  }
  pintarBrilhos(ctx, brilhos, pele, pele.estrela, pele.nucleo)
  if (ms >= GEM_CHEGA && ms < GEM_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - GEM_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — STONE EDGE
// ---------------------------------------------------------------------------

const EDGE_ROMPE = 260
const EDGE_CENTRO = 440
const EDGE_ESTILHACA = 900

function stoneEdge(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const giro0 = rng() * TAU
  const semAgulhas = sortear(rng, 7 * 2)
  const semLascas = sortear(rng, 16 * 3)
  const semEstrela = sortear(rng, 9)
  const chao = pe(alvo)
  const agulhas: { x: number; y: number; h: number; w: number; incl: number }[] = []
  const poeira: { p: Ponto; t: number; k: number }[] = []
  // Anel de seis agulhas rompendo uma a uma, inclinadas pra dentro.
  for (let i = 0; i < 6; i++) {
    const a = giro0 + (i / 6) * TAU
    const t0 = EDGE_ROMPE + i * 30
    const sobe = saida(limitar((ms - t0) / 90)) * (1 - limitar((ms - EDGE_ESTILHACA) / 80))
    if (sobe <= 0) continue
    const p = { x: chao.x + Math.cos(a) * 18, y: chao.y + Math.sin(a) * 8 }
    agulhas.push({ x: p.x, y: p.y, h: em(semAgulhas[i * 2], 16, 24) * sobe, w: 4, incl: -Math.cos(a) * 0.25 })
    poeira.push({ p, t: (ms - t0) / 360, k: 0.6 })
  }
  // A maior rompe POR BAIXO do alvo.
  const sobe = saida(limitar((ms - EDGE_CENTRO) / 80)) * (1 - limitar((ms - EDGE_ESTILHACA) / 80))
  if (sobe > 0) agulhas.push({ x: chao.x, y: chao.y + 2, h: 38 * sobe, w: 7, incl: 0.05 })
  poeira.push({ p: chao, t: (ms - EDGE_CENTRO) / 420, k: 1 })
  agulhas.sort((p, q) => p.y - q.y)
  baque(ctx, poeira, pele)
  pintarAgulhas(ctx, agulhas, pele)
  // Estilhaca tudo: lascas de todas as agulhas.
  pintarPedras(ctx, lascas({ x: chao.x, y: chao.y - 14 }, ms - EDGE_ESTILHACA, semLascas, 1.5, 600), pele)
  if (ms >= EDGE_CENTRO && ms < EDGE_CENTRO + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - EDGE_CENTRO) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

// A2 — ROCK SLIDE: pedras caem do ceu pelo interior todo.
const SLIDE_INICIO = 100
const SLIDE_QUEDA = 260

function rockSlide(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semLascas = pontos.map(() => sortear(rng, 5 * 3))
  const semRiscos = sortear(rng, 12)
  const pedras: Pedra[] = []
  const poeira: { p: Ponto; t: number; k: number }[] = []
  ctx.fillStyle = pele.nucleo
  ctx.beginPath()
  pontos.forEach(({ p, d }, i) => {
    // Caem do centro pra borda, com um pouco de acaso no ritmo.
    const t0 = chegaEm(SLIDE_INICIO, 500, d, raio) + semRiscos[i] * 60
    const pedra = caindo(p, 80 * k * 0.6, 5 * k * 0.6, ms - t0, SLIDE_QUEDA, semRiscos[i])
    if (pedra) {
      pedras.push(pedra)
      // Risco de queda acima da pedra.
      afinado(ctx, pedra.x, pedra.y - pedra.r, pedra.x, pedra.y - pedra.r - 12 * k * 0.5, 1.6)
    }
    pedras.push(...lascas(p, ms - t0 - SLIDE_QUEDA, semLascas[i], k * 0.7, 480))
    poeira.push({ p, t: (ms - t0 - SLIDE_QUEDA) / 420, k: k * 0.55 })
  })
  ctx.fill()
  baque(ctx, poeira, pele)
  pintarPedras(ctx, pedras, pele)
}

// A3 — (critico): blocos maiores + agulhas no interior + cerca de pedra na borda.
function avalanche(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 14, rng() * TAU)
  const semLascas = pontos.map(() => sortear(rng, 6 * 3))
  const semRitmo = sortear(rng, 14)
  const semCerca = sortear(rng, 18)
  const pedras: Pedra[] = []
  const agulhas: { x: number; y: number; h: number; w: number; incl: number }[] = []
  const poeira: { p: Ponto; t: number; k: number }[] = []
  pontos.forEach(({ p, d }, i) => {
    const t0 = chegaEm(80, 600, d, raio) + semRitmo[i] * 80
    // Metade cai do alto, metade rompe do chao — o critico tem os dois.
    if (i % 2 === 0) {
      const pedra = caindo(p, 100 * k * 0.6, 6.2 * k * 0.6, ms - t0, 280, semRitmo[i])
      if (pedra) pedras.push(pedra)
    } else {
      const sobe = saida(limitar((ms - t0 - 200) / 90)) * (1 - limitar((ms - 1250) / 80))
      if (sobe > 0) agulhas.push({ x: p.x, y: p.y, h: 30 * k * 0.6 * sobe, w: 5 * k * 0.6, incl: (semRitmo[i] - 0.5) * 0.3 })
    }
    pedras.push(...lascas(p, ms - t0 - 280, semLascas[i], k * 0.75, 500))
    poeira.push({ p, t: (ms - t0 - 280) / 420, k: k * 0.6 })
  })
  // Cerca: agulhas baixas rompendo pela borda inteira.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU
    const p = { x: centro.x + Math.cos(a) * raio * 0.97, y: centro.y + 12 + Math.sin(a) * raio * 0.97 * 0.45 }
    const sobe = saida(limitar((ms - 700 - semCerca[i] * 120) / 100)) * (1 - limitar((ms - 1300) / 100))
    if (sobe > 0) agulhas.push({ x: p.x, y: p.y, h: 14 * k * 0.6 * sobe, w: 3.2 * k * 0.6, incl: 0 })
  }
  agulhas.sort((p, q) => p.y - q.y)
  baque(ctx, poeira, pele)
  pintarAgulhas(ctx, agulhas, pele)
  pintarPedras(ctx, pedras, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DA_ROCHA = {
  single: { 1: 'rock_throw', 2: 'rock_tomb', 3: 'power_gem', 4: 'stone_edge' },
  area: { 2: 'rock_slide', 3: 'aoe50_rock' },
} as const

export const ROCHA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: rockThrow, duracao: { 1: 1000 }, alcance: 34, impactos: { 1: THROW_SAIDAS.map(s => s + THROW_VOO) } },
  2: { desenhar: rockTomb, duracao: { 2: 1500 }, alcance: 50, impactos: { 2: [TOMB_CAI[0] + TOMB_QUEDA] } },
  3: { desenhar: powerGem, duracao: { 3: 1100 }, alcance: 34, impactos: { 3: [GEM_CHEGA] } },
  4: { desenhar: stoneEdge, duracao: { 4: 1600 }, alcance: 60, impactos: { 4: [EDGE_CENTRO] } },
}, false)

/** Sem A1: nenhum golpe de rocha em area cai nele (ver cabecalho). */
export const ROCHA_AREA: Partial<Record<1 | 2 | 3, EntradaDeCoreografia>> = comImpacto({
  2: { desenhar: rockSlide, duracao: { 2: 1500 }, alcance: 80, impactos: { 2: [SLIDE_INICIO + SLIDE_QUEDA + 60] } },
  3: { desenhar: avalanche, duracao: { 3: 1800 }, alcance: 100, impactos: { 3: [360, 900] } },
}, true)
