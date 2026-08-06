// Substitui o `showConfirmModal({...}, onConfirm)` global de
// js/ui/panels/confirmModal.js. Mesmo padrao do pokeProfileStore: o dialogo e
// um componente montado uma vez na arvore, e qualquer tela que precise
// confirmar algo destrutivo (venda de shiny na Loja, reset de jogo no
// Config...) so escreve o pedido aqui.
import { create } from 'zustand'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
}

interface ConfirmDialogState {
  request: ConfirmRequest | null
  confirm: (request: ConfirmRequest) => void
  close: () => void
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set) => ({
  request: null,
  confirm: (request) => set({ request }),
  close: () => set({ request: null }),
}))
