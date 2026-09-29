// Limiar de alfa por Bayer e encaixe de paleta (decisao D1).
import { describe, expect, it } from 'vitest'
import { hexParaRgb, pixelizarDados } from './pixelizador'

const PALETA = ['#d9261c', '#ffe98a', '#1a1024']

function uniforme(w: number, h: number, rgba: [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) d.set(rgba, i)
  return d
}

describe('pixelizarDados', () => {
  it('pixel transparente fica intocado', () => {
    const d = uniforme(4, 4, [10, 20, 30, 0])
    pixelizarDados(d, 4, 4, PALETA)
    expect(Array.from(d.slice(0, 4))).toEqual([10, 20, 30, 0])
  })

  it('pixel opaco sai opaco e com cor da paleta', () => {
    const d = uniforme(4, 4, [200, 50, 40, 255]) // vermelho proximo de #d9261c
    pixelizarDados(d, 4, 4, PALETA)
    for (let i = 0; i < d.length; i += 4) {
      expect(Array.from(d.slice(i, i + 3))).toEqual([...hexParaRgb('#d9261c')])
      expect(d[i + 3]).toBe(255)
    }
  })

  it('nenhuma cor fora da paleta sobrevive, mesmo a mistura da borda', () => {
    const d = new Uint8ClampedArray(16 * 16 * 4)
    for (let i = 0; i < d.length; i += 4) d.set([(i * 7) % 256, (i * 13) % 256, (i * 3) % 256, 255], i)
    pixelizarDados(d, 16, 16, PALETA)
    const permitidas = new Set(PALETA.map(h => hexParaRgb(h).join()))
    for (let i = 0; i < d.length; i += 4) expect(permitidas.has(`${d[i]},${d[i + 1]},${d[i + 2]}`)).toBe(true)
  })

  it('alfa pela metade vira dither: metade dos pixels acesa, nunca meio transparente', () => {
    const d = uniforme(8, 8, [255, 233, 138, 128])
    pixelizarDados(d, 8, 8, PALETA)
    let acesos = 0
    for (let i = 3; i < d.length; i += 4) {
      expect([0, 255]).toContain(d[i])
      if (d[i]) acesos++
    }
    expect(acesos).toBe(32)
  })

  it('o padrao do dither e ancorado no MUNDO, nao no buffer', () => {
    // O mesmo pixel de mundo tem que decidir igual quando o retangulo do
    // efeito anda — senao o pontilhado "nada" junto com o efeito.
    const a = uniforme(4, 4, [255, 233, 138, 100])
    const b = uniforme(4, 4, [255, 233, 138, 100])
    pixelizarDados(a, 4, 4, PALETA, 0, 0)
    pixelizarDados(b, 4, 4, PALETA, 1, 0) // buffer b comeca 1 unidade a direita
    for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) {
      expect(b[(y * 4 + x) * 4 + 3]).toBe(a[(y * 4 + x + 1) * 4 + 3])
    }
  })
})
