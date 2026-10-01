// Utilitarios que toda coreografia repete (sorteio, fila, chao da area,
// pontos do interior). Os tipos feitos antes de 01/10 tem copias proprias;
// os novos importam daqui.
import { entrada, limitar, saida } from '../primitivas'
import type { Pele, Ponto } from '../tipos'

export const TAU = Math.PI * 2
export const CIMA = -Math.PI / 2
/** Angulo entre pontos consecutivos da espiral de Vogel (~137,5°). */
export const ANGULO_DOURADO = Math.PI * (3 - Math.sqrt(5))

export const sortear = (rng: () => number, n: number) => Array.from({ length: n }, rng)
/** Mapeia 0..1 pra a..b. */
export const em = (u: number, a: number, b: number) => a + u * (b - a)

/** Fila propria de uma peca que aparece so em parte do golpe (ver aleatorio.ts). */
export function fila(nums: readonly number[]): () => number {
  let i = 0
  return () => nums[i++ % nums.length]
}

/** Raio real da area e 175; fogo/peca do tamanho do single some nele. */
export const escalaDaArea = (raio: number) => Math.max(1, raio / 70)
/** Ponto no chao da area: elipse achatada da camera 3/4. */
export const noChao = (centro: Ponto, a: number, d: number): Ponto => ({ x: centro.x + Math.cos(a) * d, y: centro.y + 12 + Math.sin(a) * d * 0.45 })
/** Pe de quem esta em `p` (o peito): o chao embaixo dele. */
export const pe = (p: Ponto): Ponto => ({ x: p.x, y: p.y + 12 })

/** Pontos do INTERIOR da area pela espiral de Vogel (area atinge todo mundo dentro). */
export function interior(centro: Ponto, raio: number, n: number, giro: number): { p: Ponto; d: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = raio * 0.9 * Math.sqrt((i + 0.5) / n)
    return { p: noChao(centro, i * ANGULO_DOURADO + giro, d), d }
  })
}

/** Instante em que uma frente que sai do centro em `t0` e corre `dura` ms (desacelerando) chega a `d`. */
export const chegaEm = (t0: number, dura: number, d: number, raio: number) => t0 + dura * (1 - Math.cbrt(1 - Math.min(0.999, d / raio)))

/** Brilho de 4 pontas: `r` = meia-altura. Duas camadas (base por fora, nucleo dentro). */
export function pintarBrilhos(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number; r: number }[], pele: Pele, fora = pele.base, dentro = pele.nucleo): void {
  for (const [cor, k] of [[fora, 1.35], [dentro, 1]] as const) {
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

/** Bolas em camadas: `camadas` = [cor, fator do raio, deslocamento da luz]. Um `fill` por camada. */
export function pintarBolas(
  ctx: CanvasRenderingContext2D, bolas: readonly { x: number; y: number; r: number }[],
  camadas: readonly (readonly [string, number, number])[],
): void {
  for (const [cor, k, o] of camadas) {
    ctx.fillStyle = cor
    ctx.beginPath()
    for (const b of bolas) {
      const r = b.r * k
      if (r < 0.4) continue
      const x = b.x + o * b.r, y = b.y + o * b.r
      ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU)
    }
    ctx.fill()
  }
}

/** Some encolhendo na ultima fracao `fim` da vida (nunca por transparencia). */
export const encolhe = (t: number, fim = 0.4) => 1 - entrada(limitar((t - (1 - fim)) / fim))
/** Cresce rapido no comeco da vida. */
export const cresce = (t: number, ini = 0.25) => saida(limitar(t / ini))
