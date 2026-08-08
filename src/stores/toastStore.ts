// Substitui js/core/EventBus.js + o unico evento real que ele carregava
// ('toast') + a logica de roteamento que vivia em js/ui/UIManager.js's
// eventBus.on('toast', ...) handler. So havia 1 produtor (main.js) e 1
// consumidor (UIManager) no jogo vanilla — aqui vira uma unica store Zustand
// que qualquer componente pode ler via selector.
//
// Canal 'combat' vai SO pro log (nunca vira toast flutuante); 'world'/'trade'
// aparecem como toast E ficam logados — mesma regra do ChatLog.js original
// (CHANNEL_TO_TAB: combat->log, trade->trade, world->world).
import { create } from 'zustand'

export type ToastType =
  | 'gold' | 'levelup' | 'success' | 'error' | 'capture-success' | 'capture-fail' | 'info'
export type ToastChannel = 'combat' | 'world' | 'trade'

/**
 * Abas alimentadas por ESTE store — tudo local (o jogo falando com o jogador).
 *
 * A aba "Mundo" saiu daqui: ela agora e o chat entre jogadores de verdade e
 * vive no `chatStore` (rede). O canal `world`, que antes a alimentava, passou a
 * cair em "Sistema" — pedido explicito de isolar o Chat Mundo pra so receber
 * mensagem ao vivo de outro jogador.
 */
export type LogTab = 'sistema' | 'trade' | 'log'
export type ChatTab = LogTab | 'mundo'

/**
 * Um trecho da mensagem que sai numa cor propria.
 *
 * Existe pro nome de um POKE aparecer na cor da RARIDADE dele no log (pedido
 * explicito). A mensagem continua sendo uma STRING — quem renderiza procura
 * `texto` dentro dela e pinta so aquele pedaco. A alternativa (mensagem virar
 * lista de segmentos) obrigaria a mexer nos ~30 pontos que hoje montam texto
 * com template string, e a maioria deles nunca vai precisar de cor.
 *
 * So a PRIMEIRA ocorrencia e pintada: numa frase como "X evoluiu para Y" as
 * duas especies sao POKEs diferentes e pintar as duas com a mesma cor mentiria.
 */
export interface ToastRealce {
  texto: string
  cor: string
}

export interface ToastEntry {
  id: string
  message: string
  type: ToastType
  realce?: ToastRealce
}

export interface ChatLine {
  id: string
  message: string
  type: ToastType
  realce?: ToastRealce
}

const CHANNEL_TO_TAB: Record<ToastChannel, LogTab> = {
  combat: 'log',
  trade: 'trade',
  world: 'sistema',
}

const MAX_CHAT_LINES = 60

let nextId = 1
function makeId(): string {
  return `toast-${nextId++}`
}

interface ToastState {
  toasts: ToastEntry[]
  chatLines: Record<LogTab, ChatLine[]>
  pushToast: (message: string, type: ToastType, channel: ToastChannel, realce?: ToastRealce) => void
  dismissToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  chatLines: { sistema: [], trade: [], log: [] },

  pushToast: (message, type, channel, realce) => {
    const tab = CHANNEL_TO_TAB[channel] || 'sistema'
    const line: ChatLine = { id: makeId(), message, type, realce }
    set((state) => {
      const nextTabLines = [...state.chatLines[tab], line]
      if (nextTabLines.length > MAX_CHAT_LINES) nextTabLines.shift()
      const chatLines = { ...state.chatLines, [tab]: nextTabLines }
      if (channel === 'combat') return { chatLines }
      const toastEntry: ToastEntry = { id: line.id, message, type, realce }
      return { chatLines, toasts: [...state.toasts, toastEntry] }
    })
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))
