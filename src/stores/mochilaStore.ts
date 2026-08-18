// Se a mochila JA foi carregada nesta sessao — e o unico jeito de distinguir
// "o jogador nao tem POKE guardado" de "a lista ainda nao veio".
//
// Isto mora fora de `gameStateStore` de proposito: `GameStateData` e o tipo
// COMPARTILHADO com o motor (roda igual no servidor headless), e "carreguei ou
// nao" e um fato do navegador, nao do jogo. Enfiar isso lá obrigaria o servidor
// a ter opiniao sobre um estado de UI.
//
// Ninguem deve ler `bagPokes` sem olhar `carregada` antes: uma tela que trate
// mochila vazia como "nao tem nada" mostra "Nenhum POKE" pra quem tem 5 mil, e
// pior — um caminho que GRAVE a partir de uma mochila nao carregada apaga o
// acervo. Por isso as fusoes de estado (`aplicarEstadoDoServidor`, os refetch
// cirurgicos das RPC) consultam esta chave.
import { create } from 'zustand'
import { carregarMochilaRemota } from '@/data/remote/mochilaRemota'
import { useGameStateStore } from './gameStateStore'

interface MochilaStore {
  carregada: boolean
  carregando: boolean
  erro: string | null
  /** Idempotente: chamadas concorrentes (4 telas montando juntas) viram uma. */
  carregar: () => Promise<void>
  /**
   * Marca a lista como suja SEM apagá-la da tela.
   *
   * Usada quando algo mudou a mochila por um caminho que nao sabe atualizar a
   * lista local. Manter os POKEs visiveis e proposital: apagar a lista faria a
   * tela piscar "Nenhum POKE" no meio de uma acao bem-sucedida.
   */
  invalidar: () => void
  /** So pra teste: devolve o estado inicial. */
  reiniciar: () => void
}

// Fora do store: uma promessa em voo nao e estado renderizavel, e guardá-la no
// store faria todo assinante re-renderizar quando ela troca.
let emVoo: Promise<void> | null = null

export const useMochilaStore = create<MochilaStore>((set, get) => ({
  carregada: false,
  carregando: false,
  erro: null,

  carregar: async () => {
    if (get().carregada) return
    if (emVoo) return emVoo
    set({ carregando: true, erro: null })
    emVoo = (async () => {
      try {
        const pokes = await carregarMochilaRemota()
        useGameStateStore.setState({ bagPokes: pokes })
        set({ carregada: true, carregando: false, erro: null })
      } catch (erro) {
        set({
          carregando: false,
          erro: erro instanceof Error ? erro.message : 'nao foi possivel carregar a mochila',
        })
      } finally {
        emVoo = null
      }
    })()
    return emVoo
  },

  invalidar: () => {
    emVoo = null
    set({ carregada: false })
  },

  reiniciar: () => {
    emVoo = null
    set({ carregada: false, carregando: false, erro: null })
  },
}))

/** Atalho pros caminhos que nao sao React (fusao de estado, refetch de RPC). */
export const mochilaCarregada = (): boolean => useMochilaStore.getState().carregada
