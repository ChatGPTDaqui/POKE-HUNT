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
export type ChatTab = 'world' | 'trade' | 'log'

export interface ToastEntry {
  id: string
  message: string
  type: ToastType
}

export interface ChatLine {
  id: string
  message: string
  type: ToastType
}

const CHANNEL_TO_TAB: Record<ToastChannel, ChatTab> = {
  combat: 'log',
  trade: 'trade',
  world: 'world',
}

const MAX_CHAT_LINES = 60

let nextId = 1
function makeId(): string {
  return `toast-${nextId++}`
}

interface ToastState {
  toasts: ToastEntry[]
  chatLines: Record<ChatTab, ChatLine[]>
  pushToast: (message: string, type: ToastType, channel: ToastChannel) => void
  dismissToast: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  chatLines: { world: [], trade: [], log: [] },

  pushToast: (message, type, channel) => {
    const tab = CHANNEL_TO_TAB[channel] || 'world'
    const line: ChatLine = { id: makeId(), message, type }
    set((state) => {
      const nextTabLines = [...state.chatLines[tab], line]
      if (nextTabLines.length > MAX_CHAT_LINES) nextTabLines.shift()
      const chatLines = { ...state.chatLines, [tab]: nextTabLines }
      if (channel === 'combat') return { chatLines }
      const toastEntry: ToastEntry = { id: line.id, message, type }
      return { chatLines, toasts: [...state.toasts, toastEntry] }
    })
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))
