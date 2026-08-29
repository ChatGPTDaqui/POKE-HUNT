// @vitest-environment jsdom
//
// PH-212: aba do chat e chat recolhido sobrevivem ao F5.
//
// POR QUE CADA CASO REIMPORTA O MODULO: `uiStore` le o `localStorage` UMA vez,
// na criacao do store (`chatTab: lerChatAba()`), e nao a cada render. Isso e o
// comportamento certo — reler a cada acesso seria I/O sincrono no caminho de
// render — mas significa que popular o `localStorage` DEPOIS do import nao
// muda nada. `vi.resetModules()` + `await import(...)` e o que simula o boot de
// verdade: storage ja populado, modulo carregando em cima dele.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CHAT_ABA_KEY = 'novo-poke-idle:chat-aba'
const CHAT_ABERTO_KEY = 'novo-poke-idle:chat-aberto'

/** Sobe o `uiStore` do zero, lendo o `localStorage` como esta agora. */
async function bootar() {
  vi.resetModules()
  const { useUiStore } = await import('./uiStore')
  return useUiStore
}

describe('o chat lembra a aba e se estava recolhido (PH-212)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('sem nada gravado, nasce em Mundo e ABERTO — quem nunca mexeu no chat nao ve mudanca', () => {
    // A guarda do "nao quebra pra quem nunca abriu o chat" do criterio de
    // aceite. `chatOpen` nasce true, entao chave ausente TEM que cair no
    // aberto — se isto virar `=== '1'` algum dia, o chat nasce recolhido pra
    // todo mundo e ninguem repara ate um jogador reclamar.
    return bootar().then((useUiStore) => {
      expect(useUiStore.getState().chatTab).toBe('mundo')
      expect(useUiStore.getState().chatOpen).toBe(true)
    })
  })

  it('trocar de aba grava, e o boot seguinte volta naquela aba', async () => {
    const primeiro = await bootar()
    primeiro.getState().setChatTab('trade')
    expect(window.localStorage.getItem(CHAT_ABA_KEY)).toBe('trade')

    const depoisDoF5 = await bootar()
    expect(depoisDoF5.getState().chatTab).toBe('trade')
  })

  it('recolher o chat grava, e o boot seguinte volta recolhido', async () => {
    const primeiro = await bootar()
    primeiro.getState().setChatOpen(false)
    expect(window.localStorage.getItem(CHAT_ABERTO_KEY)).toBe('0')

    const depoisDoF5 = await bootar()
    expect(depoisDoF5.getState().chatOpen).toBe(false)
  })

  it('reabrir depois de ter recolhido volta a nascer aberto', async () => {
    const primeiro = await bootar()
    primeiro.getState().setChatOpen(false)
    primeiro.getState().setChatOpen(true)
    expect(window.localStorage.getItem(CHAT_ABERTO_KEY)).toBe('1')

    const depoisDoF5 = await bootar()
    expect(depoisDoF5.getState().chatOpen).toBe(true)
  })

  it('aba invalida gravada na mao cai em Mundo, e nao deixa o painel sem aba ativa', async () => {
    // A chave e editavel no DevTools, e o valor volta direto pro `chatTab` que
    // decide qual aba renderiza. Sem validar contra a uniao, `'privado'` (uma
    // aba que a issue mencionava mas que nao existe) deixaria o painel sem
    // nenhuma aba marcada.
    window.localStorage.setItem(CHAT_ABA_KEY, 'privado')
    const useUiStore = await bootar()
    expect(useUiStore.getState().chatTab).toBe('mundo')
  })

  it('localStorage que LANCA (Safari privado) nao derruba o store nem o setter', async () => {
    // O jogo nao pode cair por causa de preferencia de exibicao. Todo acesso ao
    // storage no `uiStore` esta em try/catch justamente por este caso.
    const original = window.localStorage.getItem
    const originalSet = window.localStorage.setItem
    try {
      window.localStorage.getItem = () => { throw new DOMException('bloqueado') }
      window.localStorage.setItem = () => { throw new DOMException('bloqueado') }

      const useUiStore = await bootar()
      expect(useUiStore.getState().chatTab).toBe('mundo')
      expect(useUiStore.getState().chatOpen).toBe(true)

      expect(() => useUiStore.getState().setChatTab('log')).not.toThrow()
      // A troca vale na sessao mesmo sem conseguir gravar.
      expect(useUiStore.getState().chatTab).toBe('log')
      expect(() => useUiStore.getState().setChatOpen(false)).not.toThrow()
      expect(useUiStore.getState().chatOpen).toBe(false)
    } finally {
      window.localStorage.getItem = original
      window.localStorage.setItem = originalSet
    }
  })
})
