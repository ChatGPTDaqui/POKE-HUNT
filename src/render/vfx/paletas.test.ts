// Peles de tipo: todas presentes e com a mesma estrutura de luz.
import { describe, expect, it } from 'vitest'
import { TYPE_COLORS } from '@/data/typeColors'
import { PELES, paletaDaPele } from './paletas'
import { PARTICULAS } from './particulas'
import { hexParaRgb } from './pixelizador'

const luz = (hex: string) => { const [r, g, b] = hexParaRgb(hex); return r * 0.3 + g * 0.59 + b * 0.11 }

describe('peles de tipo', () => {
  it('todo tipo com cor no jogo tem pele', () => {
    for (const tipo of Object.keys(TYPE_COLORS)) expect(PELES, tipo).toHaveProperty(tipo)
  })

  it('cada tipo tem particula-assinatura PROPRIA', () => {
    // Regra do dono: "nao faca algo padronizado e so mude de cor". Dois tipos
    // dividindo a mesma particula seriam o mesmo efeito recolorido.
    const particulas = Object.values(PELES).map(p => p.particula)
    expect(new Set(particulas).size).toBe(particulas.length)
    for (const p of particulas) expect(PARTICULAS, p).toHaveProperty(p)
  })

  it.each(Object.entries(PELES))('%s: contorno < base < nucleo em luminancia', (_tipo, pele) => {
    // A regra que segura o estilo entre tipos: borda escura por baixo, miolo
    // claro por cima. Uma pele invertida desenharia chama "ao avesso".
    expect(luz(pele.contorno)).toBeLessThan(luz(pele.base))
    expect(luz(pele.base)).toBeLessThan(luz(pele.nucleo))
  })

  it.each(Object.entries(PELES))('%s: paleta so com hex de 6 digitos, sem repetir', (_tipo, pele) => {
    const p = paletaDaPele(pele)
    for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    expect(new Set(p).size).toBe(p.length)
  })
})
