// Estado da interface: qual janela esta aberta, onde cada janela foi
// arrastada, o que esta expandido, e a preferencia de escala da HUD.
//
// Substitui js/ui/UIManager.js's `currentScreen`. Decisao #5 do plano: sem
// React Router — o jogo nunca teve URL por tela, troca de tela e 100% estado
// local, entao vira so um campo de store em vez de rota.
//
// Hospital nao esta na lista de telas: e uma cena do canvas (mapDef null), nao
// uma janela DOM. O botao dele no menu troca a cena e fecha o que estiver
// aberto.
import { create } from 'zustand'

// Nomes em portugues porque sao os mesmos rotulos que aparecem no menu — o
// handoff especifica esta uniao literalmente, e ter um `'team'` interno virando
// `'Equipe'` na tela so cria uma traducao a mais pra manter.
export type ScreenName =
  | 'equipe' | 'mochila' | 'loja' | 'hunts' | 'pokedex'
  | 'wiki' | 'config' | 'correio' | 'bestiario' | 'tasks' | 'calc' | 'mercado'

export type ChatTab = 'world' | 'trade' | 'log'

// Cada janela flutuante que pode ser arrastada tem uma chave propria: a posicao
// e por JANELA, nao por tela, senao arrastar a Loja moveria tambem o perfil.
export type WindowKey = 'panel' | 'profile' | 'offline' | 'auto' | 'chat'

export type WindowPositions = Partial<Record<WindowKey, { x: number; y: number }>>

const HUD_SCALE_KEY = 'novo-poke-idle:hud-scale'
export const HUD_SCALE_MIN = 0.8
export const HUD_SCALE_MAX = 1.4

// A escala da HUD NAO vive no gameStateStore de proposito. Aquele estado e
// propriedade do servidor de autoridade (ele responde com o objeto inteiro e o
// cliente sobrescreve o local com a resposta) — uma preferencia de video
// gravada la seria apagada no primeiro flush. Aqui e localStorage puro, por
// aparelho, que e o comportamento certo pra uma preferencia de exibicao.
function readHudScale(): number {
  try {
    const raw = localStorage.getItem(HUD_SCALE_KEY)
    const value = raw == null ? NaN : Number(raw)
    if (!Number.isFinite(value)) return 1
    return Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, value))
  } catch {
    // Safari em navegacao privada lanca no acesso ao localStorage. Preferencia
    // de escala nao vale derrubar o jogo.
    return 1
  }
}

interface UiState {
  currentScreen: ScreenName | null
  openScreen: (screen: ScreenName) => void
  toggleScreen: (screen: ScreenName) => void
  closeScreen: () => void

  moreOpen: boolean
  setMoreOpen: (open: boolean) => void

  autoOpen: boolean
  setAutoOpen: (open: boolean) => void

  chatTab: ChatTab
  chatOpen: boolean
  setChatTab: (tab: ChatTab) => void
  setChatOpen: (open: boolean) => void

  // Largura do viewport em px. Vive na store (e nao num `useState` por
  // componente) porque 8 superficies diferentes decidem posicao a partir dela:
  // um listener de resize compartilhado em vez de oito.
  viewportWidth: number

  winPos: WindowPositions
  setWinPos: (key: WindowKey, pos: { x: number; y: number }) => void
  // Chamado no resize do viewport: uma janela arrastada pro canto direito de
  // uma tela larga fica FORA da tela quando ela encolhe, e sem barra de titulo
  // visivel nao ha como trazer de volta.
  handleViewportResize: (width: number) => void

  hudScale: number
  setHudScale: (scale: number) => void

  // Filtros da tela de Hunts. Ficam aqui (e nao em useState local do
  // HuntMenu) por um motivo unico e concreto: a Pokedex precisa escrever
  // neles ANTES de abrir a tela de Hunts (o "onde encontrar" -> pula pra
  // hunt ja filtrada), exatamente o que o `focusHunt(map)` module-level de
  // js/ui/panels/HuntMenu.js fazia. Estado que dois paineis escrevem nao
  // pode viver dentro de um deles.
  huntContinent: string
  huntSearchTerm: string
  huntType: string
  setHuntContinent: (continent: string) => void
  setHuntSearchTerm: (term: string) => void
  setHuntType: (type: string) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  currentScreen: null,
  // Abrir uma janela zera a posicao arrastada dela: a proxima abertura nasce
  // centralizada, em vez de reaparecer onde uma tela anterior foi largada.
  openScreen: (currentScreen) =>
    set((s) => ({ currentScreen, moreOpen: false, winPos: { ...s.winPos, panel: undefined } })),
  toggleScreen: (screen) => {
    if (get().currentScreen === screen) set({ currentScreen: null, moreOpen: false })
    else get().openScreen(screen)
  },
  closeScreen: () => set({ currentScreen: null }),

  moreOpen: false,
  setMoreOpen: (moreOpen) => set({ moreOpen }),

  autoOpen: false,
  setAutoOpen: (autoOpen) => set({ autoOpen }),

  chatTab: 'world',
  chatOpen: true,
  setChatTab: (chatTab) => set({ chatTab }),
  setChatOpen: (chatOpen) => set({ chatOpen }),

  viewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth,

  winPos: {},
  setWinPos: (key, pos) => set((s) => ({ winPos: { ...s.winPos, [key]: pos } })),
  handleViewportResize: (viewportWidth) => set({ viewportWidth, winPos: {} }),

  hudScale: readHudScale(),
  setHudScale: (raw) => {
    const hudScale = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, raw))
    try {
      localStorage.setItem(HUD_SCALE_KEY, String(hudScale))
    } catch {
      // idem readHudScale: preferencia perdida e aceitavel, crash nao.
    }
    set({ hudScale })
  },

  huntContinent: 'johto',
  huntSearchTerm: '',
  huntType: 'all',
  setHuntContinent: (huntContinent) => set({ huntContinent }),
  setHuntSearchTerm: (huntSearchTerm) => set({ huntSearchTerm }),
  setHuntType: (huntType) => set({ huntType }),
}))

// --- breakpoints -------------------------------------------------------------
// Por LARGURA DO VIEWPORT em JS, nao media query: as decisoes nao sao so de
// estilo (o bloco central muda de ancora, o chat e o botao Auto sobem pra cima
// do menu, colunas duplas empilham) e varias delas alimentam estado — uma media
// query nao consegue, por exemplo, esconder o card de taxas E mostrar o mesmo
// dado como chip em outro lugar da arvore.
export const BP_NARROW = 640   // mobile: taxas viram chip, rotulos do menu somem
export const BP_STACK = 780    // chat/Auto sobem; colunas duplas empilham
export const BP_MID = 1140     // bloco central desce pra baixo dos cards laterais
export const BP_CHAT = 1180    // chat estreita pra nao encostar no menu central

export interface Breakpoints {
  width: number
  narrow: boolean
  colStack: boolean
  mid: boolean
  chatNarrow: boolean
}

export function useBreakpoints(): Breakpoints {
  const width = useUiStore((s) => s.viewportWidth)
  return {
    width,
    narrow: width < BP_NARROW,
    colStack: width < BP_STACK,
    mid: width < BP_MID,
    chatNarrow: width < BP_CHAT,
  }
}
