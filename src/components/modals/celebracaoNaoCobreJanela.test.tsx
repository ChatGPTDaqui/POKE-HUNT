// @vitest-environment jsdom
//
// PH-398: o cartao de celebracao NAO desenha com janela do jogo aberta.
//
// Pedido explicito do usuario. O cartao e `z-[45]` e os paineis sao 30/33 —
// entao antes ele desenhava por cima da Equipe, da Mochila, do perfil do POKE.
// Com level-up a cada poucos abates, ler qualquer tela durante a hunt virava uma
// disputa com o splash.
//
// O contrato do RELOGIO tambem esta aqui, e ele e o oposto do que parece
// intuitivo: a contagem CONTINUA correndo escondida, e o cartao e perdido. A
// alternativa (fila esperando a janela fechar) entregaria uma parede de cartoes
// de niveis que o POKE ja passou — celebracao e do momento.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { CamadaDeCelebracao } from './CamadaDeCelebracao'
import { celebracaoStore, type Celebracao } from '@/stores/celebracaoStoreVanilla'
import { DURACAO_DE_NIVEL_MS } from '@/data/marcoDaCelebracao'
import { useUiStore } from '@/stores/uiStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useTutorialStore } from '@/stores/tutorialStore'

const ZERO = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 }

/** Nivel 35 = marco, entao vira CARTAO (o caso que mais cobre a tela). */
const NIVEL_35: Celebracao = {
  tipo: 'nivel', especieId: 'charmeleon', nome: 'Charmeleon',
  nivelInicial: 34, nivel: 35, ganhos: { ...ZERO, hp: 4 }, golpesNovos: [], isShiny: false,
}

beforeEach(() => {
  vi.useFakeTimers()
  celebracaoStore.getState().limpar()
  useUiStore.setState({
    viewportWidth: 1440, viewportHeight: 900, currentScreen: null,
    perfilOpen: false, perfilPublicoAlvo: null, analyzerOpen: false,
  } as never, false)
  usePokeProfileStore.setState({ open: null })
  useTutorialStore.setState({ aberto: null } as never, false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('celebracao x janela aberta (PH-398)', () => {
  it('sem janela aberta, o cartao aparece', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    render(<CamadaDeCelebracao />)
    expect(document.body.textContent).toContain('Charmeleon')
  })

  it('tela de menu aberta esconde o cartao', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    useUiStore.setState({ currentScreen: 'team' } as never, false)
    render(<CamadaDeCelebracao />)
    expect(document.body.textContent, 'o cartao cobriu a tela de Equipe').not.toContain('Charmeleon')
  })

  it('perfil de POKE aberto esconde', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    usePokeProfileStore.setState({ open: { poke: {} as never, species: {} as never } } as never)
    render(<CamadaDeCelebracao />)
    expect(document.body.textContent).not.toContain('Charmeleon')
  })

  it('tutorial aberto esconde — e o caso em que o jogador esta LENDO', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    useTutorialStore.setState({ aberto: { id: 'bot', passos: [] } } as never, false)
    render(<CamadaDeCelebracao />)
    expect(document.body.textContent).not.toContain('Charmeleon')
  })

  it('o relogio corre escondido: o cartao e PERDIDO, nao enfileirado', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    useUiStore.setState({ currentScreen: 'bag' } as never, false)
    render(<CamadaDeCelebracao />)

    vi.advanceTimersByTime(DURACAO_DE_NIVEL_MS + 50)

    // Sem isto, fechar a Mochila depois de um minuto de farm entregaria uma
    // fila de cartoes de niveis que o POKE ja passou.
    expect(celebracaoStore.getState().fila, 'o cartao ficou esperando a janela fechar').toHaveLength(0)
  })

  it('a duracao do cartao de nivel e a de 4s, nao a antiga de marco', () => {
    celebracaoStore.getState().celebrar(NIVEL_35)
    render(<CamadaDeCelebracao />)

    // No tempo da duracao ANTIGA (1800ms) ele ainda tem que estar na tela.
    vi.advanceTimersByTime(1900)
    expect(celebracaoStore.getState().fila).toHaveLength(1)

    vi.advanceTimersByTime(DURACAO_DE_NIVEL_MS)
    expect(celebracaoStore.getState().fila).toHaveLength(0)
  })
})
