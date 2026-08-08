// Qual tutorial esta aberto agora, e quais o jogador ja viu.
//
// "Ja viu" mora no localStorage, NAO no gameStateStore — pelo mesmo motivo que
// `hudScale`: aquele estado e propriedade do servidor de autoridade (ele
// responde com o objeto inteiro e o cliente sobrescreve o local), entao uma
// marca gravada la seria apagada no primeiro flush. E tambem e a semantica
// certa: "ja vi a explicacao" e por aparelho/pessoa, nao por save.
import { create } from 'zustand'
import { TUTORIAL_BOT, tutorialPorId, type Tutorial } from '@/data/tutoriais'

const CHAVE_VISTOS = 'novo-poke-idle:tutoriais-vistos'

function lerVistos(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE_VISTOS)
    if (!bruto) return new Set()
    const lista = JSON.parse(bruto)
    return Array.isArray(lista) ? new Set(lista.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    // Safari em navegacao privada lanca no acesso ao localStorage, e JSON
    // corrompido lanca no parse. Nenhum dos dois vale derrubar o jogo — no
    // pior caso o tutorial aparece de novo.
    return new Set()
  }
}

function gravarVistos(vistos: Set<string>): void {
  try {
    localStorage.setItem(CHAVE_VISTOS, JSON.stringify([...vistos]))
  } catch {
    // idem
  }
}

interface TutorialState {
  aberto: Tutorial | null
  passo: number
  vistos: Set<string>

  abrir: (id: string) => void
  fechar: () => void
  proximo: () => void
  anterior: () => void
  /** Abre o tutorial so se ele ainda nao foi visto. Usado no primeiro boot. */
  abrirSeInedito: (id: string) => void
  marcarTodosComoNaoVistos: () => void
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  aberto: null,
  passo: 0,
  vistos: lerVistos(),

  abrir: (id) => {
    const tutorial = tutorialPorId(id)
    if (!tutorial) return
    set({ aberto: tutorial, passo: 0 })
  },

  // Fechar (por qualquer caminho: X, "Entendi", clique fora) conta como visto.
  // Marcar so no fim faria o tutorial reaparecer em todo boot pra quem fechou
  // no meio — mais irritante que util.
  fechar: () => {
    const { aberto, vistos } = get()
    if (aberto) {
      const novos = new Set(vistos).add(aberto.id)
      gravarVistos(novos)
      set({ vistos: novos })
    }
    set({ aberto: null, passo: 0 })
  },

  proximo: () => {
    const { aberto, passo } = get()
    if (!aberto) return
    if (passo >= aberto.passos.length - 1) get().fechar()
    else set({ passo: passo + 1 })
  },

  anterior: () => set((s) => ({ passo: Math.max(0, s.passo - 1) })),

  abrirSeInedito: (id) => {
    if (get().vistos.has(id)) return
    get().abrir(id)
  },

  marcarTodosComoNaoVistos: () => {
    gravarVistos(new Set())
    set({ vistos: new Set() })
  },
}))

export { TUTORIAL_BOT }
