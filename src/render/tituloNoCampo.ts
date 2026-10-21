// Titulo do treinador desenhado no campo, acima do nome (21/10/2026). Mesmas
// gemas do perfil (data/titulos.ts), em canvas: degrade que corre, brilho,
// ornamentos e, nas duas mais raras, particulas (faiscas no Rubi, orbita no
// Diamante). Tudo deriva do relogio — nada guarda estado entre quadros.
import { VISUAL_DA_GEMA, type Titulo } from '@/data/titulos'

export const FONTE_DO_TITULO = 'bold 7px monospace'
/** Distancia (px de mundo) entre a linha do nome e a do titulo. */
export const ALTURA_DA_LINHA_DO_TITULO = 9

export function desenharTituloNoCampo(
  ctx: CanvasRenderingContext2D, titulo: Titulo, x: number, y: number, agoraMs: number,
): void {
  const v = VISUAL_DA_GEMA[titulo.gema]
  const texto = v.ornamento ? `${v.ornamento} ${titulo.nome} ${v.ornamento}` : titulo.nome
  ctx.save()
  ctx.font = FONTE_DO_TITULO
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const largura = ctx.measureText(texto).width
  const esq = x - largura / 2

  if (v.moldura) {
    ctx.strokeStyle = 'rgba(255,255,255,.45)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(esq - 3, y - 7, largura + 6, 9, 2)
    ctx.stroke()
  }

  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#000000'
  ctx.strokeText(texto, x, y)

  if (v.brilho) {
    ctx.shadowColor = v.cor
    ctx.shadowBlur = v.brilho * (0.75 + 0.25 * Math.sin(agoraMs / 300))
  }
  if (v.degrade.length > 1) {
    // O degrade e 2x mais largo que o texto e desliza: o "reflexo" que corre.
    const periodo = titulo.gema === 'rubi' ? 2200 : 3000
    const fase = (agoraMs % periodo) / periodo
    const g = ctx.createLinearGradient(esq - largura * fase * 2, 0, esq + largura * (2 - fase * 2), 0)
    const paradas = [...v.degrade, ...v.degrade.slice(1)]
    paradas.forEach((cor, i) => g.addColorStop(i / (paradas.length - 1), cor))
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = v.cor
  }
  ctx.fillText(texto, x, y)
  ctx.shadowBlur = 0

  if (v.particulas === 'faiscas') {
    // Tres faiscas subindo do titulo, cada uma num ciclo defasado.
    for (let i = 0; i < 3; i++) {
      const t = ((agoraMs / 900) + i / 3) % 1
      const px = esq + largura * ((i * 0.37 + 0.15) % 1)
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = i % 2 ? '#ffb199' : '#ff3b5c'
      ctx.fillRect(Math.round(px), Math.round(y - 8 - t * 7), 1, 1)
    }
  } else if (v.particulas === 'orbita') {
    // Quatro estrelinhas girando numa elipse em volta do titulo.
    for (let i = 0; i < 4; i++) {
      const a = agoraMs / 1100 + (i * Math.PI) / 2
      const px = x + Math.cos(a) * (largura / 2 + 5)
      const py = y - 3 + Math.sin(a) * 6
      ctx.globalAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(a * 2))
      ctx.fillStyle = i % 2 ? '#ffd6f6' : '#e8fbff'
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1)
    }
  }
  ctx.restore()
}
