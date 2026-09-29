// Primitivas de desenho do VFX anime pixel. Unidades de MUNDO (POKE ~ 40).
//
// Todas SEM ESTADO: recebem tempo normalizado e `rng` e desenham o quadro. O
// estado de uma "particula" (onde nasceu, pra onde vai) sai do `rng` semeado,
// consumido na mesma ordem a cada quadro — ver aleatorio.ts.
//
// Vieram do laboratorio aprovado (.claude/lab-vfx), generalizadas pela pele do
// tipo: nenhuma cor escrita aqui fora `NEUTROS`.
//
// REGRA DE ESTILO QUE ESTE ARQUIVO CARREGA: toda forma tem CONTORNO escuro por
// baixo e nucleo claro por cima, em cores chapadas — sem gradiente, sem blur,
// sem `shadowBlur`. Gradiente vira faixa suja depois do encaixe de paleta.
import { NEUTROS } from './paletas'
import type { Pele, Ponto } from './tipos'

const TAU = Math.PI * 2
const [CONTORNO_NEUTRO, BRANCO] = NEUTROS

export const limitar = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
export const saida = (t: number) => 1 - (1 - t) ** 3
export const entrada = (t: number) => t * t * t
/** Passa do alvo e volta: o "pop" da estrela de impacto. */
export const recuo = (t: number) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2 }
/** 0 -> 1 -> 0 com subida rapida e descida longa. */
export const vidaCurta = (t: number, subida = 0.25) => t < subida ? saida(t / subida) : 1 - entrada((t - subida) / (1 - subida))
export const entre = (rng: () => number, a: number, b: number) => a + rng() * (b - a)

// ---------------------------------------------------------------------------
// Estrela de impacto
// ---------------------------------------------------------------------------

function caminhoDeEstrela(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, pontas: readonly number[], giro: number): void {
  const n = pontas.length
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = giro + (i / (n * 2)) * TAU
    const rr = i % 2 ? r * 0.4 : r * pontas[i >> 1]
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}

/**
 * Estrela irregular de 8 pontas que "estala" e encolhe. `t` 0..1 na vida dela.
 * Consome 9 numeros do `rng` sempre, mesmo em `r = 0`, pra nao desalinhar o que
 * vem depois na coreografia.
 */
export function estrelaDeImpacto(ctx: CanvasRenderingContext2D, p: Ponto, raio: number, t: number, pele: Pele, rng: () => number): void {
  const pontas = Array.from({ length: 8 }, () => entre(rng, 0.7, 1.15))
  const giro = rng()
  const r = raio * recuo(limitar(t * 2.4)) * (1 - entrada(limitar((t - 0.5) / 0.5)))
  if (r <= 0.5) return
  caminhoDeEstrela(ctx, p.x, p.y, r + 1.6, pontas, giro); ctx.fillStyle = CONTORNO_NEUTRO; ctx.fill()
  caminhoDeEstrela(ctx, p.x, p.y, r, pontas, giro); ctx.fillStyle = pele.estrela; ctx.fill()
  caminhoDeEstrela(ctx, p.x, p.y, r * 0.5, pontas, giro + 0.2); ctx.fillStyle = BRANCO; ctx.fill()
}

// ---------------------------------------------------------------------------
// Riscos de faisca (linhas retas que saem do impacto)
// ---------------------------------------------------------------------------

/** `n` riscos radiais; `t` 0..1. Consome 3 numeros do rng por risco. */
export function riscos(ctx: CanvasRenderingContext2D, p: Ponto, n: number, alcance: number, t: number, cor: string, rng: () => number): void {
  ctx.lineCap = 'round'
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, dist = alcance * entre(rng, 0.6, 1), comp = entre(rng, 5, 9)
    const d = dist * saida(t), L = comp * (1 - t)
    if (L <= 0.2) continue
    const ux = Math.cos(a), uy = Math.sin(a) * 0.8
    const x = p.x + ux * d, y = p.y + uy * d
    ctx.strokeStyle = CONTORNO_NEUTRO; ctx.lineWidth = 2 * (1 - t) + 0.6
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke()
    ctx.strokeStyle = cor; ctx.lineWidth = 1.1 * (1 - t) + 0.3
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * L, y - uy * L); ctx.stroke()
  }
}

// ---------------------------------------------------------------------------
// Massa em camadas (chama, fumaca, gosma, nuvem)
// ---------------------------------------------------------------------------

export interface Bolha { x: number; y: number; r: number; /** direcao da ponta (so `gota`) */ ang: number }

export function gotaPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ang: number, comp: number): void {
  const cs = Math.cos(ang), sn = Math.sin(ang), nx = -sn, ny = cs
  ctx.moveTo(x - cs * r * comp, y - sn * r * comp)
  ctx.quadraticCurveTo(x + nx * r * 1.25 - cs * r * 0.4, y + ny * r * 1.25 - sn * r * 0.4, x + cs * r, y + sn * r)
  ctx.quadraticCurveTo(x - nx * r * 1.25 - cs * r * 0.4, y - ny * r * 1.25 - sn * r * 0.4, x - cs * r * comp, y - sn * r * comp)
}

/**
 * O truque que faz 30 particulas lerem como UMA chama: pinta o contorno de
 * TODAS primeiro, depois a base de todas, depois o meio, depois o nucleo. Cada
 * camada e um unico `fill` — alem do visual, sao 4 chamadas de desenho em vez
 * de 4 por particula.
 *
 * `camadas`: quantas cores da pele usar (2..4). E um dos ingredientes do tier.
 */
export function massaEmCamadas(
  ctx: CanvasRenderingContext2D, bolhas: readonly Bolha[], pele: Pele,
  forma: 'gota' | 'circulo', camadas: 2 | 3 | 4 = 4,
): void {
  const todas: ReadonlyArray<readonly [string, number]> = [
    [pele.contorno, 1.3], [pele.base, 1], [pele.meio, 0.68], [pele.nucleo, 0.36],
  ]
  for (const [cor, k] of todas.slice(0, camadas)) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const b of bolhas) {
      const r = b.r * k
      if (r <= 0.2) continue
      // Camadas internas avancam um pouco na direcao da ponta: o nucleo fica
      // na FRENTE da chama, nao no centro geometrico — le como calor saindo.
      const off = (1 - k) * b.r * 0.4
      const x = b.x + Math.cos(b.ang) * off, y = b.y + Math.sin(b.ang) * off
      if (forma === 'gota') gotaPath(ctx, x, y, r, b.ang, 2.1)
      else { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU) }
    }
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------
// Raio (zigzag por deslocamento de ponto medio)
// ---------------------------------------------------------------------------

/** Consome 2^profundidade - 1 numeros do rng. */
export function pontosDeRaio(a: Ponto, b: Ponto, desvio: number, profundidade: number, rng: () => number): Ponto[] {
  let pts: Ponto[] = [a, b]
  let d = desvio
  for (let n = 0; n < profundidade; n++) {
    const prox: Ponto[] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i]
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1
      const o = (rng() * 2 - 1) * d
      prox.push({ x: (p.x + q.x) / 2 - ((q.y - p.y) / L) * o, y: (p.y + q.y) / 2 + ((q.x - p.x) / L) * o }, q)
    }
    pts = prox
    d *= 0.55
  }
  return pts
}

export function tracarRaio(ctx: CanvasRenderingContext2D, pts: readonly Ponto[], largura: number, pele: Pele): void {
  if (largura <= 0 || pts.length < 2) return
  const caminho = () => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)) }
  ctx.lineJoin = 'miter'; ctx.miterLimit = 3; ctx.lineCap = 'round'
  caminho(); ctx.strokeStyle = pele.contorno; ctx.lineWidth = largura * 1.6; ctx.stroke()
  caminho(); ctx.strokeStyle = pele.meio; ctx.lineWidth = largura; ctx.stroke()
  caminho(); ctx.strokeStyle = pele.nucleo; ctx.lineWidth = largura * 0.4; ctx.stroke()
}

// ---------------------------------------------------------------------------
// Crescente (talho, garra, onda de corte)
// ---------------------------------------------------------------------------

/**
 * Arco que cresce pela cabeca e se recolhe pela cauda. `p` 0..1.
 * `achatar` < 1 deita o arco no chao (camera 3/4).
 */
export function crescente(
  ctx: CanvasRenderingContext2D, c: Ponto, R: number, a0: number, a1: number,
  espessura: number, p: number, inclinacao: number, pele: Pele, achatar = 0.5,
): void {
  const cabeca = a0 + (a1 - a0) * saida(limitar(p * 1.7))
  const cauda = a0 + (a1 - a0) * entrada(limitar((p - 0.2) / 0.8))
  if (cabeca === cauda) return
  const N = 22
  const poli = (k: number, g: number) => {
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const a = cauda + ((cabeca - cauda) * i) / N
      ctx.lineTo(Math.cos(a) * (R + g), Math.sin(a) * (R + g))
    }
    for (let i = N; i >= 0; i--) {
      const a = cauda + ((cabeca - cauda) * i) / N
      const e = espessura * k * Math.sin(Math.PI * (i / N) ** 0.7)
      ctx.lineTo(Math.cos(a) * (R - e - g * 0.3), Math.sin(a) * (R - e - g * 0.3))
    }
    ctx.closePath()
  }
  ctx.save()
  ctx.translate(c.x, c.y); ctx.rotate(inclinacao); ctx.scale(1, achatar)
  poli(1.3, 1.2); ctx.fillStyle = pele.contorno; ctx.fill()
  poli(1, 0); ctx.fillStyle = pele.meio; ctx.fill()
  poli(0.5, -0.4); ctx.fillStyle = pele.nucleo; ctx.fill()
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Estilhacos (gelo, pedra, metal, vidro psiquico)
// ---------------------------------------------------------------------------

/** Losangos que voam e giram. Consome 4 numeros do rng por estilhaco. */
export function estilhacos(ctx: CanvasRenderingContext2D, p: Ponto, n: number, alcance: number, t: number, pele: Pele, rng: () => number): void {
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, dist = alcance * entre(rng, 0.5, 1), tam = entre(rng, 1.5, 3), giro = rng() * TAU
    const d = dist * saida(t), s = tam * (1 - entrada(t))
    if (s <= 0.3) continue
    const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.8 - 6 * Math.sin(Math.PI * t)
    ctx.save(); ctx.translate(x, y); ctx.rotate(giro + t * 4)
    const losango = (k: number) => { ctx.beginPath(); ctx.moveTo(0, -s * 1.6 * k); ctx.lineTo(s * k, 0); ctx.lineTo(0, s * 1.6 * k); ctx.lineTo(-s * k, 0); ctx.closePath() }
    losango(1.35); ctx.fillStyle = pele.contorno; ctx.fill()
    losango(1); ctx.fillStyle = pele.meio; ctx.fill()
    losango(0.45); ctx.fillStyle = pele.nucleo; ctx.fill()
    ctx.restore()
  }
}

// ---------------------------------------------------------------------------
// Marca de area no chao — SO para AoE
// ---------------------------------------------------------------------------

/**
 * Elipse achatada no chao que marca a AREA de um golpe AoE.
 *
 * NUNCA como enfeite de impacto em volta de um alvo unico: o dono vetou o anel
 * redondo no chao em volta do POKE no laboratorio (2026-09-28). Aqui ela existe
 * porque em area ela e informacao — mostra ate onde o golpe pega.
 */
export function marcaDeArea(ctx: CanvasRenderingContext2D, c: Ponto, raio: number, t: number, pele: Pele): void {
  const r = raio * saida(limitar(t * 1.6))
  const e = 2.4 * (1 - t)
  if (r <= 1 || e <= 0.2) return
  ctx.strokeStyle = pele.contorno; ctx.lineWidth = e + 1.2
  ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.35, 0, 0, TAU); ctx.stroke()
  ctx.strokeStyle = pele.meio; ctx.lineWidth = e
  ctx.beginPath(); ctx.ellipse(c.x, c.y, r, r * 0.35, 0, 0, TAU); ctx.stroke()
}
