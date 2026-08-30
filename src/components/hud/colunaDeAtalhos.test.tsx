// @vitest-environment jsdom
// PH-257 — Especialidades, Tasks e Bestiario ganharam lugar fixo na tela.
//
// Os tres viviam atras de dois toques, dentro do sheet "Mais", no mesmo lugar em
// que moram Wiki e Ajustes — telas que o jogador abre uma vez por mes. O que
// este arquivo tranca nao e a aparencia da coluna: e que ela ABRA a tela certa e
// que os tres nao voltem a existir em dois lugares ao mesmo tempo (o `Mais` soma
// badge de pendencia, e duplicata faz o jogador ler "2 pendencias" onde ha uma —
// a mesma regra que `ActionDock.test.ts` ja aplica pra barra).
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import { useUiStore } from '@/stores/uiStore'
import { ColunaDeAtalhos, TELAS_NA_COLUNA } from './ColunaDeAtalhos'

describe('coluna de atalhos do canto superior direito (PH-257)', () => {
  beforeEach(() => {
    useUiStore.setState({ currentScreen: null, trilhoHeight: 120 } as never, false)
  })
  afterEach(cleanup)

  it('mostra os tres atalhos', () => {
    render(<ColunaDeAtalhos />)
    for (const { label } of TELAS_NA_COLUNA) {
      expect(screen.getByLabelText(label), label).toBeTruthy()
    }
  })

  it('cada atalho abre a tela dele', () => {
    render(<ColunaDeAtalhos />)
    for (const { screen: tela, label } of TELAS_NA_COLUNA) {
      fireEvent.click(screen.getByLabelText(label))
      expect(useUiStore.getState().currentScreen, label).toBe(tela)
      // Segundo toque fecha, que e o `toggleScreen` de sempre — sem isto o
      // jogador precisaria do botao de fechar do painel pra voltar ao jogo.
      fireEvent.click(screen.getByLabelText(label))
      expect(useUiStore.getState().currentScreen, label).toBeNull()
    }
  })

  it('NO COMPACTO a coluna comeca abaixo do trilho, pela altura MEDIDA dele', () => {
    // O numero e do `ResizeObserver` (uiStore#trilhoHeight), nao um `em` fixo: a
    // altura do trilho muda com o regime, com o nome da especie em campo e com o
    // `hudScale`. Errar aqui poe a coluna em cima da carteira.
    //
    // PH-282: isto vale so no compacto. La o card do treinador nao existe (ele
    // desce pra gaveta) e o trilho ocupa a largura inteira, entao a coluna
    // PRECISA comecar abaixo dele.
    useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, trilhoHeight: 87 } as never, false)
    const { container } = render(<ColunaDeAtalhos />)
    const coluna = container.firstElementChild as HTMLElement
    expect(coluna.style.top).toContain('87px')
  })

  it('no amplo a coluna comeca no TOPO, e o card do treinador vem junto', () => {
    // PH-282: com o card dentro dela, a coluna ancora no canto superior direito
    // e a altura do trilho deixa de importar aqui. Era o trilho que impedia o
    // card de alcancar a borda em tela larga.
    useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900, trilhoHeight: 87 } as never, false)
    const { container } = render(<ColunaDeAtalhos />)
    const coluna = container.firstElementChild as HTMLElement
    expect(coluna.style.top).not.toContain('87px')
    expect(screen.getByLabelText('Perfil do treinador'), 'o card nao veio junto').toBeTruthy()
  })
})
