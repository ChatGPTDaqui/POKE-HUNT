// PSIQUICO (PSYCHIC) — 4 single + A2 + A3, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Confusion/Stored Power; T2 Psybeam/Heart Stamp/Mist
// Ball/Psycho Cut; T3 Psychic/Extrasensory/Psyshock/Zen Headbutt/Luster Purge;
// T4 Psystrike/Dream Eater/Future Sight/Psycho Boost. Area: so Synchronoise
// (120, A3) e a Explosao Elemental do nivel 50 (70, A2). SEM A1: nada cai nele.
//
// PERSONALIDADE (o que separa da fada e do fantasma sem olhar a cor): a mente
// MOVE as coisas sem tocar. Nada cai, nada tem peso:
//   - ANEIS: onda mental em elipses concentricas que pulsam;
//   - PRESSAO: cunhas que FECHAM no alvo (telecinese apertando) e soltam;
//   - ORBES que orbitam e convergem — energia parada no ar, nao projetil;
//   - BRILHOS de 4 pontas que piscam, o rescaldo que flutua.
// A linguagem das referencias do dono entra como: raios e fagulhas no impacto
// (acabamento.ts), o anel como "riscos" do que viaja, e brilhos que apagam no
// rescaldo.
//
//   T1 Confusion    aneis saem da cabeca; o alvo e enrolado por uma espiral
//                   de brilhos que gira e aperta.
//   T2 Psybeam      um feixe de aneis em fila corre ate o alvo e estoura.
//   T3 Psychic      aura no alvo, cunhas de pressao fecham, seguram e soltam
//                   num anel de choque.
//   T4 Psystrike    seis orbes surgem em volta do alvo, giram, convergem e
//                   detonam com aneis grandes.
//   A2 (Expl. Elem.) duas ondas de anel cobrem a area; cada ponto do interior
//                   pulsa quando a onda passa.
//   A3 Synchronoise todos os pontos do interior pulsam JUNTOS, tres vezes,
//                   em sincronia com quem lanca.
import { comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
const em = (u: number, a: number, b: number) => a + u * (b - a)

function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

const escalaDaArea = (raio: number) => Math.max(1, raio / 70)
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })
/** Cabeca de quem lanca: de onde a mente "olha". */
const cabeca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 4, y: c.origem.y - 8 })

// ---------------------------------------------------------------------------
// Pecas do tipo
// ---------------------------------------------------------------------------

/** Anel no instante: centro, raios da elipse, giro e espessura. */
interface Anel { x: number; y: number; rx: number; ry: number; giro: number; w: number }

/** Aneis em 3 passadas (contorno, base, nucleo fino) — um `stroke` por passada. */
function pintarAneis(ctx: CanvasRenderingContext2D, aneis: readonly Anel[], pele: Pele): void {
  for (const [cor, extra, k] of [[pele.contorno, 1.4, 1], [pele.base, 0, 1], [pele.nucleo, 0, 0.4]] as const) {
    ctx.strokeStyle = cor
    for (const a of aneis) {
      const w = a.w * k + extra
      if (a.w <= 0.2 || a.rx < 0.8) continue
      ctx.lineWidth = w
      ctx.beginPath(); ctx.ellipse(a.x, a.y, a.rx, Math.max(0.5, a.ry), a.giro, 0, TAU); ctx.stroke()
    }
  }
}

/** Brilho de 4 pontas: `r` = meia-altura. Em 2 camadas (base por fora, nucleo dentro). */
function pintarBrilhos(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.base, 1.35], [pele.nucleo, 1]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const p of pts) {
      const r = p.r * k, f = r * 0.28
      if (p.r < 0.6) continue
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + f, p.y - f); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x + f, p.y + f)
      ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - f, p.y + f); ctx.lineTo(p.x - r, p.y); ctx.lineTo(p.x - f, p.y - f); ctx.closePath()
    }
    ctx.fill()
  }
}

/** Orbe: bola de energia em 3 tons, luz no centro (nao em cima — nao e solida). */
function pintarOrbes(ctx: CanvasRenderingContext2D, orbes: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.7], [pele.nucleo, 0.38]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const o of orbes) { const r = o.r * k; if (r > 0.4) { ctx.moveTo(o.x + r, o.y); ctx.arc(o.x, o.y, r, 0, TAU) } }
    ctx.fill()
  }
}

/** Brilhos do rescaldo: sobem devagar e piscam, apagando um a um. */
function brilhosFlutuando(p: Ponto, t0: number, ms: number, sem: readonly number[], k = 1): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i * 3 + 2 < sem.length; i++) {
    const t = (ms - t0 - i * 35) / 380
    if (t < 0 || t > 1) continue
    const pisca = Math.floor((ms + i * 53) / 70) % 3 === 0 ? 0.6 : 1
    out.push({
      x: p.x + (sem[i * 3] - 0.5) * 26 * k,
      y: p.y - 4 - em(sem[i * 3 + 1], 6, 18) * k * saida(t),
      r: em(sem[i * 3 + 2], 1.6, 2.6) * Math.min(k, 1.6) * pisca * (1 - entrada(limitar((t - 0.5) / 0.5))),
    })
  }
  return out
}

/** Pulso de aneis concentricos em `p`: `n` aneis que nascem a cada `cada` ms e abrem ate `R`. */
function pulso(p: Ponto, ms: number, t0: number, n: number, cada: number, R: number, vida: number, achata = 0.45, w = 1.6): Anel[] {
  const out: Anel[] = []
  for (let i = 0; i < n; i++) {
    const t = (ms - t0 - i * cada) / vida
    if (t < 0 || t > 1) continue
    const r = R * saida(t)
    out.push({ x: p.x, y: p.y, rx: r, ry: r * achata, giro: 0, w: w * (1 - t) + 0.3 })
  }
  return out
}

// ---------------------------------------------------------------------------
// T1 — CONFUSION
// ---------------------------------------------------------------------------

const CONF_APERTA = 300

function confusion(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semBrilhos = sortear(rng, 8 * 3)
  const giro0 = rng() * TAU
  const cab = cabeca(c)
  // Aneis saem da cabeca de quem lanca: a mente "mira".
  const aneis = pulso(cab, ms, 0, 3, 70, 9, 300, 1, 1.2)
  // Espiral de 6 brilhos que gira em volta do alvo e APERTA.
  const t = (ms - 180) / 620
  const brilhos: { x: number; y: number; r: number }[] = []
  if (t >= 0 && t <= 1) {
    const R = 16 * (1 - 0.55 * saida(limitar((ms - 180) / (CONF_APERTA - 180)))) * (1 + 0.25 * entrada(limitar((t - 0.6) / 0.4)))
    for (let i = 0; i < 6; i++) {
      const a = giro0 + (i / 6) * TAU + t * TAU * 1.6
      const s = 1 - entrada(limitar((t - 0.7) / 0.3))
      brilhos.push({ x: alvo.x + Math.cos(a) * R, y: alvo.y - 6 + Math.sin(a) * R * 0.45, r: 2.4 * s })
    }
    aneis.push({ x: alvo.x, y: alvo.y - 6, rx: R, ry: R * 0.45, giro: 0, w: 0.9 * (1 - t) })
  }
  aneis.push(...pulso(alvo, ms, CONF_APERTA, 2, 90, 16, 320))
  pintarAneis(ctx, aneis, pele)
  pintarBrilhos(ctx, [...brilhos, ...brilhosFlutuando(alvo, CONF_APERTA + 200, ms, semBrilhos)], pele)
}

// ---------------------------------------------------------------------------
// T2 — PSYBEAM
// ---------------------------------------------------------------------------

const BEAM_SAI = 100
const BEAM_FIM = 460
const BEAM_CADA = 36
const BEAM_CHEGA = 270

function psybeam(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semBrilhos = sortear(rng, 8 * 3)
  const semEstrela = sortear(rng, 9)
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y - 4 }
  const dx = alvo.x - b.x, dy = alvo.y - b.y
  const dir = Math.atan2(dy, dx)
  const voo = BEAM_CHEGA - BEAM_SAI
  const aneis: Anel[] = []
  // Fila de aneis perpendiculares ao feixe; abrem um pouco enquanto viajam.
  for (let t0 = BEAM_SAI; t0 <= BEAM_FIM; t0 += BEAM_CADA) {
    const u = (ms - t0) / voo
    if (u < 0 || u > 1) continue
    const r = 3 + 3.5 * u
    aneis.push({ x: b.x + dx * u, y: b.y + dy * u, rx: r * 0.4, ry: r, giro: dir, w: 1.5 })
  }
  // Fio do feixe por dentro dos aneis, enquanto eles correm.
  if (ms >= BEAM_SAI && ms <= BEAM_FIM + voo) {
    const u0 = limitar((ms - BEAM_FIM) / voo), u1 = limitar((ms - BEAM_SAI) / voo)
    ctx.strokeStyle = pele.nucleo; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.moveTo(b.x + dx * u0, b.y + dy * u0); ctx.lineTo(b.x + dx * u1, b.y + dy * u1); ctx.stroke()
  }
  aneis.push(...pulso(alvo, ms, BEAM_CHEGA, 3, 90, 18, 340))
  pintarAneis(ctx, aneis, pele)
  pintarBrilhos(ctx, brilhosFlutuando(alvo, BEAM_CHEGA + 150, ms, semBrilhos), pele)
  if (ms >= BEAM_CHEGA && ms < BEAM_CHEGA + 180) estrelaDeImpacto(ctx, alvo, 12, (ms - BEAM_CHEGA) / 180, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — PSYCHIC
// ---------------------------------------------------------------------------

const PSI_AURA = 80
const PSI_SOLTA = 560

function psychic(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semBrilhos = sortear(rng, 10 * 3)
  const semEstrela = sortear(rng, 9)
  const giro0 = rng() * TAU
  const cab = cabeca(c)
  const aneis: Anel[] = []
  // Olhos de quem lanca acendem: dois brilhos curtos na cabeca.
  const olho = limitar(ms / 120) * (1 - limitar((ms - PSI_SOLTA) / 200))
  const brilhos: { x: number; y: number; r: number }[] = []
  if (olho > 0) brilhos.push({ x: cab.x, y: cab.y, r: 2.6 * olho })
  // Aura: elipses que pulsam em volta do alvo enquanto a mente segura.
  if (ms >= PSI_AURA && ms < PSI_SOLTA) {
    const k = saida(limitar((ms - PSI_AURA) / 150))
    const bate = 1 + 0.12 * Math.sin(ms * 0.045)
    aneis.push({ x: alvo.x, y: alvo.y - 2, rx: 13 * k * bate, ry: 15 * k * bate, giro: 0, w: 1.2 })
    aneis.push({ x: alvo.x, y: alvo.y - 2, rx: 9 * k / bate, ry: 11 * k / bate, giro: 0, w: 0.8 })
  }
  // Pressao: quatro cunhas fecham no alvo, tremem segurando e voltam.
  const tp = (ms - 180) / (PSI_SOLTA - 180)
  if (tp >= 0 && tp <= 1.15) {
    const fecha = saida(limitar(tp * 1.6))
    const treme = tp > 0.6 && tp <= 1 ? Math.sin(ms * 0.9) * 0.8 : 0
    const solta = tp > 1 ? entrada((tp - 1) / 0.15) : 0
    const d = 22 - 12 * fecha + 18 * solta + treme
    for (const [cor, k] of [[pele.contorno, 1.3], [pele.base, 1], [pele.nucleo, 0.45]] as const) {
      ctx.fillStyle = cor
      ctx.beginPath()
      for (let i = 0; i < 4; i++) {
        const a = giro0 + (i / 4) * TAU
        const x = alvo.x + Math.cos(a) * d, y = alvo.y - 2 + Math.sin(a) * d * 0.8
        const px = -Math.sin(a) * 3 * k, py = Math.cos(a) * 3 * k
        // Ponta apontada PRO alvo.
        ctx.moveTo(x - Math.cos(a) * 6 * k, y - Math.sin(a) * 6 * k * 0.8)
        ctx.lineTo(x + px + Math.cos(a) * 2, y + py)
        ctx.lineTo(x - px + Math.cos(a) * 2, y - py)
        ctx.closePath()
      }
      ctx.fill()
    }
  }
  // Solta: anel de choque grande + rescaldo de brilhos.
  aneis.push(...pulso({ x: alvo.x, y: alvo.y - 2 }, ms, PSI_SOLTA, 3, 70, 26, 380, 0.6, 2.2))
  pintarAneis(ctx, aneis, pele)
  pintarBrilhos(ctx, [...brilhos, ...brilhosFlutuando(alvo, PSI_SOLTA + 120, ms, semBrilhos, 1.2)], pele)
  if (ms >= PSI_SOLTA && ms < PSI_SOLTA + 220) estrelaDeImpacto(ctx, alvo, 16, (ms - PSI_SOLTA) / 220, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — PSYSTRIKE
// ---------------------------------------------------------------------------

const STRIKE_SURGE = 120
const STRIKE_CONVERGE = 700
const STRIKE_DETONA = 840

function psystrike(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semBrilhos = sortear(rng, 12 * 3)
  const semEstrela = sortear(rng, 9)
  const giro0 = rng() * TAU
  const centro = { x: alvo.x, y: alvo.y - 4 }
  // Seis orbes surgem um a um num circulo largo, orbitam e convergem.
  const orbes: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < 6; i++) {
    const nasce = STRIKE_SURGE + i * 60
    if (ms < nasce || ms > STRIKE_DETONA) continue
    const cresce = saida(limitar((ms - nasce) / 120))
    const conv = entrada(limitar((ms - STRIKE_CONVERGE) / (STRIKE_DETONA - STRIKE_CONVERGE)))
    const a = giro0 + (i / 6) * TAU + (ms - STRIKE_SURGE) * 0.004
    const R = 30 * (1 - conv)
    orbes.push({ x: centro.x + Math.cos(a) * R, y: centro.y + Math.sin(a) * R * 0.55, r: 3.4 * cresce * (1 - conv * 0.4) })
  }
  // Os orbes ligados por um anel que encolhe com eles.
  const aneis: Anel[] = []
  if (ms >= STRIKE_SURGE + 300 && ms < STRIKE_DETONA) {
    const conv = entrada(limitar((ms - STRIKE_CONVERGE) / (STRIKE_DETONA - STRIKE_CONVERGE)))
    aneis.push({ x: centro.x, y: centro.y, rx: 30 * (1 - conv), ry: 16.5 * (1 - conv), giro: 0, w: 0.9 })
  }
  // Detonacao: aneis grandes em sequencia + rescaldo de brilhos.
  aneis.push(...pulso(centro, ms, STRIKE_DETONA, 4, 60, 40, 460, 0.6, 2.8))
  pintarAneis(ctx, aneis, pele)
  pintarOrbes(ctx, orbes, pele)
  pintarBrilhos(ctx, brilhosFlutuando(alvo, STRIKE_DETONA + 150, ms, semBrilhos, 1.5), pele)
  if (ms >= STRIKE_DETONA && ms < STRIKE_DETONA + 280) estrelaDeImpacto(ctx, centro, 24, (ms - STRIKE_DETONA) / 280, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

function interior(centro: Ponto, raio: number, n: number, giro: number): { p: Ponto; d: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = raio * 0.9 * Math.sqrt((i + 0.5) / n)
    return { p: noChao(centro, i * ANGULO_DOURADO + giro, d), d }
  })
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): duas ondas cobrem a area; o interior pulsa.
const ONDAS_A2 = [120, 420] as const
const ONDA_A2 = 600

function ondaMental(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 10, rng() * TAU)
  const semBrilhos = sortear(rng, 10 * 3)
  const chao = { x: centro.x, y: centro.y + 12 }
  const aneis: Anel[] = []
  ONDAS_A2.forEach(t0 => {
    const t = (ms - t0) / ONDA_A2
    if (t < 0 || t > 1) return
    const r = raio * saida(t)
    aneis.push({ x: chao.x, y: chao.y, rx: r, ry: r * 0.45, giro: 0, w: 3.4 * k * 0.7 * (1 - t * 0.6) })
    // Eco fino logo atras: a onda tem espessura, nao e um fio.
    const r2 = r * 0.88
    if (r2 > 4) aneis.push({ x: chao.x, y: chao.y, rx: r2, ry: r2 * 0.45, giro: 0, w: 1.2 * k * 0.6 * (1 - t) })
  })
  const brilhos: { x: number; y: number; r: number }[] = []
  pontos.forEach(({ p, d }, i) => {
    // Cada ponto pulsa quando a primeira onda chega nele.
    const chega = ONDAS_A2[0] + ONDA_A2 * (1 - Math.cbrt(1 - d / raio))
    aneis.push(...pulso({ x: p.x, y: p.y - 6 }, ms, chega, 2, 80, 9 * k * 0.6, 320, 0.5, 1.4))
    const t = (ms - chega - 100) / 600
    if (t >= 0 && t <= 1) brilhos.push({ x: p.x + (semBrilhos[i * 3] - 0.5) * 10, y: p.y - 8 - 14 * saida(t), r: 2.2 * (1 - entrada(limitar((t - 0.5) / 0.5))) })
  })
  pintarAneis(ctx, aneis, pele)
  pintarBrilhos(ctx, brilhos, pele)
}

// A3 — SYNCHRONOISE: o interior inteiro pulsa JUNTO, tres vezes.
const SYNC_BATIDAS = [380, 740, 1100] as const

function synchronoise(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const pontos = interior(centro, raio, 14, rng() * TAU)
  const semBrilhos = sortear(rng, 14 * 3)
  const aneis: Anel[] = []
  // Quem lanca marca o compasso: um pulso por batida, e um antes de comecar.
  aneis.push(...pulso({ x: origem.x, y: origem.y - 6 }, ms, 60, 2, 90, 14 * k * 0.6, 300, 0.6, 1.6))
  SYNC_BATIDAS.forEach((b, j) => {
    aneis.push(...pulso({ x: origem.x, y: origem.y - 6 }, ms, b - 40, 1, 0, 18 * k * 0.6, 280, 0.6, 2))
    // TODOS os pontos ao mesmo tempo, cada batida mais forte.
    for (const { p } of pontos) aneis.push(...pulso({ x: p.x, y: p.y - 6 }, ms, b, 2, 70, (8 + j * 2) * k * 0.6, 300, 0.5, 1.2 + j * 0.3))
  })
  // A borda acende na ultima batida: o alcance.
  const tb = (ms - SYNC_BATIDAS[2]) / 450
  if (tb >= 0 && tb <= 1) aneis.push({ x: centro.x, y: centro.y + 12, rx: raio, ry: raio * 0.45, giro: 0, w: 2.4 * (1 - tb) + 0.3 })
  const brilhos: { x: number; y: number; r: number }[] = []
  pontos.forEach(({ p }, i) => brilhos.push(...brilhosFlutuando(p, SYNC_BATIDAS[2] + 80, ms, semBrilhos.slice(i * 3, i * 3 + 3))))
  pintarAneis(ctx, aneis, pele)
  pintarBrilhos(ctx, brilhos, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_PSIQUICO = {
  single: { 1: 'confusion', 2: 'psybeam', 3: 'psychic', 4: 'psystrike' },
  area: { 2: 'aoe50_psychic', 3: 'synchronoise' },
} as const

export const PSIQUICO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: confusion, duracao: { 1: 1200 }, alcance: 30, impactos: { 1: [CONF_APERTA] } },
  2: { desenhar: psybeam, duracao: { 2: 1100 }, alcance: 34, impactos: { 2: [BEAM_CHEGA] } },
  3: { desenhar: psychic, duracao: { 3: 1400 }, alcance: 40, impactos: { 3: [PSI_SOLTA] } },
  4: { desenhar: psystrike, duracao: { 4: 1800 }, alcance: 56, impactos: { 4: [STRIKE_DETONA] } },
}, false)

/** Sem A1: nenhum golpe psiquico de area cai nele (ver cabecalho). */
export const PSIQUICO_AREA: Partial<Record<1 | 2 | 3, EntradaDeCoreografia>> = comImpacto({
  2: { desenhar: ondaMental, duracao: { 2: 1300 }, alcance: 40, impactos: { 2: [ONDAS_A2[0] + 200] } },
  3: { desenhar: synchronoise, duracao: { 3: 1800 }, alcance: 50, impactos: { 3: [...SYNC_BATIDAS] } },
}, true)
