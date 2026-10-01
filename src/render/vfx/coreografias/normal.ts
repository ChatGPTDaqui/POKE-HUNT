// NORMAL — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (dono, 28/09: "normal seria um hit, uma pancada"): NORMAL nao
// tem elemento — e forca cinetica pura, a linguagem de jogo de luta e de manga:
//   - FAISCA DE GOLPE: agulhas brancas que disparam do ponto de impacto e
//     encurtam pela base (o "hit spark"). Seca e angulosa, nunca nuvem.
//   - LINHAS DE VELOCIDADE: tracos retos que dizem de onde veio o golpe.
//   - QUADRO DE IMPACTO: no tier alto a cena inteira ganha linhas de
//     concentracao apontando pro alvo, re-sorteadas aos trancos (licao do
//     Thunder, 29/09: tier alto imponente = mudar a cena, nao engrossar o traco).
//   - POEIRA: o chao reage ao peso (Body Slam, Explosion), em bolotas cinzas.
//   Nada flutua nem escorre: tudo e instantaneo e para seco.
//
//   T1 Pound         dois tapas secos: duas faiscas pequenas em sequencia.
//   T2 Headbutt      investida: linhas de velocidade da origem ao alvo e uma
//                    faisca grande com cruz de impacto.
//   T3 Body Slam     o peso cai de cima: linhas verticais, faisca enorme,
//                    estrela e poeira levantando dos dois lados.
//   T4 Giga Impact   carga com linhas girando em volta de quem lanca, arrancada
//                    e o QUADRO DE IMPACTO: linhas de concentracao na cena toda,
//                    clarao, faisca gigante e um segundo estouro.
//   A1 Swift         estrelas de 5 pontas saem girando e caem pela area inteira.
//   A2 Hyper Voice   ondas de som em anel correm pelo chao ate a borda; cada
//                    alvo por onde passam leva uma faisca.
//   A3 Explosion     nucleo branco, clarao que cobre a area, anel de choque que
//                    para na borda, faiscas e poeira pela area toda.
//
// AREA preenche o interior e a borda marca o limite (dono, 29/09 e 30/09).
import { rngSemeado } from '../aleatorio'
import { NEUTROS } from '../paletas'
import { estrelaDeImpacto, limitar, massaEmCamadas, riscos, saida, type Bolha } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { comImpacto } from '../acabamento'

const TAU = Math.PI * 2
const [ESCURO, BRANCO] = NEUTROS
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
// Faisca de golpe (agulhas)
// ---------------------------------------------------------------------------

interface Faisca { p: Ponto; t0: number; dura: number; n: number; R: number; L: number; W: number; sem: readonly number[] }

/** 3 numeros por agulha. */
const POR_AGULHA = 3

/**
 * Todas as faiscas do quadro numa chamada por camada: contorno escuro por
 * baixo, agulha branca por cima. Cada agulha dispara do centro (`R` e quanto
 * anda), tem comprimento `L` e largura `W`, e encurta pela base ao morrer.
 */
function pintarFaiscas(ctx: CanvasRenderingContext2D, ms: number, faiscas: readonly Faisca[]): void {
  for (const [cor, dl, dw] of [[ESCURO, 1.3, 0.9], [BRANCO, 0, 0]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const f of faiscas) {
      const t = (ms - f.t0) / f.dura
      if (t < 0 || t >= 1) continue
      for (let i = 0; i < f.n; i++) {
        const a = ((i + f.sem[i * POR_AGULHA] * 0.7) / f.n) * TAU
        const ux = Math.cos(a), uy = Math.sin(a) * 0.8
        const d = f.R * saida(t) * em(f.sem[i * POR_AGULHA + 1], 0.35, 1)
        const L = f.L * em(f.sem[i * POR_AGULHA + 2], 0.7, 1.25) * (1 - 0.65 * t) + dl
        const w = f.W * (1 - t) + dw
        if (w <= 0.2) continue
        const bx = f.p.x + ux * d, by = f.p.y + uy * d
        ctx.moveTo(bx + ux * L, by + uy * L)
        ctx.lineTo(bx - uy * w, by + ux * w)
        ctx.lineTo(bx - ux * L * 0.25, by - uy * L * 0.25)
        ctx.lineTo(bx + uy * w, by - ux * w)
        ctx.closePath()
      }
    }
    ctx.fill()
  }
}

/** Cruz de impacto: estalo branco de 4 pontas no ponto exato do golpe. */
function cruz(ctx: CanvasRenderingContext2D, p: Ponto, r: number): void {
  if (r <= 0.5) return
  for (const [cor, k] of [[ESCURO, 1.35], [BRANCO, 1]] as const) {
    const L = r * k, w = Math.max(1, r * 0.22) * k
    ctx.fillStyle = cor; ctx.beginPath()
    ctx.moveTo(p.x, p.y - L); ctx.lineTo(p.x + w, p.y); ctx.lineTo(p.x, p.y + L); ctx.lineTo(p.x - w, p.y); ctx.closePath()
    ctx.moveTo(p.x - L, p.y); ctx.lineTo(p.x, p.y + w); ctx.lineTo(p.x + L, p.y); ctx.lineTo(p.x, p.y - w); ctx.closePath()
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// Linhas (velocidade e concentracao)
// ---------------------------------------------------------------------------

interface Traco { x0: number; y0: number; x1: number; y1: number; w: number }

/** Tracos em cunha (grossos numa ponta, finos na outra), contorno + cor. */
function pintarTracos(ctx: CanvasRenderingContext2D, tracos: readonly Traco[], cor: string): void {
  for (const [c, dw] of [[ESCURO, 0.8], [cor, 0]] as const) {
    ctx.fillStyle = c; ctx.beginPath()
    for (const t of tracos) {
      const dx = t.x1 - t.x0, dy = t.y1 - t.y0, L = Math.hypot(dx, dy) || 1
      const nx = -dy / L, ny = dx / L, w = t.w + dw
      ctx.moveTo(t.x0 + nx * w, t.y0 + ny * w)
      ctx.lineTo(t.x1 + nx * 0.3, t.y1 + ny * 0.3)
      ctx.lineTo(t.x1 - nx * 0.3, t.y1 - ny * 0.3)
      ctx.lineTo(t.x0 - nx * w, t.y0 - ny * w)
      ctx.closePath()
    }
    ctx.fill()
  }
}

/**
 * Linhas de velocidade: tracos paralelos a `de -> ate`, espalhados de lado.
 * A frente corre ate o alvo e PARA nele (nunca passa); depois a cauda alcanca
 * a frente e o traco some dentro do alvo. `t` 0..1. Cauda grossa pra tras.
 */
function linhasDeVelocidade(de: Ponto, ate: Ponto, n: number, largura: number, t: number, sem: readonly number[]): Traco[] {
  const out: Traco[] = []
  if (t < 0 || t >= 1) return out
  const dx = ate.x - de.x, dy = ate.y - de.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  for (let i = 0; i < n; i++) {
    // Estreita perto do alvo: as linhas convergem pro ponto do golpe.
    const frente = L * saida(limitar(t * 1.7 - sem[i * 3 + 2] * 0.35))
    const comp = L * em(sem[i * 3 + 1], 0.35, 0.7) * (1 - limitar((t - 0.55) / 0.45))
    const tras = Math.max(0, frente - comp)
    if (frente - tras < 1.5) continue
    // Faixas iguais de lado a lado: sorteado livre, as linhas grudavam num bloco so.
    const lado = em((i + 0.2 + sem[i * 3] * 0.6) / n, -largura, largura)
    const aperto = (u: number) => lado * (1 - 0.6 * (u / L))
    out.push({
      x0: de.x + ux * tras - uy * aperto(tras), y0: de.y + uy * tras + ux * aperto(tras),
      x1: de.x + ux * frente - uy * aperto(frente), y1: de.y + uy * frente + ux * aperto(frente), w: 1.1,
    })
  }
  return out
}

/**
 * Linhas de concentracao do quadro de impacto: cunhas de fora pra dentro
 * apontando pro alvo, deixando um vazio em volta dele. Re-sorteadas a cada
 * `PASSO_DO_QUADRO` ms — o tremido seco do manga.
 */
const PASSO_DO_QUADRO = 60

function linhasDeConcentracao(alvo: Ponto, n: number, dentro: number, fora: number, ms: number, semente: number): Traco[] {
  const r = rngSemeado(semente + Math.floor(ms / PASSO_DO_QUADRO) * 7919)
  const out: Traco[] = []
  for (let i = 0; i < n; i++) {
    const a = ((i + r() * 0.8) / n) * TAU
    const ri = dentro * em(r(), 0.9, 1.5), ro = fora * em(r(), 0.85, 1.1)
    const ux = Math.cos(a), uy = Math.sin(a) * 0.75
    out.push({ x0: alvo.x + ux * ro, y0: alvo.y + uy * ro, x1: alvo.x + ux * ri, y1: alvo.y + uy * ri, w: em(r(), 1.2, 2.6) })
  }
  return out
}

// ---------------------------------------------------------------------------
// Poeira
// ---------------------------------------------------------------------------

/**
 * Tufo de poeira que levanta de `p` pra fora (`dir` -1 esquerda, 1 direita, 0
 * pra cima), inchando e sumindo. 3 numeros por bolota.
 */
function poeira(ms: number, p: Ponto, t0: number, dura: number, n: number, dir: number, tam: number, sem: readonly number[]): Bolha[] {
  const out: Bolha[] = []
  for (let i = 0; i < n; i++) {
    const t = (ms - t0 - sem[i * 3 + 2] * dura * 0.25) / dura
    if (t < 0 || t >= 1) continue
    const u = saida(t)
    const x = p.x + (dir === 0 ? em(sem[i * 3], -1, 1) : dir * em(sem[i * 3], 0.3, 1)) * tam * 6 * u
    const y = p.y - em(sem[i * 3 + 1], 0.2, 1) * tam * 3 * u
    const r = tam * em(sem[i * 3 + 1], 0.6, 1) * (0.5 + u) * (1 - t * t)
    if (r > 0.4) out.push({ x, y, r, ang: 0 })
  }
  return out
}

function pintarPoeira(ctx: CanvasRenderingContext2D, bolotas: readonly Bolha[], pele: Pele): void {
  if (bolotas.length) massaEmCamadas(ctx, bolotas, pele, 'circulo', 3)
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })
const peito = (p: Ponto): Ponto => ({ x: p.x, y: p.y - 4 })

// ---------------------------------------------------------------------------
// T1 — POUND: dois tapas secos
// ---------------------------------------------------------------------------

const POUND_TAPAS = [110, 270] as const

function pound(c: ContextoVfx): void {
  const { ctx, ms, alvo, rng } = c
  const semTapas = POUND_TAPAS.map(() => sortear(rng, 7 * POR_AGULHA))
  const semLado = sortear(rng, 4)
  // Faisca no piso de legibilidade: agulha menor que isso vira ruido no pixelizador.
  const faiscas: Faisca[] = POUND_TAPAS.map((t0, i) => ({
    p: { x: alvo.x + em(semLado[i * 2], -5, 5), y: alvo.y - 4 + em(semLado[i * 2 + 1], -4, 3) },
    t0, dura: 220, n: 7, R: 11, L: 9, W: 2.3, sem: semTapas[i],
  }))
  pintarFaiscas(ctx, ms, faiscas)
  for (const f of faiscas) { const e = ms - f.t0; if (e >= 0 && e < 90) cruz(ctx, f.p, 7 * (1 - e / 90)) }
}

// ---------------------------------------------------------------------------
// T2 — HEADBUTT: investida com linhas de velocidade
// ---------------------------------------------------------------------------

const HEAD_BATE = 240

function headbutt(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semLinhas = sortear(rng, 7 * 3)
  const semFaisca = sortear(rng, 9 * POR_AGULHA)
  const semResto = sortear(rng, 5 * POR_AGULHA)
  const p = peito(alvo)
  pintarTracos(ctx, linhasDeVelocidade(b, p, 7, 10, ms / (HEAD_BATE + 120), semLinhas), pele.meio)
  pintarFaiscas(ctx, ms, [
    { p, t0: HEAD_BATE, dura: 280, n: 9, R: 14, L: 9, W: 2.2, sem: semFaisca },
    // Resto do golpe: faiscas menores que saem um pouco depois, o "eco".
    { p, t0: HEAD_BATE + 70, dura: 240, n: 5, R: 20, L: 5, W: 1.3, sem: semResto },
  ])
  const e = ms - HEAD_BATE
  if (e >= 0 && e < 110) cruz(ctx, p, 9 * (1 - e / 110))
}

// ---------------------------------------------------------------------------
// T3 — BODY SLAM: o peso cai de cima
// ---------------------------------------------------------------------------

const SLAM_CAI = 320

function bodySlam(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semQueda = sortear(rng, 9 * 3)
  const semFaisca = sortear(rng, 12 * POR_AGULHA)
  const semPoeira = [sortear(rng, 8 * 3), sortear(rng, 8 * 3)]
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 10 * 3)
  const p = peito(alvo)
  const chao = { x: alvo.x, y: alvo.y + 8 }
  // Linhas verticais de cima pro alvo: o corpo desabando.
  pintarTracos(ctx, linhasDeVelocidade({ x: p.x, y: p.y - 55 }, p, 7, 13, ms / (SLAM_CAI + 100), semQueda), pele.meio)
  // Poeira dos dois lados, rente ao chao.
  const bolotas = [...poeira(ms, { x: chao.x - 6, y: chao.y }, SLAM_CAI, 520, 8, -1, 3.4, semPoeira[0]), ...poeira(ms, { x: chao.x + 6, y: chao.y }, SLAM_CAI, 520, 8, 1, 3.4, semPoeira[1])]
  pintarPoeira(ctx, bolotas, pele)
  pintarFaiscas(ctx, ms, [{ p, t0: SLAM_CAI, dura: 340, n: 12, R: 20, L: 12, W: 2.8, sem: semFaisca }])
  const e = ms - SLAM_CAI
  if (e >= 0 && e < 240) estrelaDeImpacto(ctx, p, 15, e / 240, pele, fila(semEstrela))
  if (e >= 0 && e < 320) riscos(ctx, p, 10, 30, e / 320, pele.nucleo, fila(semRiscos))
  if (e >= 0 && e < 90) cruz(ctx, p, 12 * (1 - e / 90))
}

// ---------------------------------------------------------------------------
// T4 — GIGA IMPACT: o quadro de impacto
// ---------------------------------------------------------------------------
//
//   carga      linhas de velocidade girando em volta de quem lanca, cada vez
//              mais curtas e rapidas.
//   arrancada  feixe de linhas de velocidade grossas ate o alvo.
//   impacto    a CENA muda: linhas de concentracao de fora pra dentro, clarao
//              branco chapado, faisca gigante, estrela e riscos.
//   estouro    150 ms depois, um segundo estouro de agulhas maiores.

const GIGA_CARGA = 520
const GIGA_BATE = 640
const GIGA_QUADRO = 300
const GIGA_ESTOURO = GIGA_BATE + 160

function gigaImpact(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const b = boca(c)
  const semGiro = sortear(rng, 14 * 2)
  const semLinhas = sortear(rng, 16 * 3)
  const semFaisca = sortear(rng, 16 * POR_AGULHA)
  const semEstouro = sortear(rng, 12 * POR_AGULHA)
  const semPoeira = [sortear(rng, 8 * 3), sortear(rng, 8 * 3)]
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 16 * 3)
  const semQuadro = Math.floor(sortear(rng, 1)[0] * 1e6)
  const p = peito(alvo)
  const tracos: Traco[] = []

  // Carga: tracos curtos orbitando quem lanca, apertando o giro.
  if (ms < GIGA_CARGA) {
    const t = ms / GIGA_CARGA
    for (let i = 0; i < 14; i++) {
      const a = semGiro[i * 2] * TAU + t * t * 14
      const r = 20 - 8 * t, comp = 0.5 + semGiro[i * 2 + 1] * 0.5
      const x0 = origem.x + Math.cos(a) * r, y0 = origem.y - 6 + Math.sin(a) * r * 0.5
      const x1 = origem.x + Math.cos(a + comp) * r, y1 = origem.y - 6 + Math.sin(a + comp) * r * 0.5
      tracos.push({ x0, y0, x1, y1, w: 1.2 })
    }
  }
  // Arrancada: feixe grosso de linhas de velocidade.
  tracos.push(...linhasDeVelocidade(b, p, 16, 10, (ms - GIGA_CARGA) / (GIGA_BATE - GIGA_CARGA + 160), semLinhas).map(t => ({ ...t, w: 1.8 })))
  // Quadro de impacto: a cena inteira aponta pro alvo.
  const q = ms - GIGA_BATE
  if (q >= 0 && q < GIGA_QUADRO) tracos.push(...linhasDeConcentracao(p, 26, 28, 105, ms, semQuadro))
  pintarTracos(ctx, tracos, pele.nucleo)

  const chao = { x: alvo.x, y: alvo.y + 8 }
  pintarPoeira(ctx, [...poeira(ms, { x: chao.x - 8, y: chao.y }, GIGA_BATE, 640, 8, -1, 4.2, semPoeira[0]), ...poeira(ms, { x: chao.x + 8, y: chao.y }, GIGA_BATE, 640, 8, 1, 4.2, semPoeira[1])], pele)
  // Clarao: disco branco chapado que estoura e encolhe.
  if (q >= 0 && q < 120) {
    const r = 22 * (1 - q / 120)
    ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.4, 0, TAU); ctx.fill()
    ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill()
  }
  pintarFaiscas(ctx, ms, [
    { p, t0: GIGA_BATE, dura: 380, n: 16, R: 30, L: 16, W: 3.4, sem: semFaisca },
    { p, t0: GIGA_ESTOURO, dura: 360, n: 12, R: 40, L: 12, W: 2.6, sem: semEstouro },
  ])
  if (q >= 0 && q < 320) estrelaDeImpacto(ctx, p, 24, q / 320, pele, fila(semEstrela))
  if (q >= 0 && q < 460) riscos(ctx, p, 16, 50, q / 460, pele.nucleo, fila(semRiscos))
  if (q >= 0 && q < 110) cruz(ctx, p, 16 * (1 - q / 110))
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

// A1 — SWIFT: estrelas de 5 pontas caem pela area inteira
const SWIFT_DENTRO = 14
const SWIFT_BORDA = 12
const SWIFT_SAI = 60
const SWIFT_VOO = 420

interface Estrela5 { x: number; y: number; r: number; giro: number }

function pintarEstrelas5(ctx: CanvasRenderingContext2D, estrelas: readonly Estrela5[], pele: Pele): void {
  for (const [cor, k] of [[ESCURO, 1.3], [pele.meio, 1], [pele.nucleo, 0.55]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const e of estrelas) {
      const r = e.r * k + (k > 1.2 ? 0.8 : 0)
      for (let i = 0; i <= 10; i++) {
        const a = e.giro - Math.PI / 2 + (i / 10) * TAU, rr = i % 2 ? r * 0.45 : r
        const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }
    ctx.fill()
  }
}

function swift(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.8)
  const n = SWIFT_DENTRO + SWIFT_BORDA
  const sem = sortear(rng, n * 2)
  const semFaiscas = Array.from({ length: n }, () => sortear(rng, 5 * POR_AGULHA))
  const estrelas: Estrela5[] = [], faiscas: Faisca[] = []
  const lancamento = { x: centro.x, y: centro.y - 16 }
  for (let i = 0; i < n; i++) {
    const naBorda = i >= SWIFT_DENTRO, j = naBorda ? i - SWIFT_DENTRO : i
    const fim = naBorda ? noChao(centro, ((j + sem[i * 2] * 0.6) / SWIFT_BORDA) * TAU, R * 0.96) : vogel(centro, R, j, SWIFT_DENTRO, 0.85, sem[i * 2] * 0.3)
    const destino = { x: fim.x, y: fim.y - 6 }
    const d = Math.hypot(destino.x - lancamento.x, (destino.y - lancamento.y) / 0.45) / R
    const sai = SWIFT_SAI + sem[i * 2 + 1] * 140, voo = SWIFT_VOO * (0.5 + 0.5 * d)
    const u = (ms - sai) / voo
    if (u >= 0 && u < 1) {
      // Arco alto: sobe e cai no ponto — com dois rastros menores atras.
      for (const [atras, esc] of [[0, 1], [0.08, 0.62], [0.16, 0.38]] as const) {
        const uu = u - atras
        if (uu < 0) continue
        const x = lancamento.x + (destino.x - lancamento.x) * uu
        const y = lancamento.y + (destino.y - lancamento.y) * uu - Math.sin(Math.PI * uu) * (30 + 40 * d) * Math.min(k, 1.4)
        estrelas.push({ x, y, r: 3.4 * Math.min(k, 1.5) * esc, giro: ms * 0.02 + i })
      }
    }
    faiscas.push({ p: destino, t0: sai + voo, dura: 200, n: 5, R: 8, L: 5, W: 1.4, sem: semFaiscas[i] })
  }
  pintarEstrelas5(ctx, estrelas, pele)
  pintarFaiscas(ctx, ms, faiscas)
}

// A2 — HYPER VOICE: ondas de som em anel pelo chao; faisca onde a onda passa
const VOZ_ONDAS = [80, 220, 360] as const
const VOZ_CORRE = 460
const VOZ_ALVOS = 16

function hyperVoice(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.8)
  const semAlvos = Array.from({ length: VOZ_ALVOS }, () => sortear(rng, 6 * POR_AGULHA))
  const semGiro = sortear(rng, 1)[0] * TAU
  // Anel de som: faixa chapada deitada no chao, da mais grossa (primeira) pra mais fina.
  VOZ_ONDAS.forEach((t0, i) => {
    const t = (ms - t0) / VOZ_CORRE
    if (t < 0) return
    // A ultima onda PARA na borda e fica marcando o limite antes de sumir.
    const fim = i === VOZ_ONDAS.length - 1
    if (t >= (fim ? 1.6 : 1)) return
    const d = R * 0.98 * saida(limitar(t))
    const w = (fim ? 3.2 : 2.4 - i * 0.4) * k * (t > 1 ? 1 - (t - 1) / 0.6 : 1)
    if (d < 2 || w < 0.3) return
    for (const [cor, dw] of [[ESCURO, 1.2], [pele.meio, 0]] as const) {
      ctx.strokeStyle = cor; ctx.lineWidth = w + dw
      ctx.beginPath(); ctx.ellipse(centro.x, centro.y + 12, d, d * 0.45, 0, 0, TAU); ctx.stroke()
    }
  })
  // Quem estiver no caminho leva a faisca quando a primeira onda passa.
  const faiscas: Faisca[] = []
  for (let i = 0; i < VOZ_ALVOS; i++) {
    const p = vogel(centro, R, i, VOZ_ALVOS, 0.9, semGiro)
    const d = Math.hypot(p.x - centro.x, (p.y - centro.y - 12) / 0.45) / R
    // Inverso de saida(t) = d: quando a frente da primeira onda chega em d.
    const chega = VOZ_ONDAS[0] + VOZ_CORRE * (1 - Math.cbrt(1 - Math.min(0.99, d / 0.98)))
    faiscas.push({ p: { x: p.x, y: p.y - 7 }, t0: chega, dura: 220, n: 6, R: 9 * Math.min(k, 1.4), L: 6, W: 1.6, sem: semAlvos[i] })
  }
  pintarFaiscas(ctx, ms, faiscas)
}

// A3 — EXPLOSION: nucleo, clarao que cobre a area, anel de choque, poeira
const EXPLO_NUCLEO = 180
const EXPLO_CLARAO = 150
const EXPLO_ANEL = 360
const EXPLO_ALVOS = 18
const EXPLO_POEIRA = 14

function explosion(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semAlvos = Array.from({ length: EXPLO_ALVOS }, () => sortear(rng, 7 * POR_AGULHA))
  const semPoeira = Array.from({ length: EXPLO_POEIRA }, () => sortear(rng, 5 * 3))
  const semCentro = sortear(rng, 20 * POR_AGULHA)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 16 * 3)
  const semGiro = sortear(rng, 1)[0] * TAU
  const chao = { x: centro.x, y: centro.y + 12 }
  const meio = { x: centro.x, y: centro.y - 6 }

  // Nucleo: bola branca que incha no corpo de quem lanca.
  if (ms < EXPLO_NUCLEO + 40) {
    const r = 3 + 11 * saida(limitar(ms / EXPLO_NUCLEO)) * k * 0.6
    ctx.fillStyle = ESCURO; ctx.beginPath(); ctx.arc(meio.x, meio.y, r + 1.4, 0, TAU); ctx.fill()
    ctx.fillStyle = BRANCO; ctx.beginPath(); ctx.arc(meio.x, meio.y, r, 0, TAU); ctx.fill()
  }
  const e = ms - EXPLO_NUCLEO
  // Clarao: a elipse do chao inteira fica branca por um instante — pega todo mundo.
  if (e >= 0 && e < EXPLO_CLARAO) {
    const d = R * saida(limitar(e / (EXPLO_CLARAO * 0.5)))
    const buraco = R * limitar((e - EXPLO_CLARAO * 0.5) / (EXPLO_CLARAO * 0.5))
    ctx.fillStyle = BRANCO; ctx.beginPath()
    ctx.ellipse(chao.x, chao.y, d, d * 0.45, 0, 0, TAU)
    if (buraco > 1) ctx.ellipse(chao.x, chao.y, buraco, buraco * 0.45, 0, 0, TAU, true)
    ctx.fill('evenodd')
  }
  // Anel de choque: sai junto com o clarao e para na borda, afinando.
  const a = (e - 40) / EXPLO_ANEL
  if (a >= 0 && a < 1.5) {
    const d = R * 0.98 * saida(limitar(a))
    const w = 4 * k * (a > 1 ? 1 - (a - 1) / 0.5 : 1)
    if (w > 0.3) for (const [cor, dw] of [[ESCURO, 1.4], [pele.nucleo, 0]] as const) {
      ctx.strokeStyle = cor; ctx.lineWidth = w + dw
      ctx.beginPath(); ctx.ellipse(chao.x, chao.y, d, d * 0.45, 0, 0, TAU); ctx.stroke()
    }
  }
  // Poeira levantando pela area inteira, do centro pra fora.
  const bolotas: Bolha[] = []
  for (let i = 0; i < EXPLO_POEIRA; i++) {
    const p = vogel(centro, R, i, EXPLO_POEIRA, 0.9, semGiro + 1)
    const d = Math.hypot(p.x - centro.x, (p.y - chao.y) / 0.45) / R
    bolotas.push(...poeira(ms, p, EXPLO_NUCLEO + 60 + d * EXPLO_ANEL * 0.6, 700, 5, 0, 3.6 * k, semPoeira[i]))
  }
  bolotas.sort((p, q) => p.y - q.y)
  pintarPoeira(ctx, bolotas, pele)
  // Faiscas: o centro estoura grande; cada alvo da area leva a sua quando o anel passa.
  const faiscas: Faisca[] = [{ p: meio, t0: EXPLO_NUCLEO, dura: 420, n: 20, R: 34 * k, L: 16, W: 3.4, sem: semCentro }]
  for (let i = 0; i < EXPLO_ALVOS; i++) {
    const p = vogel(centro, R, i, EXPLO_ALVOS, 0.9, semGiro)
    const d = Math.hypot(p.x - centro.x, (p.y - chao.y) / 0.45) / R
    const chega = EXPLO_NUCLEO + 40 + EXPLO_ANEL * (1 - Math.cbrt(1 - Math.min(0.99, d / 0.98)))
    faiscas.push({ p: { x: p.x, y: p.y - 7 }, t0: chega, dura: 260, n: 7, R: 10 * k, L: 7, W: 1.8, sem: semAlvos[i] })
  }
  pintarFaiscas(ctx, ms, faiscas)
  if (e >= 0 && e < 340) estrelaDeImpacto(ctx, meio, 26, e / 340, pele, fila(semEstrela))
  if (e >= 0 && e < 480) riscos(ctx, meio, 16, 60, e / 480, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_NORMAL = {
  single: { 1: 'pound', 2: 'headbutt', 3: 'body_slam', 4: 'giga_impact' },
  area: { 1: 'swift', 2: 'hyper_voice', 3: 'explosion' },
} as const

export const NORMAL_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: pound, duracao: { 1: 600 }, alcance: 24, impactos: { 1: [...POUND_TAPAS] } },
  2: { desenhar: headbutt, duracao: { 2: 800 }, alcance: 30, impactos: { 2: [HEAD_BATE] } },
  3: { desenhar: bodySlam, duracao: { 3: 1000 }, alcance: 64, impactos: { 3: [SLAM_CAI] } },
  4: { desenhar: gigaImpact, duracao: { 4: 1400 }, alcance: 110, impactos: { 4: [GIGA_BATE, GIGA_ESTOURO] } },
}, false)

export const NORMAL_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: swift, duracao: { 1: 1100 }, alcance: 90, impactos: { 1: [SWIFT_SAI + SWIFT_VOO * 0.6] } },
  2: { desenhar: hyperVoice, duracao: { 2: 1200 }, alcance: 30, impactos: { 2: [VOZ_ONDAS[0] + 150] } },
  3: { desenhar: explosion, duracao: { 3: 1500 }, alcance: 80, impactos: { 3: [EXPLO_NUCLEO] } },
}, true)
