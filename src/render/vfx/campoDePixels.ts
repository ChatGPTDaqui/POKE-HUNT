// Desenho NA GRADE de pixel (piloto do metodo novo, 30/09/2026).
//
// O jeito antigo desenhava formas vetoriais (arc, polygon) e deixava o
// pixelizador converter: borda mole, cor intermediaria, forma sem intencao.
// Aqui cada pixel do mundo (1 px = 1 unidade, a grade do sprite PMD) e
// DECIDIDO: toda forma escreve um "tom" (0 = mais quente/claro, 1 = borda) e,
// no fim, o tom vira faixa de cor chapada — cel shading de pixel art. Pixel
// fora de toda forma mas encostado nela vira contorno de 1 px.
//
// As formas se fundem pelo menor tom: jato, linguas e estrela viram UMA massa
// com UM contorno, como um animador desenharia o quadro.

export interface Faixa {
  /** Tom maximo (exclusivo) desta faixa. A ultima faixa deve ir ate 1. */
  ate: number
  cor: string
}

const FORA = 9

/** Buffers reaproveitados por vaga: uma coreografia usa poucos campos por quadro. */
const vagas: Float32Array[] = []

export class CampoDePixels {
  readonly x0: number
  readonly y0: number
  readonly w: number
  readonly h: number
  private readonly tom: Float32Array

  /** Retangulo em unidades de mundo; `vaga` separa campos usados no mesmo quadro. */
  constructor(xa: number, ya: number, xb: number, yb: number, vaga = 0) {
    this.x0 = Math.floor(xa); this.y0 = Math.floor(ya)
    this.w = Math.max(1, Math.ceil(xb) - this.x0); this.h = Math.max(1, Math.ceil(yb) - this.y0)
    const n = this.w * this.h
    let b = vagas[vaga]
    if (!b || b.length < n) vagas[vaga] = b = new Float32Array(n)
    this.tom = b
    b.fill(FORA, 0, n)
  }

  /**
   * Avalia `tomEm` no CENTRO de cada pixel do retangulo e guarda o menor tom.
   * `tomEm` devolve >= 1 (ou NaN) fora da forma.
   */
  forma(xa: number, ya: number, xb: number, yb: number, tomEm: (x: number, y: number) => number): void {
    const ix0 = Math.max(0, Math.floor(xa) - this.x0), iy0 = Math.max(0, Math.floor(ya) - this.y0)
    const ix1 = Math.min(this.w, Math.ceil(xb) - this.x0), iy1 = Math.min(this.h, Math.ceil(yb) - this.y0)
    for (let iy = iy0; iy < iy1; iy++) {
      const y = this.y0 + iy + 0.5
      for (let ix = ix0; ix < ix1; ix++) {
        const t = tomEm(this.x0 + ix + 0.5, y)
        if (!(t < 1)) continue
        const i = iy * this.w + ix
        if (t < this.tom[i]) this.tom[i] = t
      }
    }
  }

  /** Bola de tom radial: `tomCentro` no meio ate 1 na borda. */
  bola(cx: number, cy: number, r: number, tomCentro = 0.2, expoente = 1.3): void {
    if (r <= 0) return
    this.forma(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
      const d = Math.hypot(x - cx, y - cy) / r
      return d < 1 ? tomCentro + (1 - tomCentro) * d ** expoente : FORA
    })
  }

  /**
   * Pinta o campo em faixas chapadas, com contorno de 1 px (vizinhanca de 4).
   * Tudo em `fillRect` de corridas horizontais, agrupado por cor: uma troca de
   * `fillStyle` por faixa, nao por pixel.
   */
  pintar(ctx: CanvasRenderingContext2D, faixas: readonly Faixa[], contorno?: string): void {
    const { w, h, tom } = this
    const corDe = (t: number): number => {
      if (!(t < 1)) return -1
      for (let k = 0; k < faixas.length; k++) if (t < faixas[k].ate) return k
      return faixas.length - 1
    }
    const corridas: number[][] = faixas.map(() => [])
    const borda: number[] = []
    for (let iy = 0; iy < h; iy++) {
      let atual = -2, inicio = 0
      const fechar = (fim: number) => {
        if (atual >= 0) corridas[atual].push(inicio, iy, fim - inicio)
        else if (atual === -1 && contorno) borda.push(inicio, iy, fim - inicio)
      }
      for (let ix = 0; ix <= w; ix++) {
        let k = -2
        if (ix < w) {
          const i = iy * w + ix
          k = corDe(tom[i])
          if (k < 0) {
            // Contorno: fora, mas encostado em algum pixel de dentro.
            const dentro = (ix > 0 && tom[i - 1] < 1) || (ix < w - 1 && tom[i + 1] < 1) ||
              (iy > 0 && tom[i - w] < 1) || (iy < h - 1 && tom[i + w] < 1)
            k = dentro ? -1 : -2
          }
        }
        if (k !== atual) { fechar(ix); atual = k; inicio = ix }
      }
    }
    const x0 = this.x0, y0 = this.y0
    const encher = (cor: string, lista: number[]) => {
      if (!lista.length) return
      ctx.fillStyle = cor
      for (let j = 0; j < lista.length; j += 3) ctx.fillRect(x0 + lista[j], y0 + lista[j + 1], lista[j + 2], 1)
    }
    if (contorno) encher(contorno, borda)
    faixas.forEach((f, k) => encher(f.cor, corridas[k]))
  }
}

/** Ruido deterministico 0..1 de um inteiro — tremida "segurada" por passo de tempo. */
export function ruido(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return s - Math.floor(s)
}
