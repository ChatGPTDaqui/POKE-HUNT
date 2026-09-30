// FOGO — os 7 golpes, cada um pensado individualmente.
//
// CONSTRUCAO x TEXTURA (decisao do dono, 28/09, depois de comparar tres versoes):
//
//   construcao  a do lab v2 (.claude/lab-vfx/index.html): que particulas nascem,
//               pra onde vao, em que ritmo. Mesmos numeros do v2 — raio 3,2-4,4
//               que cresce 0,55x -> 1,85x, emissor a cada 18 ms, arrasto 0,985
//               nas chamas do alvo. O v2 guardava estado; aqui cada chama e
//               CALCULADA a partir do instante em que nasceu (arrasto em forma
//               fechada) — mesmo movimento, sem estado, como o jogo exige.
//   textura     a do campo de calor (campoDeFogo.ts): as particulas somam calor,
//               um ruido rolando pra cima rasga a borda, e o calor e fatiado nas
//               4 cores. Substituiu a gota recortada do v2.
//
//   T1 Ember          tres pelotas-cometa cuspidas; cada uma acende o alvo.
//   T2 Flame Burst    bola que estoura num anel de linguas pra fora + incendio.
//   T3 Flamethrower   o jato do v2 (mesma construcao).
//   T4 Fire Blast     carga que suga linguas, bola pesada e o 大 de 5 bracos.
//   A1 Incinerate     linguas rasteiras disparando do centro pra fora.
//   A2 Heat Wave      o chao pega fogo de dentro pra fora, foco por foco.
//   A3 Eruption       coluna vulcanica + bolas-cometa que caem pela area inteira,
//                     do centro pra borda, e acendem onde pousam.
//
// Nenhuma coreografia desenha anel no chao em volta do alvo de single (vetado
// pelo dono). Em AREA e o contrario: a borda pega fogo pra mostrar o alcance
// (pedido do dono, 29/09) — ver `cercaDeFogo`.
import { pintarFogo } from '../campoDeFogo'
import { estrelaDeImpacto, entrada, limitar, riscos, saida } from '../primitivas'
import type { ContextoVfx, EntradaDeCoreografia, Pele, Ponto } from '../tipos'

const TAU = Math.PI * 2
const CIMA = -Math.PI / 2

// ---------------------------------------------------------------------------
// Particula sem estado
// ---------------------------------------------------------------------------

/** Uma particula no instante do desenho, ja com posicao calculada. */
interface Viva { x: number; y: number; r: number; f: number; ang: number; semente: number }

/** Como uma particula nasce: posicao, velocidade (unid/ms), vida, raio, arrasto por 16 ms. */
interface Nascimento { x: number; y: number; vx: number; vy: number; vida: number; r: number; arrasto?: number }

/** Deslocamento com arrasto `d` por 16 ms, em forma fechada (a soma que o v2 fazia quadro a quadro). */
function andou(v: number, idade: number, d: number): number {
  if (d >= 1) return v * idade
  return (v * 16 * (1 - d ** (idade / 16))) / -Math.log(d)
}

/**
 * Emissor sem estado: `porVez` particulas a cada `passo` ms entre `t0` e `t1`.
 * `nascer` recebe os numeros sorteados daquela particula (fixos pela semente)
 * e devolve como ela nasce. Devolve as particulas VIVAS em `ms`.
 *
 * Os sorteios sao feitos todos de uma vez, na mesma ordem, a cada quadro —
 * por isso `sem` vem pre-sorteado de fora (`quantos` x `porParticula`).
 */
function emitir(
  ms: number, t0: number, t1: number, passo: number, porVez: number,
  sem: readonly number[], porParticula: number,
  nascer: (s: readonly number[], quando: number) => Nascimento,
): Viva[] {
  const vivas: Viva[] = []
  // Um array de rascunho reaproveitado: `slice` por particula por quadro era a
  // maior fonte de lixo (picos de coleta no p95).
  const s: number[] = new Array(porParticula)
  const levas = Math.ceil((t1 - t0) / passo)
  for (let l = 0; l < levas; l++) {
    const quando = t0 + l * passo
    if (quando > ms) break
    for (let j = 0; j < porVez; j++) {
      const idx = (l * porVez + j) * porParticula
      if (idx + porParticula > sem.length) break
      for (let k = 0; k < porParticula; k++) s[k] = sem[idx + k]
      const n = nascer(s, quando)
      const idade = ms - quando
      if (idade > n.vida) continue
      const d = n.arrasto ?? 1
      vivas.push({
        x: n.x + andou(n.vx, idade, d), y: n.y + andou(n.vy, idade, d),
        r: n.r, f: idade / n.vida, ang: Math.atan2(n.vy, n.vx), semente: s[0] * 9,
      })
    }
  }
  return vivas
}

const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
const em = (u: number, a: number, b: number) => a + u * (b - a)

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

/**
 * As chamas do v2 com a TEXTURA nova: as mesmas particulas, pintadas como
 * campo de calor com ruido (campoDeFogo.ts). A construcao do golpe nao muda —
 * so a pele do fogo (decisao do dono, 28/09).
 */
function pintarChamas(ctx: CanvasRenderingContext2D, chamas: readonly Viva[], pele: Pele, ms: number): void {
  pintarFogo(ctx, chamas, pele, ms)
}

/** Fumaca do v2: bolotas em 3 tons, a luz deslocada pra cima-esquerda. */
function pintarFumaca(ctx: CanvasRenderingContext2D, bolotas: readonly Viva[], pele: Pele): void {
  const [contorno, base, meio] = pele.acento ?? [pele.contorno, pele.contorno, pele.base]
  for (const [cor, k] of [[contorno, 1.25], [base, 1], [meio, 0.5]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const p of bolotas) {
      const r = p.r * (0.5 + p.f * 1.1) * (1 - entrada(limitar((p.f - 0.7) / 0.3))) * k
      const o = k < 1 ? -r * 0.35 : 0
      if (r > 0.2) { ctx.moveTo(p.x + o + r, p.y + o); ctx.arc(p.x + o, p.y + o, r, 0, TAU) }
    }
    ctx.fill()
  }
}

/** Brasas do v2: quadradinhos que esfriam de amarelo pra laranja. */
function pintarBrasas(ctx: CanvasRenderingContext2D, brasas: readonly Viva[], pele: Pele): void {
  for (const p of brasas) {
    const r = Math.max(0.6, p.r * (1 - p.f))
    ctx.fillStyle = pele.contorno; ctx.fillRect(p.x - r - 0.6, p.y - r - 0.6, 2 * r + 1.2, 2 * r + 1.2)
    ctx.fillStyle = p.f < 0.5 ? pele.nucleo : pele.meio; ctx.fillRect(p.x - r, p.y - r, 2 * r, 2 * r)
  }
}

// ---------------------------------------------------------------------------
// Pecas do tipo
// ---------------------------------------------------------------------------

/** Quantos numeros cada peca sorteia por particula. */
const POR_CHAMA = 5

/**
 * O alvo PEGANDO FOGO — as linguas do v2 subindo do corpo, 3 a cada 55 ms,
 * mais uma brasa por leva. `k` escala tudo (AoE usa k > 1).
 */
function incendio(ms: number, alvo: Ponto, t0: number, t1: number, sem: readonly number[], k = 1): { chamas: Viva[]; brasas: Viva[] } {
  const chamas = emitir(ms, t0, t1, 55, 3, sem, POR_CHAMA, s => {
    const a = CIMA + em(s[0], -0.8, 0.8), v = em(s[1], 0.04, 0.08) * k
    return { x: alvo.x + em(s[2], -7, 7) * k, y: alvo.y + em(s[3], -2, 8) * k, vx: Math.cos(a) * v, vy: Math.sin(a) * v, arrasto: 0.985, vida: em(s[4], 260, 400), r: em(s[1], 3.4, 5) * k }
  })
  const brasas = emitir(ms, t0, t1, 55, 1, sem, POR_CHAMA, s => ({
    x: alvo.x + em(s[4], -8, 8) * k, y: alvo.y + em(s[3], -4, 4) * k, vx: em(s[0], -0.03, 0.03), vy: em(s[2], -0.07, -0.03) * k,
    arrasto: 0.99, vida: em(s[1], 400, 650), r: em(s[3], 0.6, 1) * Math.min(k, 1.6),
  }))
  return { chamas, brasas }
}

/** Fumaca do v2 no fim: uma bolota a cada 60 ms. */
function fumacaDoFim(ms: number, alvo: Ponto, t0: number, t1: number, sem: readonly number[], k = 1): Viva[] {
  return emitir(ms, t0, t1, 60, 1, sem, POR_CHAMA, s => ({
    x: alvo.x + em(s[0], -8, 8) * k, y: alvo.y + em(s[1], -2, 6) * k, vx: em(s[2], -0.01, 0.01), vy: em(s[3], -0.035, -0.02) * k,
    arrasto: 0.995, vida: em(s[4], 450, 650), r: em(s[1], 2, 3.2) * k,
  }))
}

/**
 * Bola de fogo em voo: o nucleo (3 linguas grandes apontando pra tras) e um
 * rastro de linguas pequenas soltas a cada 16 ms por onde ela passou. O rastro
 * e o que da peso — a bola "queima o ar" atras dela.
 */
function bolaDeFogo(
  ms: number, t0: number, t1: number, trajeto: (t: number) => Ponto, r: number, sem: readonly number[],
): Viva[] {
  const out: Viva[] = []
  if (ms >= t0 && ms <= t1) {
    const p = trajeto(ms), q = trajeto(Math.max(t0, ms - 16))
    const tras = Math.atan2(q.y - p.y, q.x - p.x)
    for (let i = 0; i < 3; i++) {
      out.push({ x: p.x + Math.cos(tras) * r * 0.5 * i, y: p.y + Math.sin(tras) * r * 0.5 * i, r: r * (1 - i * 0.2), f: 0.35, ang: tras + Math.PI, semente: i })
    }
  }
  const rastro = emitir(ms, t0, t1, 16, 1, sem, POR_CHAMA, (s, quando) => {
    const p = trajeto(quando)
    const a = CIMA + em(s[0], -0.6, 0.6)
    return { x: p.x + em(s[1], -1, 1), y: p.y + em(s[2], -1, 1), vx: Math.cos(a) * 0.02, vy: Math.sin(a) * 0.02, vida: em(s[3], 140, 220), r: r * em(s[4], 0.45, 0.7) }
  })
  return out.concat(rastro)
}

const boca = (c: ContextoVfx): Ponto => ({ x: c.origem.x + Math.cos(c.angulo) * 9, y: c.origem.y + Math.sin(c.angulo) * 9 - 2 })
const linha = (a: Ponto, b: Ponto, alturaDoArco = 0) => (u: number): Ponto => ({
  x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * alturaDoArco,
})
/** Carga na boca do v2: bolota em 3 tons que incha. */
function carga(ctx: CanvasRenderingContext2D, p: Ponto, k: number, raio: number, pele: Pele): void {
  for (const [cor, m] of [[pele.contorno, 1.3], [pele.meio, 1], [pele.nucleo, 0.5]] as const) {
    ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(p.x, p.y, (1.5 + raio * saida(k)) * m, 0, TAU); ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// T1 — EMBER
// ---------------------------------------------------------------------------

const EMBER_SAIDAS = [0, 90, 180] as const
const EMBER_VOO = 170

function ember(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semBolas = EMBER_SAIDAS.map(() => sortear(rng, 12 * POR_CHAMA))
  const semFogo = EMBER_SAIDAS.map(() => sortear(rng, 6 * POR_CHAMA))
  const desvios = EMBER_SAIDAS.map(() => sortear(rng, 2))
  const chamas: Viva[] = [], brasas: Viva[] = []
  EMBER_SAIDAS.forEach((sai, i) => {
    // Cada pelota mira num ponto diferente do peito — tres acertos no mesmo
    // pixel leem como um so.
    const fim = { x: alvo.x + (desvios[i][0] - 0.5) * 10, y: alvo.y + (desvios[i][1] - 0.5) * 8 }
    const trajeto = linha(b, fim, 5)
    chamas.push(...bolaDeFogo(ms, sai, sai + EMBER_VOO, t => trajeto((t - sai) / EMBER_VOO), 2.6, semBolas[i]))
    const f = incendio(ms, fim, sai + EMBER_VOO, sai + EMBER_VOO + 150, semFogo[i], 0.7)
    chamas.push(...f.chamas); brasas.push(...f.brasas)
  })
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, brasas, pele)
}

// ---------------------------------------------------------------------------
// T2 — FLAME BURST
// ---------------------------------------------------------------------------

const BURST_CHEGA = 260

function flameBurst(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semBola = sortear(rng, 14 * POR_CHAMA)
  const semAnel = sortear(rng, 12 * POR_CHAMA)
  const semFogo = sortear(rng, 18 * POR_CHAMA)
  const semFumaca = sortear(rng, 8 * POR_CHAMA)
  const semEstrela = sortear(rng, 9)

  if (ms < 90) carga(ctx, b, ms / 90, 2.5, pele)
  const trajeto = linha(b, alvo)
  const chamas = bolaDeFogo(ms, 90, BURST_CHEGA, t => trajeto((t - 90) / (BURST_CHEGA - 90)), 3.8, semBola)
  // O estouro: 12 linguas que saem de uma vez PRA FORA em anel, com arrasto
  // forte (param rapido) — a "flor" do Flame Burst.
  chamas.push(...emitir(ms, BURST_CHEGA, BURST_CHEGA + 1, 10, 12, semAnel, POR_CHAMA, (s, _q) => {
    const a = TAU * (em(s[0], 0, 1)), v = em(s[1], 0.14, 0.2)
    return { x: alvo.x, y: alvo.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, arrasto: 0.9, vida: em(s[2], 320, 440), r: em(s[3], 3.2, 4.4) }
  }))
  const f = incendio(ms, alvo, BURST_CHEGA + 60, BURST_CHEGA + 360, semFogo)
  chamas.push(...f.chamas)
  pintarFumaca(ctx, fumacaDoFim(ms, alvo, BURST_CHEGA + 380, BURST_CHEGA + 620, semFumaca), pele)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, f.brasas, pele)
  if (ms >= BURST_CHEGA && ms < BURST_CHEGA + 200) estrelaDeImpacto(ctx, alvo, 13, (ms - BURST_CHEGA) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T3 — FLAMETHROWER (o do v2, identico)
// ---------------------------------------------------------------------------

const JATO_INICIO = 160
const JATO_FIM = 620
const JATO_VEL = 0.2 // unidades/ms

/** Quando o jato alcanca o alvo — o impacto do Flamethrower depende da distancia. */
export function chegadaDoJato(origem: Ponto, alvo: Ponto): number {
  return JATO_INICIO + Math.hypot(alvo.x - origem.x, alvo.y - origem.y) / JATO_VEL
}

function flamethrower(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semJato = sortear(rng, 26 * POR_CHAMA)
  const semFogo = sortear(rng, 30 * POR_CHAMA)
  const semFumaca = sortear(rng, 8 * POR_CHAMA)
  const semEstrela = sortear(rng, 9)
  const dist = Math.hypot(alvo.x - b.x, alvo.y - b.y)
  const base = Math.atan2(alvo.y - b.y, alvo.x - b.x)
  const chegada = JATO_INICIO + dist / JATO_VEL

  if (ms < 170) carga(ctx, b, ms / 170, 3.5, pele)
  // Jato: uma lingua a cada 18 ms, velocidade 0,2, vida = tempo ate o alvo.
  const chamas = emitir(ms, JATO_INICIO, JATO_FIM, 18, 1, semJato, POR_CHAMA, s => {
    const a = base + em(s[0], -0.12, 0.12)
    return { x: b.x, y: b.y, vx: Math.cos(a) * JATO_VEL, vy: Math.sin(a) * JATO_VEL, vida: (dist / JATO_VEL) * 1.05, r: em(s[1], 3.2, 4.4) }
  })
  const f = incendio(ms, alvo, chegada, 760, semFogo)
  chamas.push(...f.chamas)
  pintarFumaca(ctx, fumacaDoFim(ms, alvo, 700, 1100, semFumaca), pele)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, f.brasas, pele)
  if (ms >= chegada && ms < chegada + 200) estrelaDeImpacto(ctx, alvo, 15, (ms - chegada) / 200, pele, fila(semEstrela))
}

// ---------------------------------------------------------------------------
// T4 — FIRE BLAST
// ---------------------------------------------------------------------------

const BLAST_CARGA = 380
const BLAST_CHEGA = 620
/** Os 5 bracos do 大 (cima, esquerda, direita, baixo-esq, baixo-dir). */
const BRACOS = [CIMA, Math.PI, 0, Math.PI * 0.72, Math.PI * 0.28] as const

function fireBlast(c: ContextoVfx): void {
  const { ctx, ms, alvo, pele, rng } = c
  const b = boca(c)
  const semSuga = sortear(rng, 20 * POR_CHAMA)
  const semBola = sortear(rng, 16 * POR_CHAMA)
  const semBracos = sortear(rng, BRACOS.length * 7 * POR_CHAMA)
  const semFogo = sortear(rng, 24 * POR_CHAMA)
  const semFumaca = sortear(rng, 12 * POR_CHAMA)
  const semEstrela = sortear(rng, 9)
  const semRiscos = sortear(rng, 30)

  // Antecipacao: linguas nascem num anel de 22 e sao SUGADAS pra boca — o
  // "respirar fundo" antes do sopro. Apontam pra dentro.
  const chamas = emitir(ms, 0, BLAST_CARGA - 80, 30, 2, semSuga, POR_CHAMA, s => {
    const a = TAU * s[0], d = 22
    return { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d * 0.8, vx: -Math.cos(a) * 0.075, vy: -Math.sin(a) * 0.075 * 0.8, vida: 280, r: em(s[1], 2, 2.8) }
  })
  if (ms < BLAST_CARGA) carga(ctx, b, ms / BLAST_CARGA, 5.5, pele)
  const trajeto = linha(b, alvo)
  chamas.push(...bolaDeFogo(ms, BLAST_CARGA, BLAST_CHEGA, t => trajeto(saida((t - BLAST_CARGA) / (BLAST_CHEGA - BLAST_CARGA))), 6, semBola))

  // O 大: cada braco solta 7 linguas de uma vez na direcao dele, com
  // velocidades escalonadas — elas se espalham pelo braco e formam o traco.
  BRACOS.forEach((a, i) => {
    const sem = semBracos.slice(i * 7 * POR_CHAMA, (i + 1) * 7 * POR_CHAMA)
    const dir = Math.atan2(Math.sin(a) * 0.85, Math.cos(a))
    chamas.push(...emitir(ms, BLAST_CHEGA + i * 20, BLAST_CHEGA + i * 20 + 1, 10, 7, sem, POR_CHAMA, s => {
      const v = em(s[0], 0.05, 0.22)
      return { x: alvo.x, y: alvo.y, vx: Math.cos(dir + em(s[1], -0.08, 0.08)) * v, vy: Math.sin(dir + em(s[1], -0.08, 0.08)) * v, arrasto: 0.95, vida: em(s[2], 460, 620), r: em(s[3], 4.4, 6) }
    }))
  })
  const f = incendio(ms, alvo, BLAST_CHEGA + 80, BLAST_CHEGA + 560, semFogo, 1.25)
  chamas.push(...f.chamas)
  pintarFumaca(ctx, fumacaDoFim(ms, alvo, BLAST_CHEGA + 420, BLAST_CHEGA + 780, semFumaca, 1.6), pele)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, f.brasas, pele)
  const e = ms - BLAST_CHEGA
  if (e >= 0 && e < 260) estrelaDeImpacto(ctx, alvo, 22, e / 260, pele, fila(semEstrela))
  if (e >= 0 && e < 400) riscos(ctx, alvo, 10, 32, e / 400, pele.nucleo, fila(semRiscos))
}

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

// ---------------------------------------------------------------------------
// AREA — escala k: o raio real e 175, fogo do tamanho do single some nele
// ---------------------------------------------------------------------------

const escalaDaArea = (raio: number) => Math.max(1, raio / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })

/**
 * CERCA DE FOGO: a borda real da area (elipse do chao, raio R) pegando fogo
 * em `n` focos igualmente espacados. A frente acende pelo lado de baixo
 * (o mais perto da camera) e corre pelos dois lados ate fechar em cima — e o
 * que mostra o ALCANCE do golpe de area (pedido do dono, 29/09). Cada foco e o
 * incendio do v2, mais baixo e curto pra borda ler como linha, nao como mancha.
 */
function cercaDeFogo(
  ms: number, centro: Ponto, R: number, t0: number, fecha: number, dura: number,
  n: number, sem: readonly number[], k: number, chamas: Viva[], brasas: Viva[],
): void {
  for (let i = 0; i < n; i++) {
    const u = i / n
    const a = Math.PI / 2 + u * TAU
    // Distancia da frente ao foco pela borda (0 embaixo, 1 em cima).
    const lado = Math.min(u, 1 - u) * 2
    const acende = t0 + lado * fecha
    const f = incendio(ms, noChao(centro, a, R * 0.97), acende, acende + dura, sem.slice(i * POR_FOCO_DA_CERCA, (i + 1) * POR_FOCO_DA_CERCA), k)
    chamas.push(...f.chamas); brasas.push(...f.brasas)
  }
}
/** 12 chamas por foco = 4 levas do incendio (3 linguas a cada 55 ms). */
const POR_FOCO_DA_CERCA = 12 * POR_CHAMA

// A1 — INCINERATE: linguas rasteiras disparando do centro pra fora
function incinerate(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const sem = sortear(rng, 40 * POR_CHAMA)
  const chao = { x: centro.x, y: centro.y + 12 }
  const semCerca = sortear(rng, 16 * POR_FOCO_DA_CERCA)
  const chamas = emitir(ms, 0, 300, 30, 4, sem, POR_CHAMA, s => {
    const a = TAU * s[0], v = em(s[1], 0.3, 0.45) * k
    return { x: chao.x, y: chao.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.45, arrasto: 0.955, vida: em(s[2], 380, 480), r: em(s[3], 3.2, 4.4) * k * 0.8 }
  })
  // As linguas rasteiras batem na borda e ela pega fogo.
  const brasas: Viva[] = []
  cercaDeFogo(ms, centro, raio, 180, 160, 260, 16, semCerca, k * 0.55, chamas, brasas)
  chamas.sort((p, q) => p.y - q.y)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, brasas, pele)
}

// A2 — HEAT WAVE: o chao pega fogo de dentro pra fora, foco por foco
const HEAT_FOCOS = 22
const HEAT_ESPALHA = 520

function heatWave(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semFocos = sortear(rng, HEAT_FOCOS * 2)
  const semFogo = Array.from({ length: HEAT_FOCOS }, () => sortear(rng, 10 * POR_CHAMA))
  const semFumaca = sortear(rng, 8 * POR_CHAMA)
  const semCerca = sortear(rng, 20 * POR_FOCO_DA_CERCA)
  // Cada foco pega fogo quando a frente invisivel chega nele: a area se
  // revela pelo fogo pegando, sem anel nenhum. O foco e o incendio do v2.
  const chamas: Viva[] = [], brasas: Viva[] = []
  for (let i = 0; i < HEAT_FOCOS; i++) {
    const a = semFocos[i * 2] * TAU, d = raio * Math.sqrt(semFocos[i * 2 + 1]) * 0.92
    const acende = (d / raio) * HEAT_ESPALHA
    const f = incendio(ms, noChao(centro, a, d), acende, acende + 330, semFogo[i], k * 0.85)
    chamas.push(...f.chamas); brasas.push(...f.brasas)
  }
  // A frente chega na borda e a borda inteira pega fogo: o alcance.
  cercaDeFogo(ms, centro, raio, HEAT_ESPALHA * 0.8, 200, 520, 20, semCerca, k * 0.6, chamas, brasas)
  chamas.sort((p, q) => p.y - q.y)
  pintarFumaca(ctx, fumacaDoFim(ms, centro, 600, 1000, semFumaca, k), pele)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, brasas, pele)
}

// A3 — ERUPTION: coluna vulcanica + bolas-cometa que caem e acendem a area
const ERUPCAO_BOLAS = 10
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))
const ERUPCAO_SUBIDA = 260
/** Quando cada bola cai — usado como `impactos` do tier. */
export const ERUPCAO_POUSOS = Array.from({ length: ERUPCAO_BOLAS }, (_, i) => 500 + i * 60)

function eruption(c: ContextoVfx): void {
  const { ctx, ms, alvo: centro, raio, pele, rng } = c
  const k = escalaDaArea(raio)
  const semColuna = sortear(rng, 40 * POR_CHAMA)
  const semAlvos = sortear(rng, ERUPCAO_BOLAS * 2)
  const semBolas = Array.from({ length: ERUPCAO_BOLAS }, () => sortear(rng, 16 * POR_CHAMA))
  const semFogo = Array.from({ length: ERUPCAO_BOLAS }, () => sortear(rng, 9 * POR_CHAMA))
  const semFumaca = sortear(rng, 12 * POR_CHAMA)
  const semCerca = sortear(rng, 20 * POR_FOCO_DA_CERCA)
  const chao = { x: centro.x, y: centro.y + 12 }
  const topo = { x: centro.x, y: centro.y - 44 * k }

  // Coluna: linguas disparadas pra cima do chao, rapidas e com arrasto — a
  // lava subindo. Formam uma coluna que se desfaz no alto.
  const chamas = emitir(ms, 0, 560, 16, 2, semColuna, POR_CHAMA, s => {
    const a = CIMA + em(s[0], -0.12, 0.12), v = em(s[1], 0.22, 0.32) * k
    return { x: chao.x + em(s[2], -3, 3) * k, y: chao.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, arrasto: 0.975, vida: em(s[3], 420, 560), r: em(s[4], 3.4, 4.6) * k }
  })
  const brasas: Viva[] = []
  for (let i = 0; i < ERUPCAO_BOLAS; i++) {
    // Espiral de Vogel: as bolas cobrem a area INTEIRA por igual e, na ordem em
    // que caem, andam do centro pra borda — quem esta dentro tambem toma (dono,
    // 30/09: antes caiam so perto da borda e o centro ficava vazio).
    const a = i * ANGULO_DOURADO + (semAlvos[i * 2] - 0.5) * 0.5
    const d = raio * 0.9 * Math.sqrt((i + 0.5 + (semAlvos[i * 2 + 1] - 0.5) * 0.6) / ERUPCAO_BOLAS)
    const pouso = noChao(centro, a, d)
    const sai = ERUPCAO_SUBIDA + i * 60, cai = ERUPCAO_POUSOS[i]
    const trajeto = linha(topo, pouso, 24 * k)
    chamas.push(...bolaDeFogo(ms, sai, cai, t => trajeto((t - sai) / (cai - sai)), 3.2 * k, semBolas[i]))
    const f = incendio(ms, { x: pouso.x, y: pouso.y - 6 }, cai, cai + 280, semFogo[i], k * 0.8)
    chamas.push(...f.chamas); brasas.push(...f.brasas)
  }
  cercaDeFogo(ms, centro, raio, ERUPCAO_POUSOS[0], 300, 600, 20, semCerca, k * 0.6, chamas, brasas)
  chamas.sort((p, q) => p.y - q.y)
  pintarFumaca(ctx, fumacaDoFim(ms, topo, 420, 1000, semFumaca, k * 1.3), pele)
  pintarChamas(ctx, chamas, pele, ms)
  pintarBrasas(ctx, brasas, pele)
}

// ---------------------------------------------------------------------------

/** Nome do golpe-vitrine de cada tier — o que o lab mostra e o que a coreografia imita. */
export const VITRINE_DO_FOGO = {
  single: { 1: 'ember', 2: 'flame_burst', 3: 'flamethrower', 4: 'fire_blast' },
  area: { 1: 'incinerate', 2: 'heat_wave', 3: 'eruption' },
} as const

export const FOGO_SINGLE: Record<1 | 2 | 3 | 4, EntradaDeCoreografia> = {
  1: { desenhar: ember, duracao: { 1: 900 }, alcance: 26, impactos: { 1: EMBER_SAIDAS.map(s => s + EMBER_VOO) } },
  2: { desenhar: flameBurst, duracao: { 2: 1150 }, alcance: 34, impactos: { 2: [BURST_CHEGA] } },
  // Impacto do jato depende da distancia; 250 ms e a chegada na distancia
  // tipica de combate (~18 unidades da boca ao peito).
  3: { desenhar: flamethrower, duracao: { 3: 1150 }, alcance: 34, impactos: { 3: [250] } },
  4: { desenhar: fireBlast, duracao: { 4: 1500 }, alcance: 50, impactos: { 4: [BLAST_CHEGA] } },
}

export const FOGO_AREA: Record<1 | 2 | 3, EntradaDeCoreografia> = {
  1: { desenhar: incinerate, duracao: { 1: 800 }, alcance: 40, impactos: { 1: [200] } },
  2: { desenhar: heatWave, duracao: { 2: 1500 }, alcance: 90, impactos: { 2: [350] } },
  3: { desenhar: eruption, duracao: { 3: 1800 }, alcance: 200, impactos: { 3: ERUPCAO_POUSOS } },
}
