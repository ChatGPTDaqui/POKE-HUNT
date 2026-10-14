// Cura: luz que converge e se renova, não explosão de ataque.
// Geometria determinística pelo tempo, sem RNG de combate, assets ou timers DOM.
import { orcamentoDoQuadro, type Orcamento } from './vfx/orcamento'

export interface AncoraDeCura {
  x: number
  /** Pé e altura visível, não altura vazia do spritesheet. */
  peY: number
  altura: number
  raio: number
}

const TAU = Math.PI * 2
const VIDA = { fundo: '#174f49', luz: '#66efbd', miolo: '#eaffcf', acento: '#f9e89b' }
const CENTRO = { fundo: '#77395c', luz: '#ff9bcf', miolo: '#fff1dc', acento: '#a5f9d6' }
export const DURACAO_CURA_CENTRO_MS = 1800

/** Cura aparece quando o HP entra, não como cruzes antigas no lançamento. */
export function usaPulsoDeCura(id: string | undefined, healPercent = 0): boolean {
  return healPercent > 0 || id === 'rest' || id === 'wish' || id === 'heal_pulse'
}

/** Entrada rápida, sustentação calma e saída sem flash. Nada desenha nos extremos. */
export function envelopeDeCura(fase: number): number {
  if (!Number.isFinite(fase) || fase <= 0 || fase >= 1) return 0
  const entra = Math.min(1, fase / .14)
  const sai = Math.min(1, (1 - fase) / .3)
  return entra * entra * (3 - 2 * entra) * sai * sai * (3 - 2 * sai)
}

function estrela(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, cor: string): void {
  ctx.fillStyle = cor
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r * .28, y - r * .28)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x + r * .28, y + r * .28)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r * .28, y + r * .28)
  ctx.lineTo(x - r, y)
  ctx.lineTo(x - r * .28, y - r * .28)
  ctx.closePath()
  ctx.fill()
}

/** Halo leve, dois arcos de energia e brilhos ascendentes nas bordas do corpo. */
export function desenharCura(
  ctx: CanvasRenderingContext2D, ancora: AncoraDeCura, fase: number,
  reduzido = false, centro = false, orcamento: Orcamento = orcamentoDoQuadro(),
): void {
  const alfa = envelopeDeCura(fase)
  if (!alfa) return
  const { x, peY } = ancora
  const altura = Math.max(22, Math.min(centro ? 220 : 100, ancora.altura))
  const raio = Math.max(12, Math.min(centro ? 90 : 58, ancora.raio))
  const y = peY - altura * .48
  const pele = centro ? CENTRO : VIDA
  ctx.save()
  ctx.globalAlpha *= alfa
  // A luz não apaga a arte nem usa blur/filter/screen flash.
  const luz = ctx.createRadialGradient(x, y, raio * .12, x, y, altura * .7)
  luz.addColorStop(0, `${pele.luz}25`)
  luz.addColorStop(.6, `${pele.luz}12`)
  luz.addColorStop(1, `${pele.luz}00`)
  ctx.fillStyle = luz
  ctx.fillRect(x - altura, peY - altura * 1.35, altura * 2, altura * 1.6)

  // Aros abertos: centro da sprite fica livre para reconhecer o Pokémon.
  const giro = reduzido ? .2 : fase * TAU * .7
  const abre = reduzido ? 1 : .78 + .22 * (1 - (1 - fase) ** 3)
  for (let i = 0; i < 2; i++) {
    ctx.beginPath()
    ctx.ellipse(x, peY - altura * (.18 + i * .42), raio * abre, altura * .1, -.12,
      giro + i * Math.PI, giro + i * Math.PI + Math.PI * 1.35)
    ctx.lineWidth = centro ? 4 : 1.8
    ctx.strokeStyle = pele.fundo
    ctx.stroke()
    ctx.lineWidth = centro ? 2.2 : .9
    ctx.strokeStyle = pele.luz
    ctx.stroke()
  }

  // Orçamento compartilhado com golpes: em muitos combates reduz só o enfeite.
  const quantidade = orcamento.pedir(reduzido ? 3 : centro ? 14 : 8)
  for (let i = 0; i < quantidade; i++) {
    const atraso = (i % 4) * .055
    const t = Math.max(0, Math.min(1, (fase - atraso) / (1 - atraso)))
    const vivo = reduzido ? 1 : Math.sin(Math.PI * t)
    if (vivo <= 0) continue
    const lado = i % 2 === 0 ? -1 : 1
    const ondula = reduzido ? 0 : Math.sin(t * Math.PI * 1.6 + i * 2.4) * raio * .12
    const px = x + lado * raio * (.68 + (i % 3) * .2) + ondula
    const py = reduzido ? peY - altura * (.3 + i * .2) : peY - altura * (.1 + t * .95) - (i % 3) * altura * .1
    ctx.save()
    ctx.globalAlpha *= vivo * .9
    const tamanho = (centro ? 6 : 2.8) * (.6 + vivo * .4)
    estrela(ctx, px, py, tamanho, i % 3 === 0 ? pele.acento : pele.luz)
    estrela(ctx, px, py, tamanho * .35, pele.miolo)
    ctx.restore()
  }
  // Um único sinal +, fora do rosto, em vez de cruzes cobrindo a sprite.
  ctx.globalAlpha *= .85
  const px = x + raio * .96
  const py = peY - altura * .55 - (reduzido ? 0 : fase * altura * .15)
  const u = centro ? 3.2 : 1.25
  ctx.fillStyle = pele.fundo
  ctx.fillRect(px - 1.7 * u, py - 4 * u, 3.4 * u, 8 * u)
  ctx.fillRect(px - 4 * u, py - 1.7 * u, 8 * u, 3.4 * u)
  ctx.fillStyle = pele.miolo
  ctx.fillRect(px - u, py - 3.2 * u, 2 * u, 6.4 * u)
  ctx.fillRect(px - 3.2 * u, py - u, 6.4 * u, 2 * u)
  ctx.restore()
}

/** Máquina do Centro: Poké Bolas acendem em sequência, depois um pulso de conclusão. */
export function desenharCuraNoCentro(
  ctx: CanvasRenderingContext2D, ancora: AncoraDeCura, fase: number,
  equipe: number, reduzido = false,
): void {
  const alfa = envelopeDeCura(fase)
  if (!alfa || equipe <= 0) return
  desenharCura(ctx, ancora, fase, reduzido, true)
  const quantidade = Math.min(6, Math.floor(equipe))
  ctx.save()
  ctx.globalAlpha *= alfa
  for (let i = 0; i < quantidade; i++) {
    const acesa = reduzido || fase >= .12 + i * .055
    const x = ancora.x + ((i % 3) - 1) * 30
    const y = ancora.peY - ancora.altura * .62 - Math.floor(i / 3) * 30
    ctx.beginPath()
    ctx.arc(x, y, 12, 0, TAU)
    ctx.fillStyle = '#2d2738'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 9, Math.PI, TAU)
    ctx.fillStyle = acesa ? '#ff9bcf' : '#957b8b'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 9, 0, Math.PI)
    ctx.fillStyle = acesa ? '#fff1dc' : '#bbb1b5'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x, y, 3.5, 0, TAU)
    ctx.fillStyle = acesa ? '#c7ffe4' : '#544757'
    ctx.fill()
  }
  if (fase > .48) {
    const t = (fase - .48) / .52
    ctx.globalAlpha *= 1 - t
    ctx.beginPath()
    ctx.ellipse(ancora.x, ancora.peY - ancora.altura * .4,
      ancora.raio * (reduzido ? 1.1 : 1 + t * .5), ancora.altura * .5, 0, 0, TAU)
    ctx.strokeStyle = '#fff1dc'
    ctx.lineWidth = 2.5
    ctx.stroke()
  }
  ctx.restore()
}
