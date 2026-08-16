import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'

export const fmt = new Intl.NumberFormat('pt-BR')
// Vitrine muda com o que os outros fazem, entao o cache e curto — mas nao
// zero: trocar de aba nao pode virar uma rajada de requests.
export const STALE_MS = 10000

export type Aba = 'comprar' | 'vender' | 'ativos' | 'historico'

export const ABAS: { value: Aba; label: string }[] = [
  { value: 'comprar', label: 'Comprar' },
  { value: 'vender', label: 'Vender' },
  { value: 'ativos', label: 'Anúncios Ativos' },
  { value: 'historico', label: 'Histórico' },
]

export function toast(mensagem: string, tipo: 'success' | 'error' | 'info' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'trade', undefined, erroDetalhe)
}
