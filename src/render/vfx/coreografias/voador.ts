// VOADOR (FLYING) — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (o que separa de grama e normal sem olhar a cor):
//   - VENTO DESENHADO: ar e invisivel, entao aparece como TRACO — o redemoinho
//     de vento enrolado (o "@" do manga) e a linha de vento comprida. Nunca
//     massa, nunca particula solta como corpo.
//   - LAMINA DE AR: crescente fino que gira como bumerangue e corta.
//   - PENA: tem haste que passa do corpo e um lado mais largo (a folha tem bico
//     e nervura; a pena tem haste). Plana e vira no ar, clara.
//   - VEM DE CIMA: o tier alto mergulha do ceu (Sky Attack), nao atravessa o chao.
//
//   T1 Gust          redemoinho de vento pequeno viaja girando, estoura no alvo
//                    em enrolados menores e solta penas.
//   T2 Air Slash     tres laminas de ar girando, cada uma corta o alvo.
//   T3 Drill Peck    broca de vento (helice em cone) avanca girando e fura o alvo.
//   T4 Sky Attack    ventos se enrolam em quem lanca, ele sobe, e uma AVE DE
//                    LUZ mergulha do ceu com rastro de vento; a cena inteira
//                    ganha linhas de vento na direcao do mergulho.
//   A1 Air Cutter    laminas de ar saem girando pela area inteira e na borda.
//   A2 (Explosao Elemental) ventania: tres grandes enrolados de vento correm do
//                    centro ate a borda e chove pena na area toda.
//   A3 (critico)     furacao: funil de linhas de vento no centro, enrolados
//                    girando em aneis pela area inteira e penas rodando.
//
// AREA preenche o interior e a borda marca o limite (dono, 29/09 e 30/09).
import { PARTICULAS, type Sementes } from '../particulas'
import { estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'
import { comImpacto } from '../acabamento'

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
// Tracos de vento
// ---------------------------------------------------------------------------

/**
 * Todos os tracos de vento do quadro: contorno escuro, corpo claro e um fio
 * branco no meio. Cada traco vira POLIGONO (os dois lados da linha) e cada
 * camada e um `fill` so — `stroke` com junta redonda custava 3,7 ms no
 * furacao, no buffer de software do pixelizador. `w` e a largura do corpo.
 */
function pintarVento(ctx: CanvasRenderingContext2D, caminhos: readonly { pts: Ponto[]; w: number }[], pele: Pele): void {
  if (!caminhos.length) return
  for (const [cor, k, extra] of [[pele.contorno, 1, 1.6], [pele.meio, 1, 0], [pele.nucleo, 0.4, 0]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const c of caminhos) {
      const n = c.pts.length - 1
      if (n < 1) continue
      // O fio branco so no vento grosso: no fino ele some no pixel e so custa.
      if (cor === pele.nucleo && c.w < 2.2) continue
      // O contorno afina junto: traco fino so de contorno vira linha preta no chao.
      const meia = (c.w * k + extra * Math.min(1, c.w / 1.4)) / 2
      if (meia < 0.15) continue
      const lado = (j: number, s: number): [number, number] => {
        const q = c.pts[Math.min(n, j + 1)], o = c.pts[Math.max(0, j - 1)]
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1
        return [c.pts[j].x - (dy / d) * meia * s, c.pts[j].y + (dx / d) * meia * s]
      }
      ctx.moveTo(...lado(0, 1))
      for (let j = 1; j <= n; j++) ctx.lineTo(...lado(j, 1))
      for (let j = n; j >= 0; j--) ctx.lineTo(...lado(j, -1))
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Arco em crescente (lamina de ar, corte): cresce pela cabeca, some pela cauda. */
interface Arco { x: number; y: number; r: number; a0: number; a1: number; esp: number; giro: number; achatar: number }

/**
 * Todos os arcos do quadro numa chamada por camada (contorno, corpo, fio).
 * O `crescente` das primitivas faz save/transform e 3 fills POR arco — com 20
 * laminas no Air Cutter isso passava de 4 ms.
 */
function pintarArcos(ctx: CanvasRenderingContext2D, arcos: readonly Arco[], pele: Pele): void {
  if (!arcos.length) return
  const N = 8
  for (const [cor, k, g] of [[pele.contorno, 1.35, 1], [pele.meio, 1, 0], [pele.nucleo, 0.45, -0.3]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const a of arcos) {
      if (a.a1 === a.a0) continue
      const cg = Math.cos(a.giro), sg = Math.sin(a.giro)
      const pt = (ang: number, r: number): [number, number] => {
        const lx = Math.cos(ang) * r, ly = Math.sin(ang) * r
        return [a.x + (lx * cg - ly * sg), a.y + (lx * sg + ly * cg) * a.achatar]
      }
      for (let i = 0; i <= N; i++) { const ang = a.a0 + ((a.a1 - a.a0) * i) / N; const [x, y] = pt(ang, a.r + g); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      for (let i = N; i >= 0; i--) {
        const ang = a.a0 + ((a.a1 - a.a0) * i) / N
        const e = a.esp * k * Math.sin(Math.PI * (i / N)) ** 0.7
        ctx.lineTo(...pt(ang, a.r - e - g * 0.3))
      }
      ctx.closePath()
    }
    ctx.fill()
  }
}

/** Corte animado: `p` 0..1 — a cabeca varre ate a1 e a cauda vem atras. */
function corte(x: number, y: number, r: number, a0: number, a1: number, esp: number, p: number, giro: number, achatar: number): Arco | null {
  if (p < 0 || p >= 1) return null
  const cabeca = a0 + (a1 - a0) * saida(limitar(p * 1.7))
  const cauda = a0 + (a1 - a0) * limitar((p - 0.2) / 0.8) ** 3
  return cabeca === cauda ? null : { x, y, r, a0: cauda, a1: cabeca, esp, giro, achatar }
}

/**
 * Enrolado de vento (o "@"): espiral que fecha pra dentro com uma cauda reta
 * saindo por fora. `ate` 0..1 desenha so a parte ja formada (pela cauda).
 * `giro` roda o desenho inteiro; `achatar` deita no chao.
 */
function enrolado(c: Ponto, r: number, giro: number, ate: number, achatar = 0.6, voltas = 1.3, n = 12): Ponto[] {
  const out: Ponto[] = []
  if (ate <= 0 || r < 1) return out
  // Cauda: reta tangente saindo do comeco da espiral.
  const cauda = r * 1.4
  const a0 = giro
  const bx = c.x + Math.cos(a0) * r, by = c.y + Math.sin(a0) * r * achatar
  const tx = -Math.sin(a0), ty = Math.cos(a0) * achatar
  out.push({ x: bx - tx * cauda, y: by - ty * cauda })
  const total = Math.ceil(n * ate)
  for (let i = 0; i <= total; i++) {
    const u = Math.min(ate, i / n)
    const a = a0 + u * voltas * TAU
    const rr = r * (1 - 0.72 * u)
    out.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr * achatar })
  }
  return out
}

// ---------------------------------------------------------------------------
// Penas
// ---------------------------------------------------------------------------

interface Pena { x: number; y: number; tam: number; ang: number; vira: number }

const planar = PARTICULAS.pena.mover

function penaPlanando(p: Ponto, sem: readonly number[], i: number, t: number, R: number, tam: number): Pena | null {
  if (t < 0 || t >= 1) return null
  const s = [sem[i * 4], sem[i * 4 + 1], sem[i * 4 + 2], sem[i * 4 + 3]] as unknown as Sementes
  const pose = planar(p, s, t, R)
  if (pose.escala <= 0.05) return null
  return { x: pose.x, y: pose.y, tam: tam * pose.escala * (0.8 + s[1] * 0.4), ang: pose.giro, vira: pose.vira }
}

/**
 * Todas as penas numa chamada por camada: contorno, corpo branco e a haste que
 * passa do corpo (e a haste que separa pena de folha quando as duas giram).
 */
function pintarPenas(ctx: CanvasRenderingContext2D, penas: readonly Pena[], pele: Pele): void {
  if (!penas.length) return
  const forma = (f: Pena, dl: number, dw: number) => {
    const L = f.tam * 2.1 + dl, s = f.tam * Math.max(0.15, Math.abs(f.vira)) * (f.vira < 0 ? -1 : 1)
    const c = Math.cos(f.ang), sn = Math.sin(f.ang)
    const px = (lx: number, ly: number) => f.x + c * lx - sn * ly
    const py = (lx: number, ly: number) => f.y + sn * lx + c * ly
    const w = s < 0 ? -dw : dw
    ctx.moveTo(px(-L, 0), py(-L, 0))
    ctx.quadraticCurveTo(px(-L * 0.1, -s * 1.5 - w), py(-L * 0.1, -s * 1.5 - w), px(L, -s * 0.1), py(L, -s * 0.1))
    ctx.quadraticCurveTo(px(0, s * 0.8 + w), py(0, s * 0.8 + w), px(-L, 0), py(-L, 0))
  }
  ctx.fillStyle = pele.contorno; ctx.beginPath()
  for (const f of penas) forma(f, 1, 0.8)
  ctx.fill()
  ctx.fillStyle = pele.nucleo; ctx.beginPath()
  for (const f of penas) forma(f, 0, 0)
  ctx.fill()
  ctx.strokeStyle = pele.base; ctx.lineWidth = 0.8; ctx.lineCap = 'round'; ctx.beginPath()
  for (const f of penas) {
    const L = f.tam * 2.1, c = Math.cos(f.ang), sn = Math.sin(f.ang)
    ctx.moveTo(f.x - c * L * 1.35, f.y - sn * L * 1.35)
    ctx.lineTo(f.x + c * L * 0.95, f.y + sn * L * 0.95)
  }
  ctx.stroke()
}

/** Lamina de ar: crescente fino inteiro, girando em torno do proprio centro. */
function lamina(p: Ponto, r: number, giro: number): Arco {
  return { x: p.x, y: p.y, r, a0: -1.4, a1: 1.4, esp: r * 0.45, giro, achatar: 1 }
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })
const peito = (p: Ponto): Ponto => ({ x: p.x, y: p.y - 4 })

// ---------------------------------------------------------------------------
// T1 — GUST: redemoinho pequeno que viaja e estoura
// ---------------------------------------------------------------------------

const GUST_VOO = 340
const GUST_ESTOURA = 470

function gust(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semPenas = sortear(rng, 4 * 4)
  const semSaida = sortear(rng, 4)
  const p = peito(alvo)
  const ventos: { pts: Ponto[]; w: number }[] = []
  if (ms < GUST_ESTOURA) {
    const u = saida(limitar(ms / GUST_VOO))
    const q = { x: b.x + (p.x - b.x) * u, y: b.y + (p.y - b.y) * u - Math.sin(Math.PI * u) * 6 }
    const r = 5 + 4 * u
    ventos.push({ pts: enrolado(q, r, ms * 0.025, limitar(ms / 120)), w: 2 })
  }
  // Estoura em enrolados menores que se abrem pra fora.
  const e = (ms - GUST_ESTOURA) / 280
  if (e >= 0 && e < 1) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + semSaida[i] * 0.8
      const q = { x: p.x + Math.cos(a) * 12 * saida(e), y: p.y + Math.sin(a) * 9 * saida(e) }
      ventos.push({ pts: enrolado(q, 4.5 * (1 - e * 0.5), a + ms * 0.02, 1 - e), w: 1.6 })
    }
  }
  pintarVento(ctx, ventos, pele)
  const penas: Pena[] = []
  for (let i = 0; i < 4; i++) { const f = penaPlanando(p, semPenas, i, (ms - GUST_ESTOURA) / 600, 18, 3); if (f) penas.push(f) }
  pintarPenas(ctx, penas, pele)
}

// ---------------------------------------------------------------------------
// T2 — AIR SLASH: tres laminas de ar girando
// ---------------------------------------------------------------------------

const SLASH_SAIDAS = [0, 90, 180] as const
const SLASH_VOO = 210

function airSlash(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semMira = sortear(rng, SLASH_SAIDAS.length * 2)
  const semPenas = SLASH_SAIDAS.map(() => sortear(rng, 2 * 4))
  const p = peito(alvo)
  const penas: Pena[] = [], arcos: Arco[] = []
  SLASH_SAIDAS.forEach((sai, i) => {
    const fim = { x: p.x + em(semMira[i * 2], -5, 5), y: p.y + em(semMira[i * 2 + 1], -6, 4) }
    const u = (ms - sai) / SLASH_VOO
    if (u >= 0 && u < 1) {
      const lado = i % 2 ? 1 : -1
      const q = { x: b.x + (fim.x - b.x) * u - Math.sin(angulo) * Math.sin(Math.PI * u) * 10 * lado, y: b.y + (fim.y - b.y) * u + Math.cos(angulo) * Math.sin(Math.PI * u) * 10 * lado }
      arcos.push(lamina(q, 7, ms * 0.05 + i))
    }
    // Corte: a lamina atravessa o alvo num traco curvo rapido.
    const e = (ms - sai - SLASH_VOO) / 160
    const cortou = corte(fim.x, fim.y, 12, -2.4, -0.6, 3, e, i * 1.1 - 0.8, 0.8)
    if (cortou) arcos.push(cortou)
    for (let j = 0; j < 2; j++) { const f = penaPlanando(fim, semPenas[i], j, (ms - sai - SLASH_VOO) / 520, 14, 2.8); if (f) penas.push(f) }
  })
  pintarArcos(ctx, arcos, pele)
  pintarPenas(ctx, penas, pele)
}

// ---------------------------------------------------------------------------
// T3 — DRILL PECK: broca de vento que fura o alvo
// ---------------------------------------------------------------------------

const BROCA_SAI = 100
const BROCA_CHEGA = 300
const BROCA_FURA = 520

function drillPeck(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semPenas = sortear(rng, 6 * 4)
  const semSaida = sortear(rng, 6)
  const semEstrela = sortear(rng, 9)
  const p = peito(alvo)
  const ventos: { pts: Ponto[]; w: number }[] = []
  const dx = p.x - b.x, dy = p.y - b.y, L = Math.hypot(dx, dy) || 1
  const ux = dx / L, uy = dy / L
  // Broca: 3 fios em helice em volta do eixo, cone fechando na ponta.
  if (ms >= BROCA_SAI && ms < BROCA_FURA) {
    const frente = L * saida(limitar((ms - BROCA_SAI) / (BROCA_CHEGA - BROCA_SAI)))
    const comp = Math.min(frente, 34)
    for (let f = 0; f < 3; f++) {
      const pts: Ponto[] = []
      for (let i = 0; i <= 16; i++) {
        const u = i / 16
        const d = frente - comp * (1 - u)
        const raio = 7 * (1 - u) + 0.8
        const a = u * TAU * 1.6 + ms * 0.045 + (f / 3) * TAU
        const off = Math.cos(a) * raio
        pts.push({ x: b.x + ux * d - uy * off, y: b.y + uy * d + ux * off - Math.sin(a) * raio * 0.3 })
      }
      ventos.push({ pts, w: 1.6 })
    }
  }
  // Furou: enrolados abrindo pra fora do ponto.
  const e = (ms - BROCA_FURA) / 300
  if (e >= 0 && e < 1) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + semSaida[i] * 0.6
      ventos.push({ pts: enrolado({ x: p.x + Math.cos(a) * 16 * saida(e), y: p.y + Math.sin(a) * 12 * saida(e) }, 5 * (1 - e * 0.4), a + ms * 0.02, 1 - e), w: 1.8 })
    }
  }
  pintarVento(ctx, ventos, pele)
  const penas: Pena[] = []
  for (let i = 0; i < 6; i++) { const f = penaPlanando(p, semPenas, i, (ms - BROCA_FURA) / 620, 22, 3.2); if (f) penas.push(f) }
  pintarPenas(ctx, penas, pele)
  const q = ms - BROCA_FURA
  if (q >= 0 && q < 240) estrelaDeImpacto(ctx, p, 14, q / 240, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — SKY ATTACK: a ave de luz que mergulha do ceu
// ---------------------------------------------------------------------------
//
//   carga     enrolados de vento convergem em quem lanca; o corpo acende.
//   subida    tres linhas sobem: ele foi pro ceu.
//   mergulho  a AVE DE LUZ (chevron com asas) desce na diagonal com rastro de
//             vento; a cena inteira ganha linhas de vento na direcao do mergulho.
//   impacto   estrela, riscos, enrolados abrindo e uma explosao de penas.

const SKY_CARGA = 560
const SKY_SOBE = 700
const SKY_MERGULHA = 820
const SKY_BATE = 960

function skyAttack(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCarga = sortear(rng, 5 * 2)
  const semPenas = sortear(rng, 10 * 4)
  const semSaida = sortear(rng, 8)
  const semCena = sortear(rng, 14 * 2)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 14 * 3)
  const p = peito(alvo)
  const ventos: { pts: Ponto[]; w: number }[] = []
  const ceu = { x: p.x - 70, y: p.y - 115 }
  const dx = p.x - ceu.x, dy = p.y - ceu.y, L = Math.hypot(dx, dy)
  const ux = dx / L, uy = dy / L

  // Carga: enrolados girando e fechando em volta de quem lanca.
  if (ms < SKY_SOBE) {
    const t = limitar(ms / SKY_CARGA)
    for (let i = 0; i < 5; i++) {
      const a = semCarga[i * 2] * TAU + t * 5
      const d = 28 * (1 - saida(t)) + 6
      const q = { x: origem.x + Math.cos(a) * d, y: origem.y - 8 + Math.sin(a) * d * 0.6 }
      ventos.push({ pts: enrolado(q, 5, a + Math.PI, limitar(t * 3 - semCarga[i * 2 + 1])), w: 1.6 })
    }
  }
  // Subida: tres linhas verticais rapidas saindo de quem lanca.
  const s = (ms - SKY_CARGA) / (SKY_SOBE - SKY_CARGA + 80)
  if (s >= 0 && s < 1) {
    for (let i = -1; i <= 1; i++) {
      const topo = origem.y - 8 - 90 * saida(s), base = origem.y - 8 - 90 * limitar((s - 0.3) / 0.7)
      ventos.push({ pts: [{ x: origem.x + i * 5, y: base }, { x: origem.x + i * 5, y: topo }], w: 1.8 })
    }
  }
  // Linhas de vento na cena inteira, paralelas ao mergulho.
  const cena = (ms - SKY_MERGULHA) / 420
  if (cena >= 0 && cena < 1) {
    for (let i = 0; i < 14; i++) {
      const lado = em(semCena[i * 2], -80, 80)
      const ini = em(semCena[i * 2 + 1], -40, 40) + cena * 160 - 60
      const x0 = p.x - ux * (60 - ini) - uy * lado, y0 = p.y - uy * (60 - ini) + ux * lado
      const comp = 26 * (1 - cena)
      if (comp > 2) ventos.push({ pts: [{ x: x0, y: y0 }, { x: x0 + ux * comp, y: y0 + uy * comp }], w: 1.2 })
    }
  }
  // Rastro do mergulho: tres fios atras da ave.
  const m = (ms - SKY_MERGULHA) / (SKY_BATE - SKY_MERGULHA)
  if (m >= 0 && m < 1.6) {
    const frente = L * saida(limitar(m)), cauda = L * limitar((m - 0.5) / 1.1)
    for (let i = -1; i <= 1; i++) {
      const off = i * 4
      ventos.push({ pts: [{ x: ceu.x + ux * cauda - uy * off, y: ceu.y + uy * cauda + ux * off }, { x: ceu.x + ux * frente - uy * off * 0.3, y: ceu.y + uy * frente + ux * off * 0.3 }], w: 2.2 - Math.abs(i) * 0.6 })
    }
  }
  // Impacto: enrolados abrindo.
  const e = (ms - SKY_BATE) / 360
  if (e >= 0 && e < 1) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + semSaida[i] * 0.5
      ventos.push({ pts: enrolado({ x: p.x + Math.cos(a) * 26 * saida(e), y: p.y + Math.sin(a) * 18 * saida(e) }, 7 * (1 - e * 0.4), a + ms * 0.02, 1 - e), w: 2 })
    }
  }
  pintarVento(ctx, ventos, pele)

  // A ave: chevron com asas abertas apontando na direcao do mergulho.
  if (m >= 0 && m < 1) {
    const q = { x: ceu.x + ux * L * saida(m), y: ceu.y + uy * L * saida(m) }
    const ang = Math.atan2(uy, ux), asa = 18, corpo = 9
    const ponto = (fr: number, lat: number) => ({ x: q.x + Math.cos(ang) * fr - Math.sin(ang) * lat, y: q.y + Math.sin(ang) * fr + Math.cos(ang) * lat })
    for (const [cor, k] of [[pele.contorno, 1.25], [pele.meio, 1], [pele.nucleo, 0.55]] as const) {
      // Asas varridas pra tras com a ponta curvada: le como ave, nao como flecha.
      const pts = [ponto(corpo * k, 0), ponto(-corpo * 0.1 * k, asa * 0.35 * k), ponto(-corpo * 1.1 * k, asa * k), ponto(-corpo * 0.35 * k, asa * 0.2 * k), ponto(-corpo * 0.9 * k, 0), ponto(-corpo * 0.35 * k, -asa * 0.2 * k), ponto(-corpo * 1.1 * k, -asa * k), ponto(-corpo * 0.1 * k, -asa * 0.35 * k)]
      ctx.fillStyle = cor; ctx.beginPath(); pts.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath(); ctx.fill()
    }
  }
  const penas: Pena[] = []
  for (let i = 0; i < 10; i++) { const f = penaPlanando(p, semPenas, i, (ms - SKY_BATE) / 700, 34, 3.4); if (f) penas.push(f) }
  pintarPenas(ctx, penas, pele)
  const q = ms - SKY_BATE
  if (q >= 0 && q < 320) estrelaDeImpacto(ctx, p, 24, q / 320, pele, fila(semEstrela))
  if (q >= 0 && q < 440) riscos(ctx, p, 14, 46, q / 440, pele.nucleo, fila(semRiscos))
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

// A1 — AIR CUTTER: laminas saem girando pela area inteira e na borda
const CUTTER_DENTRO = 12
const CUTTER_BORDA = 10
const CUTTER_VOO = 360

function airCutter(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const n = CUTTER_DENTRO + CUTTER_BORDA
  const sem = sortear(rng, n * 2)
  const semPenas = Array.from({ length: n }, () => sortear(rng, 1 * 4))
  const penas: Pena[] = [], arcos: Arco[] = []
  const lancamento = { x: centro.x, y: centro.y - 6 }
  for (let i = 0; i < n; i++) {
    const naBorda = i >= CUTTER_DENTRO, j = naBorda ? i - CUTTER_DENTRO : i
    const fim = naBorda ? noChao(centro, ((j + sem[i * 2] * 0.6) / CUTTER_BORDA) * TAU, R * 0.96) : vogel(centro, R, j, CUTTER_DENTRO, 0.85, sem[i * 2] * 0.4)
    const alvo = { x: fim.x, y: fim.y - 6 }
    const d = Math.hypot(alvo.x - lancamento.x, (alvo.y - lancamento.y) / 0.45) / R
    const sai = sem[i * 2 + 1] * 120, voo = CUTTER_VOO * (0.45 + 0.55 * d)
    const u = (ms - sai) / voo
    if (u >= 0 && u < 1) {
      const q = { x: lancamento.x + (alvo.x - lancamento.x) * saida(u), y: lancamento.y + (alvo.y - lancamento.y) * saida(u) - Math.sin(Math.PI * u) * 10 }
      arcos.push(lamina(q, 5.5 * k * 0.8, ms * 0.05 + i))
    }
    // Chegou: corte rapido no ponto e duas penas soltas.
    const e = (ms - sai - voo) / 150
    const cortou = corte(alvo.x, alvo.y, 9 * k * 0.8, -2.4, -0.6, 2.4, e, i * 0.9, 0.8)
    if (cortou) arcos.push(cortou)
    const f = penaPlanando(alvo, semPenas[i], 0, (ms - sai - voo) / 480, 12, 2.8 * Math.min(k, 1.3)); if (f) penas.push(f)
  }
  pintarArcos(ctx, arcos, pele)
  penas.sort((p, q) => p.y - q.y)
  pintarPenas(ctx, penas, pele)
}

// A2 — EXPLOSAO ELEMENTAL (voador): ventania pela area e chuva de penas
const VENTANIA_ENROLADOS = 3
const VENTANIA_CORRE = 620
const VENTANIA_PENAS = 14

function ventania(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semGiro = sortear(rng, 1)[0] * TAU
  const semPenas = sortear(rng, VENTANIA_PENAS * 4)
  const semQueda = sortear(rng, VENTANIA_PENAS)
  const ventos: { pts: Ponto[]; w: number }[] = []
  // Tres enrolados grandes correm em espiral do centro ate a borda.
  const t = limitar(ms / VENTANIA_CORRE)
  const some = limitar((ms - VENTANIA_CORRE) / 200)
  if (some < 1) {
    for (let i = 0; i < VENTANIA_ENROLADOS; i++) {
      const a = semGiro + (i / VENTANIA_ENROLADOS) * TAU + t * 2.2
      const q = noChao(centro, a, R * 0.9 * saida(t))
      ventos.push({ pts: enrolado({ x: q.x, y: q.y - 10 }, (8 + 10 * t) * k * 0.7, a + ms * 0.02, 1 - some, 0.55), w: 2.4 })
    }
    // Rastro: arcos de vento no chao seguindo os enrolados.
    for (let i = 0; i < VENTANIA_ENROLADOS; i++) {
      const pts: Ponto[] = []
      for (let jj = 0; jj <= 10; jj++) {
        const u = t * (0.35 + 0.65 * jj / 10)
        pts.push(noChao(centro, semGiro + (i / VENTANIA_ENROLADOS) * TAU + u * 2.2, R * 0.9 * saida(u)))
      }
      ventos.push({ pts: pts.map(q => ({ x: q.x, y: q.y - 4 })), w: 1.4 * (1 - some) })
    }
  }
  pintarVento(ctx, ventos, pele)
  // Penas caindo pela area inteira (espiral de Vogel), do centro pra fora.
  const penas: Pena[] = []
  for (let i = 0; i < VENTANIA_PENAS; i++) {
    const q = vogel(centro, R, i, VENTANIA_PENAS, 0.92, semGiro)
    const cai = 120 + (i / VENTANIA_PENAS) * 500 + semQueda[i] * 80
    const f = penaPlanando({ x: q.x, y: q.y - 34 }, semPenas, i, (ms - cai) / 620, 20, 3 * Math.min(k, 1.3))
    if (f) penas.push(f)
  }
  penas.sort((p, q) => p.y - q.y)
  pintarPenas(ctx, penas, pele)
}

// A3 — FURACAO (critico): funil no centro, enrolados em aneis, penas rodando
const FURACAO_ANEIS = [{ d: 0.4, n: 3 }, { d: 0.72, n: 4 }, { d: 0.95, n: 6 }] as const
const FURACAO_PENAS = 18

function furacao(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semPenas = sortear(rng, FURACAO_PENAS * 2)
  const semEstrela = sortear(rng, 9)
  const ventos: { pts: Ponto[]; w: number }[] = []
  const forma = saida(limitar(ms / 300)), some = limitar((ms - 1250) / 300)
  const chao = { x: centro.x, y: centro.y + 12 }
  // Funil: elipses de vento empilhadas, abrindo pra cima, girando.
  if (some < 1) {
    const alto = 110 * Math.min(k, 1.4) * forma
    for (let i = 0; i < 5; i++) {
      const u = i / 4
      const r = (8 + u * 34) * Math.min(k, 1.4) * (1 - some * 0.5)
      const y = chao.y - u * alto
      const pts: Ponto[] = []
      const fase = ms * 0.02 * (1.4 - u * 0.5) + i
      for (let jj = 0; jj <= 9; jj++) {
        const a = fase + (jj / 9) * TAU * 0.7
        pts.push({ x: chao.x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.28 })
      }
      ventos.push({ pts, w: 2.4 * (1 - some) })
    }
  }
  // Enrolados girando em aneis pela area inteira: dentro E na borda.
  FURACAO_ANEIS.forEach((anel, ai) => {
    for (let i = 0; i < anel.n; i++) {
      const a = (i / anel.n) * TAU + ms * 0.004 * (ai % 2 ? -1 : 1) + ai
      const aparece = limitar((ms - 150 - ai * 140) / 200) * (1 - some)
      if (aparece <= 0) continue
      const q = noChao(centro, a, R * anel.d)
      ventos.push({ pts: enrolado({ x: q.x, y: q.y - 8 }, 7 * k * 0.7, a + ms * 0.03, aparece, 0.55), w: 1.8 })
    }
  })
  pintarVento(ctx, ventos, pele)
  // Penas rodando pela area toda, subindo e voltando.
  const penas: Pena[] = []
  for (let i = 0; i < FURACAO_PENAS; i++) {
    const d = Math.sqrt((i + 0.5) / FURACAO_PENAS) * 0.92
    const a = i * ANGULO_DOURADO + ms * 0.005 * (1.4 - d)
    const q = noChao(centro, a, R * d)
    const vida = limitar((ms - 100 - semPenas[i * 2] * 200) / 1300)
    if (vida <= 0 || vida >= 1) continue
    penas.push({ x: q.x, y: q.y - 14 - Math.sin(vida * Math.PI) * 30 * (1 - d * 0.5), tam: 3 * Math.min(k, 1.3) * (1 - some), ang: a + Math.PI / 2, vira: Math.cos(ms * 0.02 + i) })
  }
  penas.sort((p, q) => p.y - q.y)
  pintarPenas(ctx, penas, pele)
  const e = ms - 120
  if (e >= 0 && e < 260) estrelaDeImpacto(ctx, { x: chao.x, y: chao.y - 30 }, 16, e / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_VOADOR = {
  single: { 1: 'gust', 2: 'air_slash', 3: 'drill_peck', 4: 'sky_attack' },
  area: { 1: 'air_cutter', 2: 'aoe50_flying', 3: 'aoe50_flying' },
} as const

export const VOADOR_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: gust, duracao: { 1: 1100 }, alcance: 30, impactos: { 1: [GUST_ESTOURA] } },
  2: { desenhar: airSlash, duracao: { 2: 1000 }, alcance: 34, impactos: { 2: SLASH_SAIDAS.map(s => s + SLASH_VOO) } },
  3: { desenhar: drillPeck, duracao: { 3: 1200 }, alcance: 40, margem: { cima: 40, baixo: 49, lados: 40 }, impactos: { 3: [BROCA_CHEGA, BROCA_FURA] } },
  4: { desenhar: skyAttack, duracao: { 4: 1700 }, alcance: 130, margem: { cima: 152, baixo: 130, lados: 130 }, impactos: { 4: [SKY_BATE] } },
}, false)

export const VOADOR_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: airCutter, duracao: { 1: 1000 }, alcance: 40, impactos: { 1: [CUTTER_VOO * 0.6] } },
  2: { desenhar: ventania, duracao: { 2: 1300 }, alcance: 84, margem: { cima: 44, baixo: 20, lados: 20 }, impactos: { 2: [300] } },
  3: { desenhar: furacao, duracao: { 3: 1600 }, alcance: 180, impactos: { 3: [120, 600] } },
}, true)
