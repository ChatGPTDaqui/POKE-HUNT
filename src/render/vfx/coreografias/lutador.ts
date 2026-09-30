// LUTADOR (FIGHTING) — 4 single + A2 + A3, cada um pensado individualmente.
//
// SEM A1: o catalogo nao tem golpe de area de lutador. A unica area e a
// Explosao Elemental do nivel 50 (poder 70 = A2); o critico sobe pra A3. Nada
// cai no A1, entao ele nao existe (o registro aceita tier ausente).
//
// PERSONALIDADE (o que separa do NORMAL sem olhar a cor): NORMAL e forca crua
// — agulha branca fina, linha de velocidade, quadro de impacto. LUTADOR e o
// CORPO treinado com energia (ki):
//   - CUNHA DE GOLPE: estouro de cunhas GROSSAS (a particula `golpe`), nao
//     agulha fina.
//   - ARCO DE CHOQUE: o "C" de impacto do manga — crescentes que atravessam o
//     alvo pro lado de la, mostrando pra onde a forca foi.
//   - ARCO DE CHUTE: o rastro curvo do pe (crescente grosso varrendo).
//   - AURA: cunhas angulosas subindo em volta de quem concentra — retas e
//     secas, nunca lingua curva (isso seria fogo).
//
//   T1 Double Kick     dois chutes: um varre por baixo, o outro por cima.
//   T2 Force Palm      ki junta na palma, a palma bate e 3 arcos de choque
//                      atravessam o alvo.
//   T3 Sky Uppercut    aura agacha, o gancho sobe num arco vertical enorme e
//                      lanca cunhas e estrias pra cima.
//   T4 Focus Punch     concentracao longa (aura densa, arcos se FECHANDO na
//                      mao), um soco reto e o impacto que atravessa a cena.
//   A2 (Explosao Elemental) soco no chao: a frente de choque e uma coroa de
//                      cunhas que corre ate a borda e fica marcando o limite;
//                      cada alvo por onde passa leva o seu estouro.
//   A3 (critico)       tres pisoes em sequencia + colunas de ki rompendo pela
//                      area inteira.
import { crescente, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
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
// Cunhas
// ---------------------------------------------------------------------------

/** Cunha grossa com a ponta em `ang`: e o "golpe" do manga. */
interface Cunha { x: number; y: number; ang: number; L: number; W: number }

/** Todas as cunhas do quadro: contorno, meio e miolo claro, uma chamada por camada. */
function pintarCunhas(ctx: CanvasRenderingContext2D, cunhas: readonly Cunha[], pele: Pele): void {
  if (!cunhas.length) return
  for (const [cor, k, dl, dw] of [[pele.contorno, 1, 1.4, 1], [pele.meio, 1, 0, 0], [pele.nucleo, 0.5, 0, 0]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const c of cunhas) {
      const L = c.L * k + dl, W = c.W * k + dw
      if (W <= 0.3) continue
      const ux = Math.cos(c.ang), uy = Math.sin(c.ang)
      ctx.moveTo(c.x + ux * L, c.y + uy * L)
      ctx.lineTo(c.x - uy * W, c.y + ux * W)
      ctx.lineTo(c.x - ux * L * 0.4, c.y - uy * L * 0.4)
      ctx.lineTo(c.x + uy * W, c.y - ux * W)
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** 3 numeros por cunha. */
const POR_CUNHA = 3

/**
 * Estouro de cunhas em volta de `p`: disparam pra fora e encurtam. `vies`
 * puxa as direcoes pra um angulo (0 = circulo inteiro, 1 = cone estreito).
 */
function estouro(ms: number, p: Ponto, t0: number, dura: number, n: number, R: number, L: number, W: number, sem: readonly number[], vies = 0, direcao = 0): Cunha[] {
  const out: Cunha[] = []
  const t = (ms - t0) / dura
  if (t < 0 || t >= 1) return out
  for (let i = 0; i < n; i++) {
    const livre = ((i + sem[i * POR_CUNHA] * 0.7) / n) * TAU
    const a = vies ? direcao + (livre - Math.PI) * (1 - vies) : livre
    const d = R * saida(t) * em(sem[i * POR_CUNHA + 1], 0.4, 1)
    out.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * 0.8, ang: a, L: L * em(sem[i * POR_CUNHA + 2], 0.7, 1.2) * (1 - 0.6 * t), W: W * (1 - t) })
  }
  return out
}

/**
 * Aura: cunhas apontando pra cima que nascem em volta de `p` e sobem
 * encurtando, de `t0` a `t1`. 3 numeros por cunha.
 */
function aura(ms: number, p: Ponto, t0: number, t1: number, n: number, largura: number, alto: number, tam: number, sem: readonly number[]): Cunha[] {
  const out: Cunha[] = []
  for (let i = 0; i < n; i++) {
    const nasce = t0 + sem[i * 3] * (t1 - t0 - 220)
    const t = (ms - nasce) / 220
    if (t < 0 || t >= 1) continue
    const x = p.x + em(sem[i * 3 + 1], -largura, largura)
    out.push({ x, y: p.y + 4 - alto * saida(t) * em(sem[i * 3 + 2], 0.6, 1), ang: -Math.PI / 2, L: tam * (1 - 0.5 * t), W: tam * 0.45 * (1 - 0.6 * t) })
  }
  return out
}

/**
 * Arcos de choque: `n` crescentes em "C" abertos pra `direcao`, andando a
 * partir de `p` e crescendo — a forca passando pro lado de la.
 */
function arcosDeChoque(ctx: CanvasRenderingContext2D, ms: number, p: Ponto, t0: number, n: number, direcao: number, R: number, anda: number, esp: number, pele: Pele): void {
  for (let i = 0; i < n; i++) {
    const t = (ms - t0 - i * 60) / 300
    if (t < 0 || t >= 1) continue
    const d = anda * saida(t)
    const c = { x: p.x + Math.cos(direcao) * d, y: p.y + Math.sin(direcao) * d * 0.8 }
    crescente(ctx, c, R * (0.6 + 0.6 * t), direcao - 1.15, direcao + 1.15, esp * (1 - 0.5 * i / n), t, 0, pele, 0.85)
  }
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })
const peito = (p: Ponto): Ponto => ({ x: p.x, y: p.y - 4 })

// ---------------------------------------------------------------------------
// T1 — DOUBLE KICK: um chute por baixo, outro por cima
// ---------------------------------------------------------------------------

const CHUTES = [{ bate: 170, a0: 2.9, a1: 0.5 }, { bate: 360, a0: -2.8, a1: -0.4 }] as const

function doubleKick(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semEstouros = CHUTES.map(() => sortear(rng, 6 * POR_CUNHA))
  const p = peito(alvo)
  const cunhas: Cunha[] = []
  CHUTES.forEach((k, i) => {
    const t = (ms - (k.bate - 110)) / 260
    // Arco do pe: varre em volta do alvo e some pela cauda.
    if (t >= 0 && t < 1) crescente(ctx, p, 17, k.a0, k.a1, 5.5, t, 0, pele, 0.75)
    const fim = { x: p.x + Math.cos(k.a1) * 17, y: p.y + Math.sin(k.a1) * 17 * 0.75 }
    cunhas.push(...estouro(ms, fim, k.bate, 220, 6, 12, 5, 2, semEstouros[i]))
  })
  pintarCunhas(ctx, cunhas, pele)
}

// ---------------------------------------------------------------------------
// T2 — FORCE PALM: ki na palma, arcos atravessando o alvo
// ---------------------------------------------------------------------------

const PALMA_JUNTA = 200
const PALMA_BATE = 270

function forcePalm(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semAura = sortear(rng, 8 * 3)
  const semEstouro = sortear(rng, 9 * POR_CUNHA)
  const p = peito(alvo)
  const cunhas: Cunha[] = [...aura(ms, b, 0, PALMA_JUNTA + 60, 8, 6, 12, 5, semAura)]
  // A palma: bola de ki que cresce na mao e dispara reta.
  if (ms < PALMA_BATE) {
    const u = limitar((ms - PALMA_JUNTA) / (PALMA_BATE - PALMA_JUNTA))
    const q = { x: b.x + (p.x - b.x) * u, y: b.y + (p.y - b.y) * u }
    const r = 1.5 + 3 * saida(limitar(ms / PALMA_JUNTA))
    ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(q.x, q.y, r + 1.2, 0, TAU); ctx.fill()
    ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, TAU); ctx.fill()
    ctx.fillStyle = pele.nucleo; ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.5, 0, TAU); ctx.fill()
  }
  cunhas.push(...estouro(ms, p, PALMA_BATE, 260, 9, 14, 6, 2.4, semEstouro))
  pintarCunhas(ctx, cunhas, pele)
  arcosDeChoque(ctx, ms, p, PALMA_BATE, 3, angulo, 15, 30, 4.4, pele)
}

// ---------------------------------------------------------------------------
// T3 — SKY UPPERCUT: gancho que sobe e lanca pra cima
// ---------------------------------------------------------------------------

const GANCHO_SOBE = 200
const GANCHO_BATE = 300

function skyUppercut(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semAura = sortear(rng, 10 * 3)
  const semEstouro = sortear(rng, 12 * POR_CUNHA)
  const semEstrias = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 10 * 3)
  const p = peito(alvo)
  const cunhas: Cunha[] = [...aura(ms, { x: origem.x, y: origem.y + 6 }, 0, GANCHO_SOBE + 80, 10, 7, 14, 4.5, semAura)]
  // Gancho: arco vertical grande subindo por baixo do alvo.
  const t = (ms - GANCHO_SOBE) / 280
  if (t >= 0 && t < 1) crescente(ctx, { x: p.x - 4, y: p.y + 4 }, 20, Math.PI * 0.75, -Math.PI * 0.4, 6, t, 0, pele, 0.9)
  // Estouro puxado pra cima + estrias de ki subindo do alvo.
  cunhas.push(...estouro(ms, p, GANCHO_BATE, 320, 12, 22, 8, 3, semEstouro, 0.55, -Math.PI / 2))
  cunhas.push(...aura(ms, p, GANCHO_BATE, GANCHO_BATE + 420, 8, 8, 34, 8, semEstrias))
  pintarCunhas(ctx, cunhas, pele)
  const e = ms - GANCHO_BATE
  if (e >= 0 && e < 240) estrelaDeImpacto(ctx, p, 14, e / 240, pele, fila(semEstrela))
  if (e >= 0 && e < 300) riscos(ctx, p, 10, 28, e / 300, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------
// T4 — FOCUS PUNCH: concentracao longa e um soco que atravessa a cena
// ---------------------------------------------------------------------------
//
//   concentracao  aura DENSA subindo de quem lanca; arcos se fechando na mao
//                 (o ki sendo puxado pra dentro) e a bola de ki crescendo.
//   soco          cunha enorme reta da mao ao alvo: o rastro do punho.
//   impacto       estouro gigante, estrela, riscos e arcos de choque ENORMES
//                 atravessando a cena pro lado de la — o golpe muda a cena.

const FOCO_CARGA = 700
const FOCO_BATE = 790
const FOCO_ECO = FOCO_BATE + 180

function focusPunch(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semAura = sortear(rng, 22 * 3)
  const semEstouro = sortear(rng, 18 * POR_CUNHA)
  const semEco = sortear(rng, 12 * POR_CUNHA)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 16 * 3)
  const p = peito(alvo)
  const cunhas: Cunha[] = [...aura(ms, { x: origem.x, y: origem.y + 6 }, 0, FOCO_CARGA + 60, 22, 10, 32, 6.5, semAura)]
  // Arcos se FECHANDO na mao: o contrario do impacto, o ki entrando.
  if (ms < FOCO_CARGA) {
    for (let i = 0; i < 3; i++) {
      const t = ((ms + i * 150) % 450) / 450
      const R = 18 * (1 - saida(t)) + 3
      crescente(ctx, b, R, angulo + Math.PI - 1.2, angulo + Math.PI + 1.2, 2.4, 0.5, 0, pele, 0.85)
    }
    const r = 2 + 5 * saida(limitar(ms / FOCO_CARGA))
    ctx.fillStyle = pele.contorno; ctx.beginPath(); ctx.arc(b.x, b.y, r + 1.3, 0, TAU); ctx.fill()
    ctx.fillStyle = pele.meio; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill()
    ctx.fillStyle = pele.nucleo; ctx.beginPath(); ctx.arc(b.x, b.y, r * 0.5, 0, TAU); ctx.fill()
  }
  // O soco: uma cunha so, da mao ate o alvo, que chega e encurta.
  const s = (ms - FOCO_CARGA) / (FOCO_BATE - FOCO_CARGA + 160)
  if (s >= 0 && s < 1) {
    const dx = p.x - b.x, dy = p.y - b.y, L = Math.hypot(dx, dy) || 1
    const frente = L * saida(limitar(s * 2.2)), cauda = L * limitar((s - 0.4) / 0.6)
    const meio = (frente + cauda) / 2, meioL = (frente - cauda) / 2
    if (meioL > 1) cunhas.push({ x: b.x + (dx / L) * meio, y: b.y + (dy / L) * meio, ang: Math.atan2(dy, dx), L: meioL, W: 7 })
  }
  cunhas.push(...estouro(ms, p, FOCO_BATE, 420, 18, 38, 12, 4.2, semEstouro))
  cunhas.push(...estouro(ms, p, FOCO_ECO, 380, 12, 50, 9, 3, semEco))
  pintarCunhas(ctx, cunhas, pele)
  arcosDeChoque(ctx, ms, p, FOCO_BATE, 4, angulo, 22, 80, 5.5, pele)
  const e = ms - FOCO_BATE
  if (e >= 0 && e < 340) estrelaDeImpacto(ctx, p, 26, e / 340, pele, fila(semEstrela))
  if (e >= 0 && e < 460) riscos(ctx, p, 16, 50, e / 460, pele.nucleo, fila(semRiscos))
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
/** Quando a frente `saida((ms - t0) / dura)` chega na fracao `d` do raio. */
const chegaEm = (t0: number, dura: number, d: number) => t0 + dura * (1 - Math.cbrt(1 - Math.min(0.99, d)))

/**
 * Frente de choque: coroa de cunhas apontando pra FORA, deitada no chao, que
 * corre do centro ate a borda e encolhe nela (marca o limite). Sai de cena
 * ANTES das colunas do interior: a ultima imagem nunca e so a borda.
 */
function frenteDeChoque(ms: number, centro: Ponto, R: number, t0: number, dura: number, fica: number, n: number, tam: number): Cunha[] {
  const out: Cunha[] = []
  const t = (ms - t0) / dura
  if (t < 0) return out
  const some = limitar((ms - t0 - dura - fica) / 160)
  if (some >= 1) return out
  const d = R * 0.97 * saida(limitar(t))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const p = noChao(centro, a, d)
    // Aponta pra fora no chao achatado; cresce com a frente.
    const ang = Math.atan2(Math.sin(a) * 0.45, Math.cos(a))
    const k = (0.5 + 0.5 * limitar(t)) * (1 - some)
    out.push({ x: p.x, y: p.y - 3, ang, L: tam * k, W: tam * 0.4 * k })
  }
  return out
}

// A2 — EXPLOSAO ELEMENTAL (lutador): soco no chao, coroa de choque ate a borda
const SOCO_CHAO = 140
const SOCO_CORRE = 520
const SOCO_ALVOS = 14
/** Todas as colunas somem juntas, DEPOIS da coroa da borda. */
const SOCO_FIM = 980

function socoNoChao(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.8)
  const semSoco = sortear(rng, 10 * POR_CUNHA)
  const semAura = sortear(rng, 8 * 3)
  const semAlvos = Array.from({ length: SOCO_ALVOS }, () => sortear(rng, 7 * POR_CUNHA))
  const semColunas = Array.from({ length: SOCO_ALVOS }, () => sortear(rng, 5 * 3))
  const semGiro = sortear(rng, 1)[0] * TAU
  const chao = { x: centro.x, y: centro.y + 10 }
  const cunhas: Cunha[] = [
    ...aura(ms, { x: centro.x, y: centro.y + 6 }, 0, SOCO_CHAO + 40, 8, 7, 14, 4.5, semAura),
    ...estouro(ms, chao, SOCO_CHAO, 300, 10, 22 * k * 0.6, 7, 2.6, semSoco),
    ...frenteDeChoque(ms, centro, R, SOCO_CHAO, SOCO_CORRE, 0, 28, 5 * k * 0.8),
  ]
  // Cada alvo, dentro da area inteira, leva um estouro e uma coluna de ki
  // quando a frente passa — e o que fica na tela depois que a frente chega na
  // borda (so a coroa sobrando dava a impressao de golpe so na borda).
  for (let i = 0; i < SOCO_ALVOS; i++) {
    const q = vogel(centro, R, i, SOCO_ALVOS, 0.88, semGiro)
    const quando = chegaEm(SOCO_CHAO, SOCO_CORRE, fracaoDoRaio(centro, q, R) / 0.97)
    cunhas.push(...estouro(ms, { x: q.x, y: q.y - 6 }, quando, 320, 7, 16 * Math.min(k, 1.4), 8, 3, semAlvos[i], 0.5, -Math.PI / 2))
    cunhas.push(...aura(ms, q, quando, SOCO_FIM, 5, 4, 36 * Math.min(k, 1.3), 7, semColunas[i]))
  }
  cunhas.sort((p, q) => p.y - q.y)
  pintarCunhas(ctx, cunhas, pele)
}

// A3 — critico: tres pisoes e colunas de ki pela area inteira
export const PISOES = [120, 420, 720] as const
const PISAO_CORRE = 480
const COLUNAS = 16
/** Todas as colunas somem juntas, DEPOIS da coroa da borda. */
const PISAO_FIM = 1520

function tresPisoes(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semPisoes = PISOES.map(() => sortear(rng, 10 * POR_CUNHA))
  const semAura = sortear(rng, 16 * 3)
  const semColunas = Array.from({ length: COLUNAS }, () => sortear(rng, 9 * 3))
  const semTremor = Array.from({ length: COLUNAS }, () => sortear(rng, 6 * POR_CUNHA))
  const semEstrela = sortear(rng, 9)
  const semGiro = sortear(rng, 1)[0] * TAU
  const chao = { x: centro.x, y: centro.y + 10 }
  const cunhas: Cunha[] = [...aura(ms, { x: centro.x, y: centro.y + 6 }, 0, PISOES[2] + 100, 16, 8, 18, 5, semAura)]
  PISOES.forEach((t0, i) => {
    cunhas.push(...estouro(ms, chao, t0, 300, 10, 24 * k * 0.6, 8, 2.8, semPisoes[i]))
    // Cada pisao manda uma frente; so a ultima fica marcando a borda.
    cunhas.push(...frenteDeChoque(ms, centro, R, t0, PISAO_CORRE, 0, 26, 5.5 * k * 0.8))
  })
  // Colunas de ki rompem do chao pela area toda quando a primeira frente passa.
  for (let i = 0; i < COLUNAS; i++) {
    const q = vogel(centro, R, i, COLUNAS, 0.9, semGiro)
    const quando = chegaEm(PISOES[0], PISAO_CORRE, fracaoDoRaio(centro, q, R) / 0.97)
    cunhas.push(...aura(ms, q, quando, PISAO_FIM, 9, 5, 52 * Math.min(k, 1.3), 9, semColunas[i]))
    // Cada pisao seguinte sacode o alvo de novo.
    for (let j = 1; j < PISOES.length; j++) {
      const bate = chegaEm(PISOES[j], PISAO_CORRE, fracaoDoRaio(centro, q, R) / 0.97)
      cunhas.push(...estouro(ms, { x: q.x, y: q.y - 6 }, bate, 280, 6, 14 * Math.min(k, 1.3), 7, 2.6, semTremor[i], 0.5, -Math.PI / 2))
    }
  }
  cunhas.sort((p, q) => p.y - q.y)
  pintarCunhas(ctx, cunhas, pele)
  const e = ms - PISOES[0]
  if (e >= 0 && e < 260) estrelaDeImpacto(ctx, { x: centro.x, y: centro.y - 4 }, 18, e / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_LUTADOR = {
  single: { 1: 'double_kick', 2: 'force_palm', 3: 'sky_uppercut', 4: 'focus_punch' },
  area: { 2: 'aoe50_fighting', 3: 'aoe50_fighting' },
} as const

export const LUTADOR_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: doubleKick, duracao: { 1: 700 }, alcance: 28, impactos: { 1: CHUTES.map(k => k.bate) } },
  2: { desenhar: forcePalm, duracao: { 2: 900 }, alcance: 44, impactos: { 2: [PALMA_BATE] } },
  3: { desenhar: skyUppercut, duracao: { 3: 1100 }, alcance: 56, impactos: { 3: [GANCHO_BATE] } },
  4: { desenhar: focusPunch, duracao: { 4: 1600 }, alcance: 100, impactos: { 4: [FOCO_BATE, FOCO_ECO] } },
}

export const LUTADOR_AREA: Partial<Record<1 | 2 | 3, EntradaDeCoreografia>> = {
  2: { desenhar: socoNoChao, duracao: { 2: 1100 }, alcance: 30, impactos: { 2: [chegaEm(SOCO_CHAO, SOCO_CORRE, 0.3)] } },
  3: { desenhar: tresPisoes, duracao: { 3: 1700 }, alcance: 60, impactos: { 3: [...PISOES] } },
}
