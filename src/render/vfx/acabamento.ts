// ACABAMENTO DE IMPACTO — a linguagem das referencias do dono (aprovada no
// fogo, 01/10/2026) levada aos outros tipos.
//
// O fogo ganhou, golpe a golpe, raios afinados + fagulhas em traco no instante
// em que bate. Aqui essas pecas viram comuns, e `comImpacto` as aplica em CADA
// instante de `impactos` de uma coreografia ja pronta — sem mexer nela. A forma
// e do TIPO, nunca so a cor (regra do dono, ver particulas.ts):
//
//   reto    raios afinados retos (folha, pena, golpe)
//   zigue   raios quebrados em zigue-zague (faisca)
//   coroa   coroa de respingo pra cima + gotas que caem (gota, bolha)
//   nenhum  so detritos (impacto: o normal ja tem as agulhas de impacto dele)
//
// Por cima dos raios, os detritos sao a particula-assinatura da pele
// (`emitirParticulas`) — so onde ela le pequena: folha, gota, bolha. Faisca,
// pena e cunha de golpe tem contorno escuro que, nesse tamanho, virava mancha
// escura em cima do alvo.
//
// Single: o acabamento nasce no alvo, aberto pra frente do golpe. Area: nasce
// em pontos do INTERIOR da area (espiral de Vogel), nunca so no centro — area
// atinge todo mundo dentro (regra do dono, 30/09).
//
// Determinismo: os sorteios acontecem DEPOIS da coreografia, sempre na mesma
// ordem, entao nada do que ela sorteia muda.
import { emitirParticulas } from './particulas'
import { entrada, limitar, saida } from './primitivas'
import type { ContextoVfx, EntradaDeCoreografia, ParticulaDoTipo, Pele, Ponto, Tier } from './tipos'

const em = (u: number, a: number, b: number) => a + u * (b - a)
const CIMA = -Math.PI / 2
const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))

/** Triangulo afinado de `a` (largo) ate `b` (ponta): risco, raio, fagulha. */
export function afinado(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, larg: number): void {
  const d = Math.hypot(bx - ax, by - ay)
  if (d < 0.5) return
  const nx = (-(by - ay) / d) * larg / 2, ny = ((bx - ax) / d) * larg / 2
  ctx.moveTo(ax + nx, ay + ny); ctx.lineTo(bx, by); ctx.lineTo(ax - nx, ay - ny); ctx.closePath()
}

/** Numeros por raio e por fagulha — quem sorteia usa `n * POR_RAIO` etc. */
export const POR_RAIO = 2
export const POR_FAGULHA = 2

/**
 * Raios do impacto: tracos afinados que espirram de `p` num leque em volta de
 * `dir` (`abre` rad pra cada lado; PI = circulo inteiro). A ponta sai rapido e
 * a cauda alcanca a ponta — o raio "passa" e some. `t` 0..1 em ~170 ms.
 * `zigue` quebra cada raio em tres pernas (eletrico).
 */
export function raiosDeImpacto(
  ctx: CanvasRenderingContext2D, p: Ponto, dir: number, abre: number, t: number,
  sem: readonly number[], pele: Pele, k = 1, zigue = false,
): void {
  if (t < 0 || t > 1) return
  const n = sem.length / POR_RAIO
  for (const [cor, larg] of [[pele.base, 3.2], [pele.nucleo, 1.6]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = dir + em(sem[i * 2], -abre, abre)
      const comp = em(sem[i * 2 + 1], 10, 20) * k
      const cab = comp * saida(limitar(t * 2.2)), cauda = comp * entrada(t)
      const lg = larg * Math.min(k, 1.5)
      if (!zigue) {
        afinado(ctx, p.x + Math.cos(a) * cauda, p.y + Math.sin(a) * cauda, p.x + Math.cos(a) * cab, p.y + Math.sin(a) * cab, lg)
        continue
      }
      // Tres pernas com o joelho deslocado pros lados alternados.
      const nx = -Math.sin(a), ny = Math.cos(a), lado = sem[i * 2] < 0.5 ? 1 : -1
      let px = p.x + Math.cos(a) * cauda, py = p.y + Math.sin(a) * cauda
      for (let j = 1; j <= 3; j++) {
        const d = cauda + (cab - cauda) * (j / 3)
        const off = j < 3 ? (j % 2 ? 1 : -1) * lado * comp * 0.13 : 0
        const qx = p.x + Math.cos(a) * d + nx * off, qy = p.y + Math.sin(a) * d + ny * off
        afinado(ctx, px, py, qx, qy, lg * (1.15 - j * 0.2))
        px = qx; py = qy
      }
    }
    ctx.fill()
  }
}

/** Fagulhas em traco: saem de `p` no leque, perdem velocidade e CAEM. `t` 0..1 em ~380 ms. */
export function fagulhasEmTraco(
  ctx: CanvasRenderingContext2D, p: Ponto, dir: number, abre: number, t: number,
  sem: readonly number[], pele: Pele, k = 1, peso = 1,
): void {
  if (t < 0 || t > 1) return
  const n = sem.length / POR_FAGULHA
  ctx.fillStyle = t < 0.5 ? pele.nucleo : pele.meio
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const a = dir + em(sem[i * 2], -abre, abre), d = em(sem[i * 2 + 1], 22, 36) * k * saida(t)
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d + 10 * k * peso * t * t
    const tr = 3 * (1 - t) + 0.8
    afinado(ctx, x, y, x - Math.cos(a) * tr, y - Math.sin(a) * tr + 1.5 * peso * t, 1.2)
  }
  ctx.fill()
}

/**
 * Coroa de respingo (agua, veneno): tracos GROSSOS e curtos que saltam pra
 * cima em leque e caem — o liquido nao "passa" como raio, ele espirra e pesa.
 */
function coroaDeRespingo(ctx: CanvasRenderingContext2D, p: Ponto, t: number, sem: readonly number[], pele: Pele, k: number): void {
  if (t < 0 || t > 1) return
  const n = sem.length / POR_RAIO
  for (const [cor, larg] of [[pele.base, 3.4], [pele.nucleo, 1.6]] as const) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const a = CIMA + em(sem[i * 2], -1.1, 1.1)
      const comp = em(sem[i * 2 + 1], 7, 13) * k
      const sobe = comp * saida(limitar(t * 1.8))
      // A ponta cai: gravidade puxa a coroa pra baixo na segunda metade.
      const cai = 9 * k * entrada(limitar((t - 0.35) / 0.65))
      const bx = p.x + Math.cos(a) * sobe * 0.35, by = p.y + Math.sin(a) * sobe * 0.35 + cai * 0.5
      const tx = p.x + Math.cos(a) * sobe, ty = p.y + Math.sin(a) * sobe + cai
      afinado(ctx, bx, by, tx, ty, larg * Math.min(k, 1.4) * (1 - t * 0.5))
    }
    ctx.fill()
  }
}

type Raio = 'reto' | 'zigue' | 'coroa' | 'nenhum'

/** Forma do acabamento por particula-assinatura. Tipo sem entrada aqui usa `reto`. */
const RAIO_DO_TIPO: Partial<Record<ParticulaDoTipo, Raio>> = {
  faisca: 'zigue', gota: 'coroa', bolha: 'coroa', impacto: 'nenhum',
}

/** Particulas que leem bem como detrito pequeno. */
const DETRITO_LEGIVEL: ReadonlySet<ParticulaDoTipo> = new Set(['folha', 'gota', 'bolha'])

/** Escala por tier: golpe forte espirra mais longe. */
const K_DO_TIER: Record<Tier, number> = { 1: 0.55, 2: 0.75, 3: 1, 4: 1.3 }

const N_RAIOS = 8
const N_FAGULHAS = 10
const N_DETRITOS = 5
/** Quanto o acabamento dura depois de cada impacto (ms). */
const VIDA = 450

/** Um estouro de acabamento: raios na forma do tipo, fagulhas e detritos. */
function estouro(c: ContextoVfx, p: Ponto, dir: number, abre: number, idade: number, k: number, rng: () => number): void {
  const { ctx, pele } = c
  const semRaios = Array.from({ length: N_RAIOS * POR_RAIO }, rng)
  const semFagulhas = Array.from({ length: N_FAGULHAS * POR_FAGULHA }, rng)
  const raio = RAIO_DO_TIPO[pele.particula] ?? 'reto'
  const molhado = raio === 'coroa'
  if (raio === 'coroa') coroaDeRespingo(ctx, p, idade / 220, semRaios, pele, k)
  else if (raio !== 'nenhum') raiosDeImpacto(ctx, p, dir, abre, idade / 170, semRaios, pele, k, raio === 'zigue')
  // Liquido cai mais pesado e espalha pros lados, nao pra frente.
  fagulhasEmTraco(ctx, p, molhado ? CIMA : dir, molhado ? 1.3 : abre + 0.2, idade / 380, semFagulhas, pele, k * (molhado ? 0.7 : 1), molhado ? 2.2 : 1)
  // Detritos: o tipo sem detrito legivel consome os mesmos numeros em vazio,
  // pra contagem por estouro nao depender do tipo (ver `gastar`).
  if (DETRITO_LEGIVEL.has(pele.particula)) emitirParticulas(ctx, pele, p, N_DETRITOS, 16 * k, idade / VIDA, 2.6 * Math.max(0.8, k), rng)
  else for (let i = 0; i < N_DETRITOS * 4; i++) rng()
}

/** Pontos do interior da area onde o acabamento nasce: espiral de Vogel girada a cada impacto. */
function pontosDaArea(c: ContextoVfx, i: number): Ponto[] {
  const n = 5
  return Array.from({ length: n }, (_, j) => {
    const a = (j + i * 2.3) * ANGULO_DOURADO * 3
    const d = c.raio * 0.85 * Math.sqrt((j + 0.5) / n)
    return { x: c.alvo.x + Math.cos(a) * d, y: c.alvo.y + 12 + Math.sin(a) * d * 0.45 - 8 }
  })
}

/** Desenha o acabamento dos impactos ja acontecidos e ainda vivos. */
function acabar(c: ContextoVfx, impactos: readonly number[], area: boolean): void {
  const k = K_DO_TIER[c.tier]
  // Uma fila propria, sorteada sempre por inteiro: impacto que ainda nao
  // aconteceu tambem consome, senao o primeiro mudaria quando o segundo chega.
  impactos.forEach((t0, i) => {
    const idade = c.ms - t0
    const vivo = idade >= 0 && idade <= VIDA
    if (area) {
      // Area com muitos impactos (Eruption, Thunder Storm): so o primeiro e o
      // ultimo ganham acabamento — 5 estouros por impacto a cada 60 ms
      // empilhavam dezenas vivos ao mesmo tempo.
      if (i !== 0 && i !== impactos.length - 1) return
      for (const p of pontosDaArea(c, i)) {
        if (vivo) estouro(c, p, CIMA, Math.PI, idade, k * 0.75, c.rng)
        else gastar(c.rng)
      }
    } else if (vivo) estouro(c, c.alvo, c.angulo, 1.2, idade, k, c.rng)
    else gastar(c.rng)
  })
}

/** Consome exatamente o que um `estouro` consumiria. */
function gastar(rng: () => number): void {
  for (let i = 0; i < N_RAIOS * POR_RAIO + N_FAGULHAS * POR_FAGULHA + N_DETRITOS * 4; i++) rng()
}

let ligado = true

/** Roda `fn` com o acabamento desligado — o lab usa pra mostrar o "antes". */
export function semAcabamento<T>(fn: () => T): T {
  const antes = ligado
  ligado = false
  try { return fn() } finally { ligado = antes }
}

/**
 * Embrulha as coreografias de um tipo com o acabamento de impacto. A entrada
 * continua igual (duracao, alcance, impactos); so o desenho ganha a camada.
 */
export function comImpacto<M extends Partial<Record<Tier, EntradaDeCoreografia>>>(mapa: M, area: boolean): M {
  const out: Partial<Record<Tier, EntradaDeCoreografia>> = {}
  for (const [chave, e] of Object.entries(mapa) as [string, EntradaDeCoreografia | undefined][]) {
    if (!e) continue
    out[Number(chave) as Tier] = {
      ...e,
      desenhar: c => {
        e.desenhar(c)
        if (!ligado) return
        const impactos = e.impactos?.[c.tier] ?? Object.values(e.impactos ?? {})[0] ?? []
        // POR TRAS do que a coreografia ja pintou: por cima, os raios sujavam
        // o miolo branco da estrela de impacto (lutador T3/T4). Desenhar antes
        // nao da — os sorteios do acabamento deslocariam os da coreografia.
        const modo = c.ctx.globalCompositeOperation
        c.ctx.globalCompositeOperation = 'destination-over'
        acabar(c, impactos, area)
        c.ctx.globalCompositeOperation = modo
      },
    }
  }
  return out as M
}
