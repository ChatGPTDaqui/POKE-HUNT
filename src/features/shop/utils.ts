import { useToastStore, type ToastType } from '@/stores/toastStore'

export const fmt = new Intl.NumberFormat('pt-BR')

export function toast(message: string, type: ToastType = 'success') {
  useToastStore.getState().pushToast(message, type, 'trade')
}
