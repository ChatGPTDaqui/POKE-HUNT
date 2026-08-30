// @vitest-environment jsdom
// PH-302: voltar pra aba tem que FECHAR a janela de liquidacao na hora.
//
// O BURACO: `onVisibilityChange` so agia no ramo `document.hidden` (ali chamava
// `commitAgora`). Ao ficar visivel chamava `runCatchUp`, que sob autoridade sai
// na primeira linha (`if (servidorAtivo()) return`) — ou seja, voltar pra aba
// nao disparava nada. A janela aberta seguia crescendo ate o proximo tique do
// timer, e numa aba que o navegador tinha congelado esse tique so vem depois do
// descongelamento, com a janela ja bem passada de `LIMIAR_OFFLINE_SEGUNDOS`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('@/data/remote/servidor', async () => {
  const real = await vi.importActual<typeof import('@/data/remote/servidor')>('@/data/remote/servidor')
  return { ...real, servidorAtivo: () => true }
})
vi.mock('@/data/remote/autoridade', () => ({ commitAgora: vi.fn(async () => {}) }))

import { commitAgora } from '@/data/remote/autoridade'
import { useBackgroundCatchUp } from './useBackgroundCatchUp'
import { useWorldStore } from '@/stores/worldStore'
import { SALA_TRANSITION_COUNTDOWN } from '@/engine/systems/salaSystem'

function Sonda() {
  useBackgroundCatchUp()
  return null
}

function definirVisibilidade(oculta: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => (oculta ? 'hidden' : 'visible'),
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('PH-302: retorno de segundo plano', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorldStore.getState().resetWorld()
  })

  afterEach(() => {
    definirVisibilidade(false)
  })

  it('ficar visivel de novo liquida na hora, sem esperar o timer', () => {
    const tela = render(<Sonda />)
    definirVisibilidade(true)
    const naOcultacao = (commitAgora as ReturnType<typeof vi.fn>).mock.calls.length
    expect(naOcultacao).toBe(1) // o ramo que ja existia

    definirVisibilidade(false)
    expect(commitAgora).toHaveBeenCalledTimes(naOcultacao + 1)
    tela.unmount()
  })

  it('a contagem de "Entrando em nova area" nao sobrevive ao retorno', () => {
    useWorldStore.getState().update((draft) => {
      draft.salaPendente = { indice: 1, chave: 'plains', abates: 0, ciclos: 0 }
      draft.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN
    })
    const tela = render(<Sonda />)

    definirVisibilidade(true)
    // Com a aba oculta o loop local quase nao anda: a contagem fica onde estava.
    expect(useWorldStore.getState().salaCountdownRemaining).toBe(SALA_TRANSITION_COUNTDOWN)

    definirVisibilidade(false)
    // Zerada, entao o proximo tick aplica a transicao em vez de congelar o jogo
    // por minutos esperando uma animacao que ninguem viu.
    expect(useWorldStore.getState().salaCountdownRemaining).toBe(0)
    // A transicao NAO foi pulada: quem troca mapa/inimigos continua sendo
    // `aplicarTransicaoDeSala`, no gate de `stepWorld`.
    expect(useWorldStore.getState().salaPendente).not.toBeNull()
    tela.unmount()
  })

  it('sem sala pendente nao ha o que encurtar', () => {
    const tela = render(<Sonda />)
    definirVisibilidade(true)
    definirVisibilidade(false)
    expect(useWorldStore.getState().salaCountdownRemaining).toBeNull()
    tela.unmount()
  })
})
