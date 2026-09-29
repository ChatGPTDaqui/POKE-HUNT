// Teto de particulas por quadro, somado entre efeitos.
import { describe, expect, it } from 'vitest'
import { TETO_DE_PARTICULAS, iniciarQuadroDeVfx, novoOrcamento, orcamentoDoQuadro } from './orcamento'

describe('orcamento de particulas', () => {
  it('20 efeitos pesados no mesmo quadro nunca passam do teto', () => {
    const o = novoOrcamento()
    let desenhadas = 0
    for (let i = 0; i < 20; i++) desenhadas += o.pedir(60)
    expect(desenhadas).toBe(TETO_DE_PARTICULAS)
    expect(o.pedir(1)).toBe(0)
  })

  it('pedido parcial recebe o que sobra, sem numero negativo ou fracionado', () => {
    const o = novoOrcamento(10)
    expect(o.pedir(7.9)).toBe(7)
    expect(o.pedir(5)).toBe(3)
    expect(o.pedir(-4)).toBe(0)
  })

  it('o teto renova a cada quadro', () => {
    iniciarQuadroDeVfx()
    orcamentoDoQuadro().pedir(TETO_DE_PARTICULAS)
    expect(orcamentoDoQuadro().pedir(1)).toBe(0)
    iniciarQuadroDeVfx()
    expect(orcamentoDoQuadro().pedir(1)).toBe(1)
  })
})
