// Conquistas do jogador na tela (spec 2026-10-14-conquistas-design).
//
// Quem decide o que fechou e SEMPRE o servidor: a lista chega pela resposta do
// flush (`conquistasNovas`) ou pela RPC `minhas_conquistas`. Este store so
// guarda o que veio e dispara a celebracao — nunca avalia regra nenhuma.
import { create } from 'zustand'
import { lerMinhasConquistas } from '@/data/remote/conquistasRpc'
import { celebracaoStore } from './celebracaoStoreVanilla'

interface ConquistasState {
  desbloqueadas: Record<string, string>
  progresso: Record<string, number>
  carregado: boolean
  carregando: boolean
  erro: string | null
  /** Le do servidor (avaliando antes). Celebra o que fechar nesta leitura. */
  carregar: () => Promise<void>
  /** Ids que o servidor acabou de fechar (resposta do flush). */
  receberNovas: (ids: string[] | null | undefined) => void
  limpar: () => void
}

export const useConquistasStore = create<ConquistasState>()((set, get) => ({
  desbloqueadas: {},
  progresso: {},
  carregado: false,
  carregando: false,
  erro: null,

  carregar: async () => {
    if (get().carregando) return
    set({ carregando: true, erro: null })
    try {
      const r = await lerMinhasConquistas()
      set({ desbloqueadas: r.desbloqueadas, progresso: r.progresso, carregado: true })
      if (r.novas.length) celebracaoStore.getState().celebrar({ tipo: 'conquista', ids: r.novas })
    } catch (erro) {
      set({ erro: erro instanceof Error ? erro.message : 'Não foi possível carregar as conquistas.' })
    } finally {
      set({ carregando: false })
    }
  },

  receberNovas: (ids) => {
    const novas = (ids ?? []).filter((id) => !get().desbloqueadas[id])
    if (!novas.length) return
    const agora = new Date().toISOString()
    set((s) => ({
      desbloqueadas: { ...s.desbloqueadas, ...Object.fromEntries(novas.map((id) => [id, agora])) },
    }))
    celebracaoStore.getState().celebrar({ tipo: 'conquista', ids: novas })
  },

  limpar: () => set({ desbloqueadas: {}, progresso: {}, carregado: false, erro: null }),
}))
