// Conquistas do jogador na tela (spec 2026-10-14-conquistas-design).
//
// Quem decide o que fechou e SEMPRE o servidor: a lista chega pela resposta do
// flush (`conquistasNovas`) ou pela RPC `minhas_conquistas`. Este store so
// guarda o que veio e dispara a celebracao — nunca avalia regra nenhuma.
import { create } from 'zustand'
import { conquistasPublicas, definirTitulo, definirVitrine, lerMinhasConquistas } from '@/data/remote/conquistasRpc'
import { useAuthStore } from './authStore'
import { celebracaoStore } from './celebracaoStoreVanilla'

/** Quantas conquistas a vitrine do perfil mostra (o SQL trava no mesmo numero). */
export const TAMANHO_DA_VITRINE = 3

interface ConquistasState {
  desbloqueadas: Record<string, string>
  progresso: Record<string, number>
  /** Titulo e vitrine do PROPRIO jogador (o que os outros veem). */
  titulo: string | null
  vitrine: string[]
  carregado: boolean
  carregando: boolean
  erro: string | null
  /** Le do servidor (avaliando antes). Celebra o que fechar nesta leitura. */
  carregar: () => Promise<void>
  /** Ids que o servidor acabou de fechar (resposta do flush). */
  receberNovas: (ids: string[] | null | undefined) => void
  escolherTitulo: (id: string | null) => Promise<void>
  /** Liga/desliga uma conquista na vitrine (ate TAMANHO_DA_VITRINE). */
  alternarVitrine: (id: string) => Promise<void>
  limpar: () => void
}

export const useConquistasStore = create<ConquistasState>()((set, get) => ({
  desbloqueadas: {},
  progresso: {},
  titulo: null,
  vitrine: [],
  carregado: false,
  carregando: false,
  erro: null,

  carregar: async () => {
    if (get().carregando) return
    set({ carregando: true, erro: null })
    try {
      const uid = useAuthStore.getState().user?.id ?? null
      const [r, publicas] = await Promise.all([
        lerMinhasConquistas(),
        uid ? conquistasPublicas(uid) : Promise.resolve(null),
      ])
      set({
        desbloqueadas: r.desbloqueadas,
        progresso: r.progresso,
        titulo: publicas?.titulo ?? null,
        vitrine: publicas?.vitrine ?? [],
        carregado: true,
      })
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

  escolherTitulo: async (id) => {
    const antes = get().titulo
    set({ titulo: id })
    try {
      await definirTitulo(id)
    } catch (erro) {
      set({ titulo: antes, erro: erro instanceof Error ? erro.message : 'Não foi possível trocar o título.' })
    }
  },

  alternarVitrine: async (id) => {
    const antes = get().vitrine
    const proxima = antes.includes(id)
      ? antes.filter((x) => x !== id)
      : antes.length >= TAMANHO_DA_VITRINE ? antes : [...antes, id]
    if (proxima === antes) return
    set({ vitrine: proxima })
    try {
      await definirVitrine(proxima)
    } catch (erro) {
      set({ vitrine: antes, erro: erro instanceof Error ? erro.message : 'Não foi possível salvar a vitrine.' })
    }
  },

  limpar: () => set({ desbloqueadas: {}, progresso: {}, titulo: null, vitrine: [], carregado: false, erro: null }),
}))
