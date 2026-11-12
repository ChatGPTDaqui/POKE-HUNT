// Traços miúdos compartilhados pelas famílias de golpes de status (12/11):
// peça pequena demais pra carregar o contorno grosso de `formas.ts`.
import { ESCURO } from './formas'
import type { Ponto } from '../tipos'

type Ctx = CanvasRenderingContext2D

/** Fio fino SEM contorno. */
export function fio(ctx: Ctx, a: Ponto, b: Ponto, largura: number, cor: string): void {
  if (largura <= .2) return
  ctx.lineCap = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = largura
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
}
/** Linha quebrada sem contorno. */
export function linha(ctx: Ctx, pts: readonly Ponto[], largura: number, cor: string): void {
  if (pts.length < 2 || largura <= .2) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = largura
  ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke()
}
/** Linha quebrada com contorno escuro por baixo. */
export function traco(ctx: Ctx, pts: readonly Ponto[], largura: number, cor: string): void {
  linha(ctx, pts, largura + 2, ESCURO); linha(ctx, pts, largura, cor)
}
export function disco(ctx: Ctx, x: number, y: number, r: number, cor: string): void {
  if (r <= .3) return
  ctx.fillStyle = cor; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}
/** Disco com contorno escuro. */
export function conta(ctx: Ctx, x: number, y: number, r: number, cor: string): void {
  if (r <= .3) return
  disco(ctx, x, y, r + 1, ESCURO); disco(ctx, x, y, r, cor)
}
/** Anel elíptico (só o traço), com contorno escuro. */
export function anel(ctx: Ctx, x: number, y: number, rx: number, ry: number, largura: number, cor: string): void {
  if (rx <= .5 || ry <= .5 || largura <= .2) return
  for (const [w, c] of [[largura + 2, ESCURO], [largura, cor]] as const) {
    ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.stroke()
  }
}
/** Arco de arremesso: de `de` até `ate`, subindo `alto` no meio. */
export const arco = (de: Ponto, ate: Ponto, u: number, alto: number): Ponto =>
  ({ x: de.x + (ate.x - de.x) * u, y: de.y + (ate.y - de.y) * u - alto * 4 * u * (1 - u) })
