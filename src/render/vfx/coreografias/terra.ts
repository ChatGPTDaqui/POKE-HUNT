// TERRA (GROUND) — 4 single + 3 area, cada um pensado individualmente.
//
// Catalogo por faixa: T1 Mud-Slap/Bone Rush/Sand Tomb/Bonemerang; T2 Mud
// Shot/Bone Club/Mud Bomb/Stomping Tantrum; T3 Dig/Drill Run/Earth Power/High
// Horsepower; T4 nenhum (so por critico do T3). Area: A1 Bulldoze, A2 a
// Explosao Elemental do nivel 50 (poder 70), A3 Earthquake/Precipice Blades.
//
// PERSONALIDADE (o que separa da pedra e do lutador sem olhar a cor): a terra
// e PESO que vem DE BAIXO. Nada voa leve:
//   - o chao RACHA antes de explodir (a antecipacao do tipo);
//   - TORROES sobem do chao e CAEM com gravidade, girando;
//   - POEIRA rola rasteira, larga e baixa, e assenta devagar (o rescaldo);
//   - lama e terra molhada: bolota pesada que espirra e escorre.
// A linguagem das referencias do dono (fogo, 01/10) entra como: raios e
// fagulhas no impacto (acabamento.ts), riscos de velocidade no que voa e um
// rescaldo que assenta — a poeira baixa.
//
//   T1 Mud-Slap        tres bolotas de lama em arco; cada uma espirra no alvo.
//   T2 Mud Shot        rajada reta de lama com riscos; o alvo fica sujo e
//                      pinga.
//   T3 Earth Power     o chao racha e brilha sob o alvo e EXPLODE pra cima:
//                      coluna de terra, torroes que sobem e caem, poeira.
//   T4 Fissure (crit)  a fenda corre de quem lanca ate o alvo e lascas de
//                      rocha rompem pela fenda, a maior embaixo do alvo.
//   A1 Bulldoze        pisao: uma onda de poeira rola do centro ate a borda,
//                      levantando torroes por onde passa.
//   A2 (Expl. Elem.)   rachaduras correm do centro pra fora e cada ponto do
//                      interior estoura em terra quando a fenda chega.
//   A3 Earthquake      tres ondas, rachaduras pela area toda, torroes
//                      pulando no interior inteiro e a borda levantando
//                      parede de poeira.
//
// Rachadura e desenho NO CHAO, e a camada de VFX vai por cima das entidades:
// por isso e fina, curta e some rapido — marca grossa cobriria os pes.
import { afinado, comImpacto } from '../acabamento'
import { entrada, estrelaDeImpacto, limitar, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2
const CIMA = -Math.PI / 2
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))
/** Gravidade dos torroes, em un/ms². */
const GRAVIDADE = 0.0011

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

const pe = (p: Ponto): Ponto => ({ x: p.x, y: p.y + 12 })
const escalaDaArea = (raio: number) => Math.max(1, raio / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

// ---------------------------------------------------------------------------
// Pecas do tipo
// ---------------------------------------------------------------------------

/** Torrao no instante: posicao, raio, giro e semente da forma. */
interface Torrao { x: number; y: number; r: number; giro: number; s: number }

/**
 * Torrao lancado de `p` em `a` com velocidade `v` (un/ms), no instante `idade`
 * (ms). Sobe, CAI e para no chao (`p.y + chao`), encolhendo depois de pousar.
 */
function torraoEm(p: Ponto, a: number, v: number, r: number, idade: number, s: number, chao = 4, vida = 700): Torrao | null {
  if (idade < 0 || idade > vida) return null
  const vx = Math.cos(a) * v, vy = Math.sin(a) * v
  let y = p.y + vy * idade + 0.5 * GRAVIDADE * idade * idade
  const x = p.x + vx * idade
  const pousou = y > p.y + chao
  if (pousou) y = p.y + chao
  const some = 1 - entrada(limitar((idade - vida * 0.6) / (vida * 0.4)))
  return { x, y, r: r * some, giro: s * TAU + (pousou ? 0 : idade * 0.012 * (s < 0.5 ? 1 : -1)), s }
}

/** Torroes em 3 camadas (contorno, base, luz em cima-esquerda), um `fill` por camada. */
function pintarTorroes(ctx: CanvasRenderingContext2D, torroes: readonly Torrao[], pele: Pele): void {
  const poligono = (t: Torrao, k: number, dx: number, dy: number) => {
    for (let i = 0; i < 6; i++) {
      const a = t.giro + (i / 6) * TAU
      const rr = t.r * k * (0.72 + 0.28 * Math.abs(Math.sin(t.s * 37 + i * 2.1)))
      const x = t.x + dx + Math.cos(a) * rr, y = t.y + dy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  for (const [cor, k, d] of [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.55, -0.35]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const t of torroes) if (t.r * k > 0.4) poligono(t, k, d * t.r, d * t.r)
    ctx.fill()
  }
}

/** Bolota de poeira no instante: centro e raio (0 some). */
interface Bolota { x: number; y: number; r: number }

/**
 * Poeira rasteira: incha rapido, rola pro lado e pra cima devagar e ASSENTA
 * encolhendo (nunca some por transparencia — vira pontilhado sujo).
 */
function poeiraEm(p: Ponto, dx: number, r0: number, idade: number, vida: number): Bolota | null {
  const t = idade / vida
  if (t < 0 || t > 1) return null
  const r = r0 * (0.5 + 0.9 * saida(limitar(t * 2.5))) * (1 - entrada(limitar((t - 0.45) / 0.55)))
  return { x: p.x + dx * saida(t), y: p.y - 4 * saida(t), r }
}

/** Poeira em 3 tons: base embaixo, meio, e a luz em cima — sem contorno escuro. */
function pintarPoeira(ctx: CanvasRenderingContext2D, bolotas: readonly Bolota[], pele: Pele): void {
  // Tufo: tres bolotas desiguais. Uma elipse lisa lia como pao, nao poeira.
  const TUFO = [[-0.55, 0.15, 0.7], [0.5, 0.1, 0.62], [0.05, -0.4, 0.75]] as const
  for (const [cor, k, o] of [[pele.base, 1.05, 0.28], [pele.meio, 0.92, 0.05], [pele.nucleo, 0.5, -0.3]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const b of bolotas) {
      // Espelha o tufo conforme o lugar: tufos iguais em fila liam como carimbo.
      const lado = (Math.floor(b.x * 0.37 + b.y * 0.61) & 1) ? 1 : -1
      for (const [dx, dy, m] of TUFO) {
        const r = b.r * m * k
        if (r < 0.5) continue
        const x = b.x + lado * dx * b.r, y = b.y + dy * b.r + o * b.r
        ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU)
      }
    }
    ctx.fill()
  }
}

/**
 * Rachadura no chao: linha quebrada que nasce em `de` e corre `comp` na
 * direcao `a`, revelada ate a fracao `t`. `brilho` pinta um fio claro dentro
 * (o chao "acendendo" do Earth Power). Achatada pela camera (y * 0.45).
 */
function rachadura(
  ctx: CanvasRenderingContext2D, de: Ponto, a: number, comp: number, t: number,
  sem: readonly number[], pele: Pele, larg = 2, brilho = false,
): void {
  if (t <= 0) return
  const n = 5
  const pts: Ponto[] = [de]
  for (let i = 1; i <= n; i++) {
    const u = (i / n) * comp
    const lado = (sem[(i * 2) % sem.length] - 0.5) * comp * 0.18
    pts.push({ x: de.x + Math.cos(a) * u - Math.sin(a) * lado, y: de.y + (Math.sin(a) * u + Math.cos(a) * lado) * 0.45 })
  }
  const ate = t * n
  for (const [cor, k] of (brilho ? [[pele.contorno, 1], [pele.nucleo, 0.4]] : [[pele.contorno, 1]]) as [string, number][]) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (let i = 0; i < n && i < ate; i++) {
      const f = Math.min(1, ate - i)
      const a0 = pts[i], a1 = pts[i + 1]
      afinado(ctx, a0.x, a0.y, a0.x + (a1.x - a0.x) * f, a0.y + (a1.y - a0.y) * f, larg * k * (1 - i / (n + 1)))
    }
    ctx.fill()
  }
}

/** Bolota de lama (corpo + gota de baixo pesada), em 3 camadas. */
function lama(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pele: Pele): void {
  for (const [cor, k, o] of [[pele.contorno, 1.35, 0], [pele.base, 1, 0], [pele.meio, 0.35, -0.4]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    ctx.arc(x + o * r, y + o * r, r * k, 0, TAU)
    ctx.arc(x - r * 0.3, y + r * 0.55, r * k * 0.6, 0, TAU)
    ctx.fill()
  }
}

/** Respingo de lama no alvo: borrao achatado + pingos que escorrem e caem. */
function respingo(ctx: CanvasRenderingContext2D, p: Ponto, t: number, sem: readonly number[], pele: Pele, k = 1): void {
  if (t < 0 || t > 1) return
  const abre = saida(limitar(t * 3))
  const encolhe = 1 - entrada(limitar((t - 0.55) / 0.45))
  const r = 5.2 * k * abre * encolhe
  for (const [cor, m] of [[pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.4]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    if (r > 0.4) { ctx.moveTo(p.x + r * m, p.y); ctx.ellipse(p.x, p.y, r * m, r * m * 0.75, 0, 0, TAU) }
    // Pingos: escorrem e o da ponta cai depois da metade.
    for (let i = 0; i < 4; i++) {
      const x = p.x + (sem[i] - 0.5) * 8 * k
      const desce = (2 + sem[i + 4] * 6) * k * saida(limitar(t * 1.6))
      const cai = t > 0.5 ? 14 * k * entrada((t - 0.5) / 0.5) : 0
      const rr = 1.2 * k * m * encolhe
      if (rr > 0.3) { ctx.moveTo(x + rr, p.y + desce + cai); ctx.arc(x, p.y + desce + cai, rr, 0, TAU) }
    }
    ctx.fill()
  }
}

/** Riscos de velocidade ao lado do que voa de `a` pra `b` (o que as referencias tem). */
function riscos(ctx: CanvasRenderingContext2D, a: Ponto, b: Ponto, u: number, sem: readonly number[], pele: Pele, k = 1): void {
  if (u <= 0 || u >= 1) return
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1
  const ux = dx / d, uy = dy / d
  ctx.fillStyle = pele.nucleo
  ctx.beginPath()
  for (let i = 0; i < 3; i++) {
    const off = (sem[i] - 0.5) * 10 * k
    const cab = d * u - 2, cauda = cab - (8 + sem[i + 3] * 6) * k
    if (cauda < 0) continue
    afinado(ctx, a.x + ux * cauda - uy * off, a.y + uy * cauda + ux * off, a.x + ux * cab - uy * off, a.y + uy * cab + ux * off, 1.8)
  }
  ctx.fill()
}

// ---------------------------------------------------------------------------
// T1 — MUD-SLAP
// ---------------------------------------------------------------------------

const SLAP_SAIDAS = [60, 140, 220] as const
const SLAP_VOO = 160

function mudSlap(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const desvios = SLAP_SAIDAS.map(() => sortear(rng, 2))
  const pingos = SLAP_SAIDAS.map(() => sortear(rng, 8))
  const semRiscos = SLAP_SAIDAS.map(() => sortear(rng, 6))
  const b = { x: origem.x + Math.cos(c.angulo) * 8, y: origem.y + 4 }
  SLAP_SAIDAS.forEach((sai, i) => {
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 10, y: alvo.y + (desvios[i][1] - 0.5) * 10 }
    const u = (ms - sai) / SLAP_VOO
    if (u > 0 && u < 1) {
      // Arco baixo e pesado: lama arremessada, nao projetil de energia.
      const x = b.x + (fim.x - b.x) * u, y = b.y + (fim.y - b.y) * u - Math.sin(Math.PI * u) * 10
      riscos(ctx, b, fim, u, semRiscos[i], pele, 0.6)
      lama(ctx, x, y, 3.2, pele)
    }
    respingo(ctx, fim, (ms - sai - SLAP_VOO) / 420, pingos[i], pele, 0.8)
  })
}

// ---------------------------------------------------------------------------
// T2 — MUD SHOT
// ---------------------------------------------------------------------------

const SHOT_SAI = 120
const SHOT_VOO = 140
const SHOT_N = 5
const SHOT_CADA = 50

function mudShot(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const desvios = sortear(rng, SHOT_N * 2)
  const pingos = sortear(rng, 8)
  const semRiscos = sortear(rng, 6)
  const semPoeira = sortear(rng, 6)
  const b = { x: origem.x + Math.cos(c.angulo) * 9, y: origem.y + Math.sin(c.angulo) * 9 - 1 }
  // Bolotas em fila reta, cada uma maior que a anterior: a rajada "engrossa".
  for (let i = 0; i < SHOT_N; i++) {
    const u = (ms - SHOT_SAI - i * SHOT_CADA) / SHOT_VOO
    if (u <= 0 || u >= 1) continue
    const fim = { x: alvo.x + (desvios[i * 2] - 0.5) * 6, y: alvo.y + (desvios[i * 2 + 1] - 0.5) * 6 }
    riscos(ctx, b, fim, u, semRiscos, pele, 0.8)
    lama(ctx, b.x + (fim.x - b.x) * u, b.y + (fim.y - b.y) * u, 2.6 + i * 0.4, pele)
  }
  // Poeira levantada no pe do alvo pelos acertos.
  const bolotas: Bolota[] = []
  for (let i = 0; i < 3; i++) {
    const p = poeiraEm(pe(alvo), (semPoeira[i] - 0.5) * 18, 3 + semPoeira[i + 3] * 2, ms - SHOT_SAI - SHOT_VOO - i * 90, 600)
    if (p) bolotas.push(p)
  }
  pintarPoeira(ctx, bolotas, pele)
  respingo(ctx, alvo, (ms - SHOT_SAI - SHOT_VOO) / 700, pingos, pele, 1.15)
}

// ---------------------------------------------------------------------------
// T3 — EARTH POWER
// ---------------------------------------------------------------------------

const POWER_RACHA = 40
const POWER_EXPLODE = 340

function earthPower(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const semRachas = sortear(rng, 5 * 12)
  const angRachas = sortear(rng, 5)
  const semTorroes = sortear(rng, 14 * 4)
  const semPoeira = sortear(rng, 8 * 2)
  const semEstrela = sortear(rng, 9)
  const chao = pe(alvo)

  // 1. Antecipacao: o chao racha em estrela sob o alvo e o fio ACENDE.
  if (ms < POWER_EXPLODE + 260) {
    const t = limitar((ms - POWER_RACHA) / (POWER_EXPLODE - POWER_RACHA))
    const some = 1 - limitar((ms - POWER_EXPLODE) / 260)
    for (let i = 0; i < 5; i++) {
      rachadura(ctx, chao, (i / 5) * TAU + angRachas[i] * 0.8, 24 * some, t, semRachas.slice(i * 12, i * 12 + 12), pele, 2.8, true)
    }
    // Pedrinhas TREMENDO no chao antes de explodir: pulinhos curtos e secos.
    if (ms < POWER_EXPLODE) {
      const pulos: Torrao[] = []
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + angRachas[i]
        const fase = ((ms + i * 37) % 90) / 90
        pulos.push({ x: chao.x + Math.cos(a) * 9, y: chao.y + Math.sin(a) * 4 - 3 * Math.sin(Math.PI * fase) * t, r: 1.4, giro: a, s: angRachas[i] })
      }
      pintarTorroes(ctx, pulos, pele)
    }
  }
  // 2. Coluna: GEISER de terra solida que rompe o chao, afina em cima e
  //    desaba de cima pra baixo (a base fica por ultimo).
  const tc = (ms - POWER_EXPLODE) / 460
  if (tc >= 0 && tc <= 1) {
    const topo = 44 * saida(limitar(tc * 3)) * (1 - entrada(limitar((tc - 0.45) / 0.55)))
    const larg = 8 * (1 - entrada(limitar((tc - 0.6) / 0.4)))
    if (topo > 2 && larg > 0.5) {
      for (const [cor, k, dx] of [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.5, -0.35]] as const) {
        ctx.fillStyle = cor
        ctx.beginPath()
        const w = larg * k, x0 = chao.x + dx * larg
        ctx.moveTo(x0 - w, chao.y + 1)
        // Borda em degraus de torrao: o geiser e terra, nao fumaca lisa.
        for (let i = 1; i <= 5; i++) ctx.lineTo(x0 - w * (1 - i / 6) - (i % 2) * 1.2, chao.y - topo * (i / 5))
        for (let i = 5; i >= 1; i--) ctx.lineTo(x0 + w * (1 - i / 6) + (i % 2) * 1.2, chao.y - topo * (i / 5) + 1)
        ctx.lineTo(x0 + w, chao.y + 1)
        ctx.closePath()
        ctx.fill()
      }
    }
  }
  // 3. Torroes: sobem com a coluna e caem em volta.
  const torroes: Torrao[] = []
  for (let i = 0; i < 14; i++) {
    const s = semTorroes.slice(i * 4, i * 4 + 4)
    const t = torraoEm(chao, CIMA + (s[0] - 0.5) * 1.3, em(s[1], 0.12, 0.26), em(s[2], 1.4, 2.6), ms - POWER_EXPLODE - s[3] * 60, s[3], 4, 760)
    if (t) torroes.push(t)
  }
  // 4. Poeira rasteira que rola pros lados e assenta (o rescaldo).
  const poeira: Bolota[] = []
  for (let i = 0; i < 8; i++) {
    const p = poeiraEm(chao, (i % 2 ? 1 : -1) * em(semPoeira[i * 2], 10, 24), em(semPoeira[i * 2 + 1], 3, 5), ms - POWER_EXPLODE - 60 - i * 25, 760)
    if (p) poeira.push(p)
  }
  pintarPoeira(ctx, poeira, pele)
  pintarTorroes(ctx, torroes, pele)
  if (ms >= POWER_EXPLODE && ms < POWER_EXPLODE + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - POWER_EXPLODE) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — FISSURE (critico do T3)
// ---------------------------------------------------------------------------

const FENDA_INICIO = 80
const FENDA_CHEGA = 460
const FENDA_ROMPE = 620

function fissure(c: ContextoVfx): void {
  const { ctx, ms, origem, alvo, pele, rng } = c
  const semFenda = sortear(rng, 12)
  const semLascas = sortear(rng, 7 * 3)
  const semTorroes = sortear(rng, 18 * 4)
  const semPoeira = sortear(rng, 12 * 2)
  const semEstrela = sortear(rng, 9)
  const de = pe(origem), ate = pe(alvo)
  const dist = Math.hypot(ate.x - de.x, (ate.y - de.y) / 0.45)
  const a = Math.atan2((ate.y - de.y) / 0.45, ate.x - de.x)

  // 1. A fenda corre pelo chao de quem lanca ate o alvo e passa um pouco.
  const tf = limitar((ms - FENDA_INICIO) / (FENDA_CHEGA - FENDA_INICIO))
  const fecha = 1 - limitar((ms - 1200) / 300)
  if (fecha > 0) rachadura(ctx, de, a, (dist + 14) * fecha, tf, semFenda, pele, 3, true)

  // 2. Lascas de rocha rompem pela fenda, da origem ao alvo; a ultima, embaixo
  //    do alvo, e a maior. Triangulos altos: o chao se abre em dentes.
  const lascas: [number, number, number, number][] = [] // x, y, altura, largura
  for (let i = 0; i < 7; i++) {
    const u = (i + 1) / 7
    const rompe = FENDA_CHEGA + (FENDA_ROMPE - FENDA_CHEGA) * u
    const t = (ms - rompe) / 700
    if (t < 0 || t > 1) continue
    const sobe = saida(limitar(t * 4)) * (1 - entrada(limitar((t - 0.6) / 0.4)))
    const h = (i === 6 ? 30 : em(semLascas[i * 3], 9, 18)) * sobe
    const p = { x: de.x + (ate.x - de.x) * u + (semLascas[i * 3 + 1] - 0.5) * 4, y: de.y + (ate.y - de.y) * u }
    lascas.push([p.x, p.y, h, i === 6 ? 9 : em(semLascas[i * 3 + 2], 4, 6)])
  }
  for (const [cor, k, dx] of [[pele.contorno, 1.25, 0], [pele.base, 1, 0], [pele.meio, 0.5, -0.3]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const [x, y, h, w] of lascas) {
      if (h < 1) continue
      ctx.moveTo(x - w * k, y + 2); ctx.lineTo(x + dx * w + w * 0.2, y - h * k); ctx.lineTo(x + w * k * 0.8, y + 2); ctx.closePath()
    }
    ctx.fill()
  }

  // 3. Torroes e poeira por toda a fenda; o grosso embaixo do alvo.
  const torroes: Torrao[] = []
  for (let i = 0; i < 18; i++) {
    const s = semTorroes.slice(i * 4, i * 4 + 4)
    const u = i < 12 ? 1 : s[0]
    const p = { x: de.x + (ate.x - de.x) * u, y: de.y + (ate.y - de.y) * u }
    const t = torraoEm(p, CIMA + (s[1] - 0.5) * 1.5, em(s[2], 0.14, 0.3), em(s[3], 1.6, 3), ms - FENDA_ROMPE + (1 - u) * 160 - s[3] * 50, s[1], 5, 820)
    if (t) torroes.push(t)
  }
  const poeira: Bolota[] = []
  // Poucos tufos espacados: uma fileira cheia lia como um tronco deitado.
  for (let i = 0; i < 6; i++) {
    const u = 0.15 + (i / 5) * 0.85
    const p = poeiraEm({ x: de.x + (ate.x - de.x) * u, y: de.y + (ate.y - de.y) * u }, (semPoeira[i * 2] - 0.5) * 26, em(semPoeira[i * 2 + 1], 3, 5), ms - FENDA_CHEGA - u * 160, 900)
    if (p) poeira.push(p)
  }
  pintarPoeira(ctx, poeira, pele)
  pintarTorroes(ctx, torroes, pele)
  if (ms >= FENDA_ROMPE && ms < FENDA_ROMPE + 260) estrelaDeImpacto(ctx, alvo, 22, (ms - FENDA_ROMPE) / 260, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// AREA
// ---------------------------------------------------------------------------

/** Pontos do INTERIOR pela espiral de Vogel (area atinge todo mundo dentro). */
function interior(centro: Ponto, raio: number, n: number, giro: number): { p: Ponto; d: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = raio * 0.9 * Math.sqrt((i + 0.5) / n)
    return { p: noChao(centro, i * ANGULO_DOURADO + giro, d), d }
  })
}

/** Onda de poeira rasteira: anel de bolotas no chao, do raio `r` (elipse achatada). */
function ondaDePoeira(centro: Ponto, r: number, k: number, n: number, sem: readonly number[], t: number): Bolota[] {
  const out: Bolota[] = []
  if (t < 0 || t > 1 || r < 1) return out
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + sem[i % sem.length] * 0.3
    const p = noChao(centro, a, r)
    const rr = (3 + sem[(i + 3) % sem.length] * 2.5) * k * (1 - entrada(limitar((t - 0.6) / 0.4)))
    if (rr > 0) out.push({ x: p.x, y: p.y - 2 * k, r: rr })
  }
  return out
}

// A1 — BULLDOZE: pisao + uma onda de poeira do centro ate a borda.
const BULL_PISA = 120
const BULL_ONDA = 520

function bulldoze(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semOnda = sortear(rng, 12)
  const pontos = interior(centro, raio, 9, rng() * TAU)
  const semTorroes = sortear(rng, 9 * 2 * 4)
  const t = (ms - BULL_PISA) / BULL_ONDA
  const r = raio * saida(limitar(t))
  const bolotas = ondaDePoeira(centro, r, k * 0.8, 22, semOnda, t)
  // Por onde a onda passa, dois torroes pulam do chao.
  const torroes: Torrao[] = []
  pontos.forEach(({ p, d }, i) => {
    const passa = BULL_PISA + BULL_ONDA * (1 - Math.cbrt(1 - d / raio))
    for (let j = 0; j < 2; j++) {
      const s = semTorroes.slice((i * 2 + j) * 4, (i * 2 + j) * 4 + 4)
      const tt = torraoEm(p, CIMA + (s[0] - 0.5) * 1.4, em(s[1], 0.08, 0.14) * k ** 0.25, em(s[2], 1.6, 2.4) * k * 0.7, ms - passa, s[3], 3, 520)
      if (tt) torroes.push(tt)
    }
  })
  // O pisao no centro: poeira que estoura e assenta.
  const pisao = poeiraEm(pe(centro), 0, 7 * k * 0.7, ms - BULL_PISA, 600)
  if (pisao) bolotas.push(pisao)
  pintarPoeira(ctx, bolotas, pele)
  pintarTorroes(ctx, torroes, pele)
}

// A2 — EXPLOSAO ELEMENTAL (nivel 50): rachaduras pra fora + estouros no interior.
const SISMO_RACHA = 80
const SISMO_CORRE = 420

function sismo(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const angRachas = sortear(rng, 7)
  const semRachas = sortear(rng, 7 * 12)
  const pontos = interior(centro, raio, 12, rng() * TAU)
  const semTorroes = sortear(rng, 12 * 3 * 4)
  const semPoeira = sortear(rng, 12 * 2)
  const chao = pe(centro)
  const tr = limitar((ms - SISMO_RACHA) / SISMO_CORRE)
  const fecha = 1 - limitar((ms - 900) / 300)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + angRachas[i] * 0.6
    if (fecha > 0) rachadura(ctx, chao, a, raio * 0.95 * fecha, tr, semRachas.slice(i * 12, i * 12 + 12), pele, 1.6 * Math.min(k, 2))
  }
  // Cada ponto estoura quando a frente das rachaduras chega nele.
  const torroes: Torrao[] = [], poeira: Bolota[] = []
  pontos.forEach(({ p, d }, i) => {
    const chega = SISMO_RACHA + SISMO_CORRE * (d / raio)
    for (let j = 0; j < 3; j++) {
      const s = semTorroes.slice((i * 3 + j) * 4, (i * 3 + j) * 4 + 4)
      const t = torraoEm(p, CIMA + (s[0] - 0.5) * 1.2, em(s[1], 0.1, 0.2) * k ** 0.25, em(s[2], 1.5, 2.5) * k * 0.7, ms - chega - s[3] * 40, s[3], 3, 640)
      if (t) torroes.push(t)
    }
    const b = poeiraEm(p, (semPoeira[i * 2] - 0.5) * 12 * k, em(semPoeira[i * 2 + 1], 3, 4.5) * k * 0.75, ms - chega, 760)
    if (b) poeira.push(b)
  })
  pintarPoeira(ctx, poeira, pele)
  pintarTorroes(ctx, torroes, pele)
}

// A3 — EARTHQUAKE: tres ondas, rachaduras, torroes no interior todo, parede de poeira.
const QUAKE_ONDAS = [80, 420, 760] as const
const QUAKE_ONDA = 520

function earthquake(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semOndas = QUAKE_ONDAS.map(() => sortear(rng, 12))
  const angRachas = sortear(rng, 9)
  const semRachas = sortear(rng, 9 * 12)
  const pontos = interior(centro, raio, 16, rng() * TAU)
  const semTorroes = sortear(rng, 16 * 3 * 4)
  const semParede = sortear(rng, 12)
  const chao = pe(centro)

  // Rachaduras pela area inteira, abertas pela primeira onda.
  const tr = limitar((ms - QUAKE_ONDAS[0]) / 500)
  const fecha = 1 - limitar((ms - 1400) / 300)
  for (let i = 0; i < 9; i++) {
    if (fecha > 0) rachadura(ctx, chao, (i / 9) * TAU + angRachas[i] * 0.5, raio * (0.6 + angRachas[i] * 0.35) * fecha, tr, semRachas.slice(i * 12, i * 12 + 12), pele, 2 * Math.min(k, 2))
  }
  const poeira: Bolota[] = []
  QUAKE_ONDAS.forEach((t0, i) => {
    const t = (ms - t0) / QUAKE_ONDA
    poeira.push(...ondaDePoeira(centro, raio * saida(limitar(t)), k * (0.9 - i * 0.1), 24, semOndas[i], t))
  })
  // Torroes: cada ponto do interior pula em cada onda que passa.
  const torroes: Torrao[] = []
  pontos.forEach(({ p, d }, i) => {
    QUAKE_ONDAS.forEach((t0, w) => {
      const passa = t0 + QUAKE_ONDA * (1 - Math.cbrt(1 - d / raio))
      const s = semTorroes.slice((i * 3 + w) * 4, (i * 3 + w) * 4 + 4)
      const t = torraoEm(p, CIMA + (s[0] - 0.5) * 1.3, em(s[1], 0.1, 0.22) * k ** 0.25, em(s[2], 1.6, 2.8) * k * 0.7, ms - passa, s[3], 3, 600)
      if (t) torroes.push(t)
    })
  })
  // A borda levanta uma parede de poeira: o alcance.
  const tp = (ms - QUAKE_ONDAS[0] - QUAKE_ONDA) / 900
  if (tp >= 0 && tp <= 1) {
    for (let i = 0; i < 20; i++) {
      const p = noChao(centro, (i / 20) * TAU, raio * 0.97)
      const r = (4 + semParede[i % 12] * 3) * k * 0.8 * saida(limitar(tp * 3)) * (1 - entrada(limitar((tp - 0.5) / 0.5)))
      if (r > 0) poeira.push({ x: p.x, y: p.y - 4 * k - r * 0.6, r })
    }
  }
  pintarPoeira(ctx, poeira, pele)
  pintarTorroes(ctx, torroes, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DA_TERRA = {
  single: { 1: 'mud_slap', 2: 'mud_shot', 3: 'earth_power', 4: 'fissure' },
  area: { 1: 'bulldoze', 2: 'aoe50_ground', 3: 'earthquake' },
} as const

export const TERRA_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: mudSlap, duracao: { 1: 900 }, alcance: 30, impactos: { 1: SLAP_SAIDAS.map(s => s + SLAP_VOO) } },
  2: { desenhar: mudShot, duracao: { 2: 1100 }, alcance: 34, impactos: { 2: [SHOT_SAI + SHOT_VOO] } },
  3: { desenhar: earthPower, duracao: { 3: 1400 }, alcance: 70, margem: { cima: 70, baixo: 70, lados: 90 }, impactos: { 3: [POWER_EXPLODE] } },
  4: { desenhar: fissure, duracao: { 4: 1600 }, alcance: 60, margem: { cima: 60, baixo: 60, lados: 125 }, impactos: { 4: [FENDA_ROMPE] } },
}, false)

export const TERRA_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = comImpacto({
  1: { desenhar: bulldoze, duracao: { 1: 900 }, alcance: 30, impactos: { 1: [BULL_PISA + 150] } },
  2: { desenhar: sismo, duracao: { 2: 1300 }, alcance: 80, margem: { cima: 20, baixo: 20, lados: 38 }, impactos: { 2: [SISMO_RACHA + 200] } },
  3: { desenhar: earthquake, duracao: { 3: 1800 }, alcance: 100, margem: { cima: 20, baixo: 20, lados: 31 }, impactos: { 3: QUAKE_ONDAS.map(t => t + 150) } },
}, true)
