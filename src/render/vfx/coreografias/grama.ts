// GRAMA — os 7 golpes, cada um pensado individualmente.
//
// PERSONALIDADE (o que separa de fogo, raio e agua sem olhar a cor):
//   - FOLHA DE VERDADE: bico, nervura e cabo; quando solta, ela PLANA — sobe um
//     pouco, cai em zigue-zague e vira o verso (a metade clara troca de lado).
//     Nunca cai reto como gota nem sobe como chama.
//   - CRESCIMENTO: cipo e raiz nascem da base e a ponta avanca; o corpo afina
//     na ponta e carrega folhas presas nele. Planta nao "aparece", CRESCE.
//   - folha lancada gira de dois jeitos diferentes: a navalha (Razor Leaf) gira
//     CHAPADA como shuriken; a solta gira no proprio eixo mostrando o verso.
//   - o impacto espalha folhas arrancadas. Estrela so no T3/T4, como na agua.
//
// TEXTURA: `pintarFolhas` pinta todas as folhas do quadro em camadas (contorno,
// base, metade clara, nervura) — uma chamada por camada, igual a massa do fogo
// e da agua. Cipo e raiz sao tubos de traco afinando em `pintarTubos`.
//
//   T1 Vine Whip      dois cipos crescem da boca e ESTALAM varrendo o alvo.
//   T2 Magical Leaf   leque de folhas brilhando sobre quem lanca; cada uma sai
//                     em curva teleguiada e crava no alvo.
//   T3 Leaf Blade     uma folha-lamina voa de ponta e abre um X de cortes no
//                     alvo, arrancando folhas.
//   T4 Leaf Storm     folhas giram em volta de quem lanca, correm em helice ate
//                     o alvo e viram um REDEMOINHO alto; a ventania atravessa a
//                     cena e no fim chove folha em volta.
//   A1 Razor Leaf     navalhas giram chapadas do centro ate a borda e cravam nela.
//   A2 Petal Blizzard espiral de folhas que abre ate a borda, roda nela e se solta.
//   A3 Frenzy Plant   raiz grossa sobe do corpo e raizes explodem do chao em
//                     volta da borda inteira, chicoteando.
//
// AREA mostra o alcance (pedido do dono, 29/09): a borda da elipse (raio 175)
// sempre aparece — navalhas cravadas, anel de folhas rodando, raizes.
import { PARTICULAS, type Sementes } from '../particulas'
import { crescente, estrelaDeImpacto, limitar, riscos, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

// ---------------------------------------------------------------------------
// Folha
// ---------------------------------------------------------------------------

/** `vira` -1..1: o "flip" 3D. Negativo = verso pra camera; perto de 0 = de gume. */
interface Folha { x: number; y: number; tam: number; ang: number; vira: number }

/** Pose da folha solta: o movimento `planar` aprovado da particula do tipo. */
const planar = PARTICULAS.folha.mover

/** Folha `i` (4 sementes cada em `sem`) planando a partir de `p`; `t` 0..1 na vida dela. */
function folhaPlanando(p: Ponto, sem: readonly number[], i: number, t: number, R: number, tam: number): Folha | null {
  if (t < 0 || t >= 1) return null
  const s = [sem[i * 4], sem[i * 4 + 1], sem[i * 4 + 2], sem[i * 4 + 3]] as unknown as Sementes
  const pose = planar(p, s, t, R)
  if (pose.escala <= 0.05) return null
  return { x: pose.x, y: pose.y, tam: tam * pose.escala * (0.8 + s[1] * 0.4), ang: pose.giro, vira: pose.vira }
}

/** Contorno de folha lanceolada (o mesmo desenho de `particulas.folha`) ja girado e virado. */
function caminhoDeFolha(ctx: CanvasRenderingContext2D, f: Folha, L: number, W: number): void {
  const c = Math.cos(f.ang), s = Math.sin(f.ang)
  const px = (lx: number, ly: number) => f.x + c * lx - s * ly
  const py = (lx: number, ly: number) => f.y + s * lx + c * ly
  ctx.moveTo(px(-L, 0), py(-L, 0))
  ctx.quadraticCurveTo(px(0, -W * 1.4), py(0, -W * 1.4), px(L, 0), py(L, 0))
  ctx.quadraticCurveTo(px(0, W * 1.4), py(0, W * 1.4), px(-L, 0), py(-L, 0))
}

/**
 * Todas as folhas do quadro numa chamada por camada: contorno, base, metade
 * clara (o lado de cima — troca de lado quando a folha vira o verso) e a
 * nervura com o cabo. `claro` false pinta so contorno e base: folha na sombra,
 * atras do redemoinho.
 */
function pintarFolhas(ctx: CanvasRenderingContext2D, folhas: readonly Folha[], pele: Pele, claro = true): void {
  if (!folhas.length) return
  const larg = (f: Folha) => f.tam * 0.9 * Math.max(0.12, Math.abs(f.vira))
  ctx.fillStyle = pele.contorno; ctx.beginPath()
  for (const f of folhas) caminhoDeFolha(ctx, f, f.tam * 1.9 + 1, larg(f) + 0.7)
  ctx.fill()
  ctx.fillStyle = pele.base; ctx.beginPath()
  for (const f of folhas) caminhoDeFolha(ctx, f, f.tam * 1.9, larg(f))
  ctx.fill()
  if (!claro) return
  ctx.fillStyle = pele.meio; ctx.beginPath()
  for (const f of folhas) {
    const L = f.tam * 1.9, W = larg(f) * (f.vira < 0 ? -1 : 1)
    const c = Math.cos(f.ang), s = Math.sin(f.ang)
    const px = (lx: number, ly: number) => f.x + c * lx - s * ly
    const py = (lx: number, ly: number) => f.y + s * lx + c * ly
    ctx.moveTo(px(-L * 0.9, 0), py(-L * 0.9, 0))
    ctx.quadraticCurveTo(px(0, -W * 1.2), py(0, -W * 1.2), px(L * 0.95, 0), py(L * 0.95, 0))
    ctx.quadraticCurveTo(px(0, -W * 0.2), py(0, -W * 0.2), px(-L * 0.9, 0), py(-L * 0.9, 0))
  }
  ctx.fill()
  ctx.strokeStyle = pele.contorno; ctx.lineWidth = 0.6; ctx.lineCap = 'round'; ctx.beginPath()
  for (const f of folhas) {
    if (f.tam < 2.2) continue
    const L = f.tam * 1.9, c = Math.cos(f.ang), s = Math.sin(f.ang)
    ctx.moveTo(f.x - c * L * 1.25, f.y - s * L * 1.25)
    ctx.lineTo(f.x + c * L * 0.8, f.y + s * L * 0.8)
  }
  ctx.stroke()
}

/** Brilho de 4 pontas finas, chapado: a "magica" do Magical Leaf. */
function pintarBrilhos(ctx: CanvasRenderingContext2D, brilhos: readonly { x: number; y: number; r: number }[], pele: Pele): void {
  for (const [cor, k] of [[pele.contorno, 1.4], [pele.nucleo, 1]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const b of brilhos) {
      const L = b.r * k, w = Math.max(0.5, b.r * 0.28) * k
      ctx.moveTo(b.x, b.y - L); ctx.lineTo(b.x + w, b.y); ctx.lineTo(b.x, b.y + L); ctx.lineTo(b.x - w, b.y); ctx.closePath()
      ctx.moveTo(b.x - L, b.y); ctx.lineTo(b.x, b.y + w); ctx.lineTo(b.x + L, b.y); ctx.lineTo(b.x, b.y - w); ctx.closePath()
    }
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// Cipo / raiz: tubo que cresce da base pra ponta
// ---------------------------------------------------------------------------

function bezier(a: Ponto, k: Ponto, b: Ponto, u: number): Ponto {
  const v = 1 - u
  return { x: v * v * a.x + 2 * v * u * k.x + u * u * b.x, y: v * v * a.y + 2 * v * u * k.y + u * u * b.y }
}

function tangente(a: Ponto, k: Ponto, b: Ponto, u: number): number {
  return Math.atan2(2 * (1 - u) * (k.y - a.y) + 2 * u * (b.y - k.y), 2 * (1 - u) * (k.x - a.x) + 2 * u * (b.x - k.x))
}

/** Corpo de um cipo: a linha central amostrada e o raio em cada ponto. */
interface Tubo { pts: Ponto[]; raios: number[] }

const PONTOS_DO_TUBO = 10

/**
 * Cipo de `a` ate `b` curvado por `k`. `ate` 0..1 e quanto ja cresceu: so
 * existe corpo ate ali, com a ponta afinando. As folhas presas (em `folhasEm`,
 * 0..1 do comprimento) brotam quando a ponta passa delas, alternando os lados.
 */
function cipo(a: Ponto, k: Ponto, b: Ponto, esp: number, ate: number, folhasEm: readonly number[], tamFolha: number, tubos: Tubo[], folhas: Folha[]): void {
  if (ate <= 0) return
  const raio = (u: number) => esp * (1 - 0.65 * u)
  const tubo: Tubo = { pts: [], raios: [] }
  for (let i = 0; i <= PONTOS_DO_TUBO; i++) {
    const u = (i / PONTOS_DO_TUBO) * ate
    tubo.pts.push(bezier(a, k, b, u))
    tubo.raios.push(raio(u))
  }
  tubos.push(tubo)
  folhasEm.forEach((u, j) => {
    const brota = limitar((ate - u) / 0.12)
    if (brota <= 0) return
    const p = bezier(a, k, b, u), ang = tangente(a, k, b, u), lado = j % 2 ? 1 : -1
    const tam = tamFolha * (1 - 0.35 * u) * saida(brota)
    const d = raio(u) + tam * 1.5
    folhas.push({ x: p.x - Math.sin(ang) * d * lado, y: p.y + Math.cos(ang) * d * lado, tam, ang: ang + lado * 1.1, vira: 1 })
  })
}

/**
 * Pinta os tubos como poligono preenchido (os dois lados da linha central,
 * afinando continuo): contorno de todos, depois a base de todos, depois o miolo
 * claro — as camadas fundem os tubos que se cruzam, como a massa do fogo. Um
 * `fill` por camada. Medido no buffer de software do pixelizador: cadeia de
 * circulos 2,7 ms, traco redondo 1,7 ms, poligono 0,7 ms (25 raizes).
 */
function pintarTubos(ctx: CanvasRenderingContext2D, tubos: readonly Tubo[], pele: Pele): void {
  if (!tubos.length) return
  for (const [cor, k, extra] of [[pele.contorno, 1, 1.2], [pele.base, 1, 0], [pele.meio, 0.55, 0]] as const) {
    ctx.fillStyle = cor; ctx.beginPath()
    for (const { pts, raios } of tubos) {
      const n = pts.length - 1
      const lado = (j: number, s: number): [number, number] => {
        const q = pts[Math.min(n, j + 1)], o = pts[Math.max(0, j - 1)]
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1
        const r = raios[j] * k + extra
        return [pts[j].x - (dy / d) * r * s, pts[j].y + (dx / d) * r * s]
      }
      ctx.moveTo(...lado(0, 1))
      for (let j = 1; j <= n; j++) ctx.lineTo(...lado(j, 1))
      for (let j = n; j >= 0; j--) ctx.lineTo(...lado(j, -1))
      ctx.closePath()
    }
    ctx.fill()
  }
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })

// ---------------------------------------------------------------------------
// T1 — VINE WHIP: dois cipos crescem e estalam varrendo o alvo
// ---------------------------------------------------------------------------

const WHIP = [{ sai: 0, estala: 260 }, { sai: 170, estala: 430 }] as const
const WHIP_CRESCE = 200

function vineWhip(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semFolhas = WHIP.map(() => sortear(rng, 4 * 4))
  const semRiscos = WHIP.map(() => sortear(rng, 5 * 3))
  const nx = -Math.sin(angulo), ny = Math.cos(angulo)
  const tubos: Tubo[] = [], folhas: Folha[] = []
  WHIP.forEach((w, i) => {
    const lado = i ? -1 : 1
    const recolhe = limitar((ms - (w.estala + 120)) / 160)
    if (ms >= w.sai && recolhe < 1) {
      // A ponta chega de um lado do alvo e VARRE pro outro no estalo: chicote.
      const varre = saida(limitar((ms - (w.estala - 70)) / 90))
      const desvio = lado * 14 * (1 - 2 * varre)
      const fim = { x: alvo.x + nx * desvio, y: alvo.y + ny * desvio - 3 }
      const curva = lado * (18 - 10 * varre)
      const k = { x: (b.x + fim.x) / 2 + nx * curva, y: (b.y + fim.y) / 2 + ny * curva - 10 }
      cipo(b, k, fim, 2.2, saida(limitar((ms - w.sai) / WHIP_CRESCE)) * (1 - recolhe), [0.35, 0.65], 3.8, tubos, folhas)
    }
    // Estalo: folhas arrancadas do alvo, planando.
    for (let j = 0; j < 4; j++) {
      const f = folhaPlanando(alvo, semFolhas[i], j, (ms - w.estala) / 520, 24, 3.4)
      if (f) folhas.push(f)
    }
  })
  pintarTubos(ctx, tubos, pele)
  pintarFolhas(ctx, folhas, pele)
  WHIP.forEach((w, i) => {
    const e = ms - w.estala
    if (e >= 0 && e < 160) riscos(ctx, alvo, 5, 14, e / 160, pele.nucleo, fila(semRiscos[i]))
  })
}

// ---------------------------------------------------------------------------
// T2 — MAGICAL LEAF: leque brilhando, folhas teleguiadas
// ---------------------------------------------------------------------------

const MAGIC_N = 6
const MAGIC_SAI = 240
const MAGIC_PASSO = 30
const MAGIC_VOO = 240
const MAGIC_CHEGA = MAGIC_SAI + MAGIC_VOO

function magicalLeaf(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semCurva = sortear(rng, MAGIC_N)
  const semFrag = sortear(rng, MAGIC_N * 4)
  const folhas: Folha[] = []
  const brilhos: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < MAGIC_N; i++) {
    // Halo em leque sobre quem lanca, cada folha com a ponta pra fora.
    const leque = -Math.PI / 2 + (i / (MAGIC_N - 1) - 0.5) * 2.6
    const pouso = { x: origem.x + Math.cos(leque) * 22, y: origem.y - 12 + Math.sin(leque) * 15 }
    const sai = MAGIC_SAI + i * MAGIC_PASSO
    const chega = sai + MAGIC_VOO
    const u = (ms - sai) / MAGIC_VOO
    const pisca = 0.6 + 0.4 * Math.abs(Math.sin(ms * 0.02 + i * 1.7))
    if (u < 0) {
      const aparece = saida(limitar((ms - i * 25) / 160))
      if (aparece > 0) {
        folhas.push({ x: pouso.x, y: pouso.y + Math.sin(ms * 0.012 + i) * 1.2, tam: 3.6 * aparece, ang: leque, vira: 0.85 + 0.15 * Math.sin(ms * 0.02 + i) })
        brilhos.push({ x: pouso.x + Math.cos(leque) * 8, y: pouso.y + Math.sin(leque) * 8, r: 3.2 * aparece * pisca })
      }
    } else if (u < 1) {
      // Curva teleguiada: cada folha abre pro seu lado e fecha no alvo.
      const dx = alvo.x - pouso.x, dy = alvo.y - pouso.y, L = Math.hypot(dx, dy) || 1
      const lado = em(semCurva[i], -32, 32)
      const k = { x: pouso.x + dx * 0.5 - (dy / L) * lado, y: pouso.y + dy * 0.5 + (dx / L) * lado - 14 }
      const uu = u * u * (3 - 2 * u)
      const p = bezier(pouso, k, alvo, uu)
      // Na largada a folha VIRA do leque pra rota (mistura de vetores, sem salto de angulo).
      const vira = limitar(u / 0.25), rota = tangente(pouso, k, alvo, uu)
      const ang = Math.atan2(Math.sin(leque) * (1 - vira) + Math.sin(rota) * vira, Math.cos(leque) * (1 - vira) + Math.cos(rota) * vira)
      folhas.push({ x: p.x, y: p.y, tam: 3.6, ang, vira: Math.cos(u * TAU * 2 + i) })
      brilhos.push({ x: p.x - Math.cos(ang) * 9, y: p.y - Math.sin(ang) * 9, r: 2 * pisca })
    }
    // Crava: estoura em brilho e sobra uma folha planando.
    const onde = { x: alvo.x + (semCurva[i] - 0.5) * 10, y: alvo.y - 4 + (i % 3 - 1) * 3 }
    const f = folhaPlanando(onde, semFrag, i, (ms - chega) / 480, 26, 3)
    if (f) folhas.push(f)
    const e = ms - chega
    if (e >= 0 && e < 140) brilhos.push({ x: onde.x, y: onde.y, r: 5.5 * (1 - e / 140) })
  }
  pintarFolhas(ctx, folhas, pele)
  pintarBrilhos(ctx, brilhos, pele)
}

// ---------------------------------------------------------------------------
// T3 — LEAF BLADE: folha-lamina voa de ponta e abre um X no alvo
// ---------------------------------------------------------------------------

const BLADE_VOO = 240
const BLADE_CORTES = [260, 390] as const
const BLADE_RASTRO = 7

function leafBlade(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng, angulo } = c
  const b = boca(c)
  const semRastro = sortear(rng, BLADE_RASTRO * 4)
  const semCortes = BLADE_CORTES.map(() => sortear(rng, 4 * 4))
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 8 * 3)
  const folhas: Folha[] = []
  const trajeto = (u: number): Ponto => ({ x: b.x + (alvo.x - b.x) * u, y: b.y + (alvo.y - b.y) * u - Math.sin(Math.PI * u) * 8 })
  // A lamina: folha grande de ponta, mostrando a face, vibrando.
  if (ms < BLADE_VOO) {
    const u = ms / BLADE_VOO
    const p = trajeto(u)
    folhas.push({ x: p.x, y: p.y, tam: 6, ang: angulo - Math.cos(Math.PI * u) * 0.35, vira: 0.85 + Math.sin(ms * 0.08) * 0.15 })
  }
  // Rastro: folhinhas que a lamina solta pelo caminho.
  for (let i = 0; i < BLADE_RASTRO; i++) {
    const quando = (i / BLADE_RASTRO) * BLADE_VOO
    const f = folhaPlanando(trajeto(quando / BLADE_VOO), semRastro, i, (ms - quando) / 380, 10, 2.8)
    if (f) folhas.push(f)
  }
  // Folhas cortadas: cada corte arranca 4, que saem planando.
  BLADE_CORTES.forEach((t0, i) => {
    for (let j = 0; j < 4; j++) {
      const f = folhaPlanando(alvo, semCortes[i], j, (ms - t0) / 600, 26, 3.4)
      if (f) folhas.push(f)
    }
  })
  pintarFolhas(ctx, folhas, pele)
  const e = ms - BLADE_CORTES[0]
  if (e >= 0 && e < 160) estrelaDeImpacto(ctx, alvo, 11, e / 160, pele, fila(semEstrela))
  const e2 = ms - BLADE_CORTES[1]
  if (e2 >= 0 && e2 < 260) riscos(ctx, alvo, 8, 26, e2 / 260, pele.nucleo, fila(semRiscos))
  // X de cortes POR CIMA de tudo: o gume atravessa o alvo, cada um numa diagonal.
  BLADE_CORTES.forEach((t0, i) => {
    const p = (ms - t0) / 240
    if (p < 0 || p >= 1) return
    const incl = i ? 0.7 : -0.7, R = 24, d = R * 0.55 * 0.8
    crescente(ctx, { x: alvo.x - Math.sin(incl) * d, y: alvo.y - 3 + Math.cos(incl) * d }, R, -2.7, -0.45, 6.5, p, incl, pele, 0.55)
  })
}

// ---------------------------------------------------------------------------
// T4 — LEAF STORM: o redemoinho
// ---------------------------------------------------------------------------
//
//   carga      24 folhas giram em volta de quem lanca, o anel fechando e subindo.
//   corrida    a helice de folhas corre ate o alvo.
//   redemoinho funil alto de folhas girando no alvo — as de tras mais escuras
//              (so contorno e base) — com rajadas de vento varrendo em volta.
//   ventania   folhas atravessam a cena inteira de um lado a outro: o golpe
//              muda a cena, nao so o alvo (licao do Thunder, 29/09).
//   fim        o funil abre e chove folha planando em volta.

const STORM_CARGA = 450
const STORM_CHEGA = 620
const STORM_ABRE = 1150
const STORM_RAJADAS = [700, 900, 1100] as const
const STORM_ANEL = 24
const STORM_HELICE = 30
const STORM_FUNIL = 44
const STORM_VENTO = 30
const STORM_CHUVA = 40
const STORM_ALTO = 72

function leafStorm(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semAnel = sortear(rng, STORM_ANEL * 2)
  const semHelice = sortear(rng, STORM_HELICE)
  const semFunil = sortear(rng, STORM_FUNIL * 3)
  const semVento = sortear(rng, STORM_VENTO * 3)
  const semChuva = sortear(rng, STORM_CHUVA * 4)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 14 * 3)
  const atras: Folha[] = [], frente: Folha[] = []

  // Carga: anel em volta de quem lanca, girando cada vez mais rapido e fechando.
  if (ms < STORM_CARGA + 80) {
    const t = limitar(ms / STORM_CARGA), some = limitar((ms - STORM_CARGA) / 80)
    for (let i = 0; i < STORM_ANEL; i++) {
      const aparece = limitar((ms - semAnel[i * 2] * 150) / 120)
      if (aparece <= 0 || semAnel[i * 2 + 1] < some) continue
      const th = (i / STORM_ANEL) * TAU + t * t * 9
      const r = 26 - 12 * saida(t)
      // Alturas espalhadas e face sempre a mostra: de gume, 24 folhas viram um aro.
      const alto = (semAnel[i * 2 + 1] - 0.5) * 16 * (1 - t * 0.5)
      const f = { x: origem.x + Math.cos(th) * r, y: origem.y - 6 - t * 8 + alto + Math.sin(th) * r * 0.4, tam: 3.2 * aparece, ang: th + Math.PI / 2 + 0.5, vira: (Math.sin(th) < 0 ? -1 : 1) * (0.55 + 0.45 * Math.abs(Math.sin(th))) }
      ;(Math.sin(th) < 0 ? atras : frente).push(f)
    }
  }
  // Corrida: helice de folhas da boca ate o alvo.
  if (ms >= STORM_CARGA && ms < STORM_CHEGA + 200) {
    const dx = alvo.x - origem.x, dy = alvo.y - origem.y, L = Math.hypot(dx, dy) || 1
    for (let i = 0; i < STORM_HELICE; i++) {
      const u = (ms - STORM_CARGA - (i / STORM_HELICE) * 160) / (STORM_CHEGA - STORM_CARGA)
      if (u < 0 || u >= 1) continue
      const th = u * 14 + i * 0.7 + semHelice[i]
      const r = 7 + 3 * Math.sin(u * Math.PI)
      const x = origem.x + dx * u - (dy / L) * Math.cos(th) * r
      const y = origem.y - 8 + dy * u + (dx / L) * Math.cos(th) * r * 0.5 - Math.sin(th) * r * 0.5
      ;(Math.sin(th) < 0 ? atras : frente).push({ x, y, tam: 3.2, ang: Math.atan2(dy, dx) + Math.cos(th), vira: Math.sin(th) })
    }
  }
  // Redemoinho: funil que abre pra cima, girando; no fim ele ABRE e solta tudo.
  if (ms >= STORM_CHEGA - 40 && ms < STORM_ABRE + 260) {
    const forma = saida(limitar((ms - STORM_CHEGA + 40) / 180))
    const abre = limitar((ms - STORM_ABRE) / 260)
    for (let i = 0; i < STORM_FUNIL; i++) {
      const h = ((semFunil[i * 3] * STORM_ALTO + (ms - STORM_CHEGA) * 0.07) % STORM_ALTO) * forma
      const th = semFunil[i * 3 + 1] * TAU + ms * (0.011 + semFunil[i * 3 + 2] * 0.004)
      const r = (7 + h * 0.4) * (1 + abre * 2.2)
      const x = alvo.x + Math.cos(th) * r
      const y = alvo.y + 4 - h + Math.sin(th) * r * 0.32
      const f = { x, y, tam: (2.8 + (h / STORM_ALTO) * 1.2) * (1 - abre * 0.5), ang: th + Math.PI / 2, vira: Math.sin(th) }
      ;(Math.sin(th) < 0 ? atras : frente).push(f)
    }
  }
  // Ventania: folhas cruzando a cena inteira, em ondas, da esquerda pra direita.
  const meio = { x: (origem.x + alvo.x) / 2, y: (origem.y + alvo.y) / 2 }
  for (let i = 0; i < STORM_VENTO; i++) {
    const t = (ms - STORM_CHEGA - semVento[i * 3] * 600) / 520
    if (t < 0 || t >= 1) continue
    const y0 = meio.y - 60 + semVento[i * 3 + 1] * 80
    frente.push({ x: meio.x - 85 + t * 170, y: y0 + Math.sin(t * 8 + i) * 5, tam: em(semVento[i * 3 + 2], 2.8, 3.8), ang: Math.sin(t * 8 + i) * 0.6, vira: Math.cos(t * 12 + i) })
  }
  // Chuva de folha quando o funil abre.
  for (let i = 0; i < STORM_CHUVA; i++) {
    const quando = STORM_ABRE + semChuva[i * 4 + 3] * 200
    const de = { x: alvo.x + (semChuva[i * 4] - 0.5) * 30, y: alvo.y - semChuva[i * 4 + 1] * STORM_ALTO * 0.8 }
    const f = folhaPlanando(de, semChuva, i, (ms - quando) / 440, 55, 3.4)
    if (f) frente.push(f)
  }

  pintarFolhas(ctx, atras, pele, false)
  // Rajadas: arcos de vento deitados que varrem em volta do funil.
  STORM_RAJADAS.forEach((t0, i) => {
    const p = (ms - t0) / 300
    if (p >= 0 && p < 1) crescente(ctx, { x: alvo.x, y: alvo.y - 14 - i * 16 }, 24 + i * 5, i % 2 ? 0.2 : Math.PI + 0.2, i % 2 ? 2.9 : TAU - 0.3, 3.5, p, 0, pele, 0.35)
  })
  pintarFolhas(ctx, frente, pele)
  const e = ms - STORM_CHEGA
  if (e >= 0 && e < 300) estrelaDeImpacto(ctx, alvo, 22, e / 300, pele, fila(semEstrela))
  if (e >= 0 && e < 420) riscos(ctx, alvo, 14, 40, e / 420, pele.nucleo, fila(semRiscos))
}

// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175
// ---------------------------------------------------------------------------

const escalaDaArea = (r: number) => Math.max(1, r / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

// A1 — RAZOR LEAF: navalhas giram chapadas ate a borda e cravam nela
const NAVALHAS = 22
const RAZOR_SAI = 60
const RAZOR_VOO = 300
const RAZOR_CRAVADA = 160

function razorLeaf(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.8)
  const sem = sortear(rng, NAVALHAS * 2)
  const semCai = sortear(rng, NAVALHAS * 4)
  const folhas: Folha[] = []
  for (let i = 0; i < NAVALHAS; i++) {
    const a = ((i + sem[i * 2] * 0.6) / NAVALHAS) * TAU
    const sai = RAZOR_SAI + sem[i * 2 + 1] * 60
    const t = (ms - sai) / RAZOR_VOO
    const fim = noChao(centro, a, R * 0.97)
    const tam = 2.8 * k
    if (t >= 0 && t < 1) {
      // Gira CHAPADA e rapida, como shuriken — nao vira o verso.
      const u = saida(t)
      const x = centro.x + (fim.x - centro.x) * u, y = centro.y + (fim.y - 6 - centro.y) * u - Math.sin(Math.PI * t) * 8
      folhas.push({ x, y, tam, ang: ms * 0.045 + i, vira: 1 })
    } else if (t >= 1) {
      // Cravada na borda, de ponta, tremendo; depois solta e plana.
      const cravada = ms - (sai + RAZOR_VOO)
      if (cravada < RAZOR_CRAVADA) folhas.push({ x: fim.x, y: fim.y - 6, tam, ang: a + Math.PI + Math.sin(cravada * 0.2) * 0.12, vira: 0.55 })
      else {
        const f = folhaPlanando({ x: fim.x, y: fim.y - 6 }, semCai, i, (cravada - RAZOR_CRAVADA) / 420, 14, tam * 0.8)
        if (f) folhas.push(f)
      }
    }
  }
  folhas.sort((p, q) => p.y - q.y)
  pintarFolhas(ctx, folhas, pele)
}

// A2 — PETAL BLIZZARD: tres bracos de espiral girando abrem ate a borda, um
// anel de folhas roda nela e no fim tudo se solta planando. E o AoE mais comum
// da grama (aoe50_grass cai aqui): manter barato.
interface Redemoinho { bracos: number; porBraco: number; anel: number; sai: number; abre: number; solta: number; tam: number }

const BLIZZARD: Redemoinho = { bracos: 3, porBraco: 12, anel: 14, sai: 100, abre: 520, solta: 850, tam: 2.2 }

const folhasDoRedemoinho = (r: Redemoinho) => r.bracos * r.porBraco + r.anel

/**
 * Redemoinho de folhas no chao da area: bracos de espiral girando que abrem do
 * centro ate a borda, um anel rodando na borda e, em `solta`, tudo planando.
 * `sem` traz 4 numeros por folha (`folhasDoRedemoinho`).
 */
function redemoinho(ms: number, centro: Ponto, R: number, k: number, r: Redemoinho, sem: readonly number[], folhas: Folha[]): void {
  const n = folhasDoRedemoinho(r), nosBracos = r.bracos * r.porBraco
  const giro = ms * 0.007
  for (let i = 0; i < n; i++) {
    const noAnel = i >= nosBracos
    let a: number, ate: number, sai: number
    if (noAnel) {
      // Anel: entra quando os bracos chegam na borda e roda nela — mostra o alcance.
      a = ((i - nosBracos) / r.anel) * TAU + giro * 1.3
      ate = 0.97
      sai = r.sai + r.abre * 0.6 + sem[i * 4 + 1] * 60
    } else {
      // Braco de espiral: quanto mais longe do centro, mais torcido pra tras.
      const braco = i % r.bracos, f = (Math.floor(i / r.bracos) + 0.3 + sem[i * 4] * 0.4) / r.porBraco
      a = (braco / r.bracos) * TAU - f * 2.6 + giro
      ate = 0.12 + f * 0.85
      sai = r.sai + sem[i * 4 + 1] * 60
    }
    const t = limitar((ms - sai) / (noAnel ? 250 : r.abre))
    if (t <= 0) continue
    const p = noChao(centro, a, R * ate * (noAnel ? 0.75 + 0.25 * saida(t) : saida(t)))
    const solta = (ms - r.solta - sem[i * 4 + 2] * 150) / 400
    const tam = r.tam * k * (0.6 + 0.4 * saida(t))
    if (solta < 0) folhas.push({ x: p.x, y: p.y - 8 - Math.sin(ms * 0.01 + i) * 3, tam, ang: a + Math.PI / 2, vira: Math.cos(ms * 0.02 + i) })
    else {
      const f = folhaPlanando({ x: p.x, y: p.y - 8 }, sem, i, solta, 18, tam)
      if (f) folhas.push(f)
    }
  }
}

function petalBlizzard(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.8)
  const sem = sortear(rng, folhasDoRedemoinho(BLIZZARD) * 4)
  const folhas: Folha[] = []
  redemoinho(ms, centro, R, k, BLIZZARD, sem, folhas)
  folhas.sort((p, q) => p.y - q.y)
  pintarFolhas(ctx, folhas, pele)
}

// A3 — FRENZY PLANT: o redemoinho do Petal Blizzard, maior (4 bracos, anel
// mais cheio), varre a AREA INTEIRA; por onde a frente dele passa, raizes
// rompem o chao em aneis, do centro ate a borda. O golpe pega todo mundo
// dentro (dono, 30/09: planta so na borda dava a impressao de que so quem
// estava na borda tomava dano; e pediu pra unir a ideia do A2 com a do A3).
const FRENZY_TRONCO = 400
const FRENZY_REDEMOINHO: Redemoinho = { bracos: 4, porBraco: 12, anel: 18, sai: 100, abre: 700, solta: 1000, tam: 2.7 }
/** Quando a frente do redemoinho (saida(t) = d) passa pela fracao `d` do raio. */
const passaEm = (d: number) => FRENZY_REDEMOINHO.sai + FRENZY_REDEMOINHO.abre * (1 - Math.cbrt(1 - d)) + 30
/** Aneis de raizes: fracao do raio e quantas; rompem logo atras da frente do redemoinho. */
const FRENZY_ANEIS = [{ d: 0.4, n: 4 }, { d: 0.7, n: 7 }, { d: 0.95, n: 12 }].map(a => ({ ...a, rompe: passaEm(a.d) }))
export const FRENZY_ONDAS = FRENZY_ANEIS.map(a => a.rompe)
const FRENZY_RAIZES = FRENZY_ANEIS.flatMap((anel, i) => Array.from({ length: anel.n }, (_, j) => ({ anel: i, a: ((j + (i % 2) * 0.5) / anel.n) * TAU, d: anel.d, rompe: anel.rompe })))
const FRENZY_CRESCE = 180
const FRENZY_RECOLHE = 1150

function frenzyPlant(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio: R, pele, rng } = c
  const k = Math.min(escalaDaArea(R), 1.6)
  const semRaiz = sortear(rng, FRENZY_RAIZES.length * 2)
  const semRedemoinho = sortear(rng, folhasDoRedemoinho(FRENZY_REDEMOINHO) * 4)
  const semEstrela = sortear(rng, 9)
  const tubos: Tubo[] = [], folhas: Folha[] = []
  const recolhe = limitar((ms - FRENZY_RECOLHE) / 250)
  const chao = { x: centro.x, y: centro.y + 12 }
  const topo = { x: chao.x, y: chao.y - 58 * k }
  // Arco: duas raizes grossas sobem dos DOIS lados de quem lanca e se cruzam
  // por cima da cabeca — o corpo continua a mostra no meio.
  if (recolhe < 1) {
    const cresce = saida(limitar(ms / FRENZY_TRONCO)) * (1 - recolhe)
    for (const lado of [-1, 1]) {
      const base = { x: chao.x + lado * 15 * k, y: chao.y - 6 }
      const ponta = { x: topo.x - lado * 6 * k + Math.sin(ms * 0.004 + lado) * 3, y: topo.y }
      cipo(base, { x: base.x + lado * 16 * k, y: chao.y - 40 * k }, ponta, 4.2 * k * (1 - recolhe * 0.8), cresce, [0.4, 0.65, 0.88], 2.6 * k, tubos, folhas)
    }
  }
  // Raizes: cada anel rompe o chao numa onda que corre do centro pra borda,
  // cada raiz inclinada pra fora (a forca vem de quem lanca) e chicoteando.
  FRENZY_RAIZES.forEach((r, i) => {
    const a = r.a + (semRaiz[i * 2] - 0.5) * 0.25
    const base = noChao(centro, a, R * r.d)
    // Dentro do anel a onda tambem anda: a frente de cada raiz sai em sequencia.
    const quando = r.rompe + (Math.abs(Math.sin(a / 2)) * 40)
    const cresce = saida(limitar((ms - quando) / FRENZY_CRESCE)) * (1 - recolhe)
    if (cresce > 0) {
      // Baixas por dentro (o redemoinho tem que aparecer por cima); a borda, mais alta, marca o limite.
      const alto = em(semRaiz[i * 2 + 1], 32, 44) * k * (r.anel === 2 ? 0.8 : 0.5)
      const fora = Math.cos(a) * 12 * k
      const chicote = Math.sin((ms - quando) * 0.012 + i) * 5 * k
      const ponta = { x: base.x + fora + chicote, y: base.y - alto }
      cipo(base, { x: base.x - fora * 0.6, y: base.y - alto * 0.55 }, ponta, 3 * k * (1 - recolhe * 0.8), cresce, [0.5, 0.75], 2 * k, tubos, folhas)
    }
  })
  // Fundo primeiro: raiz da frente (y maior) cobre a de tras.
  const ordem = tubos.map((t, i) => [t.pts[0].y, i] as const).sort((p, q) => p[0] - q[0]).map(([, i]) => tubos[i])
  pintarTubos(ctx, ordem, pele)
  // O redemoinho por cima das raizes: as folhas passam na frente delas.
  redemoinho(ms, centro, R, k, FRENZY_REDEMOINHO, semRedemoinho, folhas)
  folhas.sort((p, q) => p.y - q.y)
  pintarFolhas(ctx, folhas, pele)
  const e = ms - FRENZY_ONDAS[0]
  if (e >= 0 && e < 240) estrelaDeImpacto(ctx, topo, 14, e / 240, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DA_GRAMA = {
  single: { 1: 'vine_whip', 2: 'magical_leaf', 3: 'leaf_blade', 4: 'leaf_storm' },
  area: { 1: 'razor_leaf', 2: 'petal_blizzard', 3: 'frenzy_plant' },
} as const

export const GRAMA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: vineWhip, duracao: { 1: 1000 }, alcance: 34, impactos: { 1: WHIP.map(w => w.estala) } },
  2: { desenhar: magicalLeaf, duracao: { 2: 1100 }, alcance: 40, impactos: { 2: [MAGIC_CHEGA] } },
  3: { desenhar: leafBlade, duracao: { 3: 1100 }, alcance: 40, impactos: { 3: [...BLADE_CORTES] } },
  4: { desenhar: leafStorm, duracao: { 4: 1800 }, alcance: 95, impactos: { 4: [STORM_CHEGA, ...STORM_RAJADAS] } },
}

export const GRAMA_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = {
  1: { desenhar: razorLeaf, duracao: { 1: 1000 }, alcance: 30, impactos: { 1: [RAZOR_SAI + RAZOR_VOO] } },
  2: { desenhar: petalBlizzard, duracao: { 2: 1450 }, alcance: 30, impactos: { 2: [BLIZZARD.sai + 250] } },
  // As raizes da borda de tras (y ~ -67) sobem ate ~74 acima dela.
  3: { desenhar: frenzyPlant, duracao: { 3: 1600 }, alcance: 145, impactos: { 3: FRENZY_ONDAS } },
}
