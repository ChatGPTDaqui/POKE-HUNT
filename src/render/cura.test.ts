import { describe, expect, it, vi } from 'vitest'
import { desenharCura, desenharCuraNoCentro, envelopeDeCura, usaPulsoDeCura } from './cura'
import { novoOrcamento } from './vfx/orcamento'

function canvas() {
  const formas: unknown[][] = []
  const alfas: number[] = []
  const pilha: number[] = []
  const ctx = {
    globalAlpha: .8,
    save() { pilha.push(this.globalAlpha) },
    restore() { this.globalAlpha = pilha.pop()! },
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    beginPath() {}, closePath() {},
    moveTo(...n: number[]) { formas.push(['move', ...n]) },
    lineTo(...n: number[]) { formas.push(['line', ...n]) },
    ellipse(...n: number[]) { formas.push(['ellipse', ...n]) },
    arc(...n: number[]) { formas.push(['arc', ...n]) },
    fillRect(...n: number[]) { formas.push(['rect', ...n]); alfas.push(this.globalAlpha) },
    stroke() { alfas.push(this.globalAlpha) }, fill() { alfas.push(this.globalAlpha) },
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, formas, alfas, pilha }
}
const ancora = { x: 100, peY: 100, altura: 40, raio: 18 }

describe('cura procedural', () => {
  it('aposenta cruzes de casts curativos, sem remover o ataque dos golpes de dreno ou Pain Split', () => {
    expect(usaPulsoDeCura('recover', 50)).toBe(true)
    for (const id of ['rest', 'wish', 'heal_pulse']) expect(usaPulsoDeCura(id)).toBe(true)
    for (const id of ['absorb', 'pain_split', 'tackle']) expect(usaPulsoDeCura(id)).toBe(false)
    expect(usaPulsoDeCura(undefined)).toBe(false)
  })
  it.each([0, 1, -1, 2, NaN, Infinity])('não deixa desenho residual na fase %s', fase => {
    const c = canvas()
    desenharCura(c.ctx, ancora, fase)
    desenharCuraNoCentro(c.ctx, ancora, fase, 6)
    expect(c.formas).toEqual([])
    expect(c.pilha).toEqual([])
  })
  it('tem ataque suave, sustentação e saída sem flash; restaura o alpha do chamador', () => {
    expect(envelopeDeCura(.02)).toBeLessThan(envelopeDeCura(.2))
    expect(envelopeDeCura(.97)).toBeLessThan(envelopeDeCura(.6))
    const c = canvas()
    const random = vi.spyOn(Math, 'random')
    desenharCura(c.ctx, ancora, .5)
    expect(random).not.toHaveBeenCalled()
    random.mockRestore()
    expect(c.ctx.globalAlpha).toBe(.8)
    expect(c.pilha).toEqual([])
    expect(Math.max(...c.alfas)).toBeLessThanOrEqual(.8)
    expect(c.formas.length).toBeGreaterThan(10)
  })
  it('compartilha o teto de partículas; sem saldo ainda mostra a confirmação essencial', () => {
    const orcamento = novoOrcamento(9)
    for (let i = 0; i < 30; i++) desenharCura(canvas().ctx, ancora, .4, false, false, orcamento)
    expect(orcamento.gastas()).toBe(9)
    const c = canvas()
    desenharCura(c.ctx, ancora, .4, false, false, orcamento)
    expect(c.formas.filter(f => f[0] === 'ellipse')).toHaveLength(2)
  })
  it('movimento reduzido mantém a geometria estática, variando só a opacidade', () => {
    const a = canvas(), b = canvas()
    desenharCura(a.ctx, ancora, .3, true)
    desenharCura(b.ctx, ancora, .8, true)
    expect(a.formas).toEqual(b.formas)
    expect(a.alfas).not.toEqual(b.alfas)
  })
  it('a máquina representa apenas os Pokémon presentes, com teto de seis', () => {
    for (const quantidade of [1, 3, 6, 99]) {
      const c = canvas()
      desenharCuraNoCentro(c.ctx, ancora, .4, quantidade)
      expect(c.formas.filter(f => f[0] === 'arc')).toHaveLength(Math.min(6, quantidade) * 4)
      expect(c.ctx.globalAlpha).toBe(.8)
    }
  })
})
