// O piso do "isto e teclado" erra em silencio nas duas direcoes: baixo demais
// faz a HUD inteira pular a cada rolagem (a barra de URL do celular entra e sai
// o tempo todo), alto demais deixa o teclado cobrindo o campo de digitacao.
import { describe, expect, it } from 'vitest'
import { insetDoTeclado } from './useViewportTracking'

describe('insetDoTeclado', () => {
  it('teclado aberto devolve o quanto ele ocupa', () => {
    expect(insetDoTeclado(844, 508)).toBe(336)
    expect(insetDoTeclado(800, 480)).toBe(320)
  })

  it('barra de URL do celular NAO conta como teclado', () => {
    expect(insetDoTeclado(844, 784)).toBe(0)
    expect(insetDoTeclado(844, 725)).toBe(0)
  })

  it('nada perdido, nada devolvido', () => {
    expect(insetDoTeclado(844, 844)).toBe(0)
  })

  // O visualViewport pode ficar MAIOR que a janela durante um pinch out; um
  // valor negativo viraria uma margem que empurra a HUD pra fora da tela.
  it('nunca devolve negativo', () => {
    expect(insetDoTeclado(844, 900)).toBe(0)
  })
})
