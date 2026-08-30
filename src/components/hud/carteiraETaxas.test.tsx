// @vitest-environment jsdom
// PH-279 — a carteira foi pro card do treinador e as taxas pro canto de baixo.
//
// O que este arquivo tranca sao as duas coisas que somem em SILENCIO:
//
//  1. A CARTEIRA NAO PODE DESAPARECER NO CELULAR. O card do treinador nao existe
//     em 390px (ele desce pra gaveta por falta de largura, decisao antiga), e
//     mandar a carteira pra dentro dele tirou ouro e diamante da tela inteira no
//     compacto — aconteceu de verdade, foi visto na tela e corrigido aqui.
//  2. AS TAXAS NAO PODEM APARECER NOS DOIS LUGARES. Se `TaxasNoCanto` entrar e o
//     trilho continuar mostrando as dele, o jogador le a mesma coisa duas vezes.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { StatusRail } from './StatusRail'
import { TaxasNoCanto } from './TaxasNoCanto'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore } from '@/stores/uiStore'

const MAPA = { id: 'mata_faixa1', name: 'Mata I', levelRange: [1, 30] }

function comOuro(gold: number, diamonds = 1_000_000) {
  useGameStateStore.setState({ wallet: { gold, diamonds } } as never, false)
}

describe('carteira no card e taxas no canto (PH-279)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900, footerHeight: 120 } as never, false)
    useWorldStore.setState({ sala: null, mapDef: MAPA, player: null } as never, false)
  })
  afterEach(cleanup)

  it('no amplo, o ouro aparece DENTRO do card do treinador, abreviado', () => {
    comOuro(1_002_017_245)
    render(<StatusRail />)
    const card = screen.getByLabelText('Perfil do treinador')
    // `1B`, e nao `1.002.017.245`: 13 digitos nao cabem no card sem empurrar o
    // nome do treinador pra fora.
    expect(card.textContent).toContain('1B')
    expect(card.textContent).not.toContain('1.002.017.245')
  })

  it('no compacto, a carteira continua na tela mesmo sem o card', () => {
    // O card nao e renderizado em 390px. Sem a carteira solta no trilho, o
    // jogador ficaria sem ver ouro nenhum sem abrir a gaveta.
    useUiStore.setState({ viewportWidth: 390, viewportHeight: 844 } as never, false)
    comOuro(1_002_017_245)
    render(<StatusRail />)
    expect(screen.queryByLabelText('Perfil do treinador'), 'o card aparece em 390px?').toBeNull()
    expect(document.body.textContent, 'a carteira sumiu da tela no celular').toContain('1B')
  })

  it('o trilho nao mostra mais nenhuma taxa', () => {
    render(<StatusRail />)
    expect(document.body.textContent).not.toContain('Gold/h')
  })

  it('as taxas aparecem no canto, ancoradas na altura MEDIDA do rodape', () => {
    useWorldStore.setState({ mapDef: MAPA } as never, false)
    const { container } = render(<TaxasNoCanto />)
    const canto = container.firstElementChild as HTMLElement
    // O numero vem do ResizeObserver (uiStore#footerHeight), nao de um `em`
    // fixo: a doca muda de altura com o regime e com os golpes do POKE, e um
    // valor fixo poria as taxas por cima dela.
    expect(canto.style.bottom).toContain('120px')
    expect(canto.textContent).toContain('Gold/h')
  })

  it('fora de hunt as taxas somem — no Hospital nao ha o que medir', () => {
    useWorldStore.setState({ mapDef: null } as never, false)
    const { container } = render(<TaxasNoCanto />)
    expect(container.firstElementChild).toBeNull()
  })
})
