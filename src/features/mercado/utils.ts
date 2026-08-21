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

// "Anúncios Ativos" sozinho quebrava a fileira de abas em duas no celular, e a
// segunda fileira custa ~50px de uma tela de ~470px uteis. O rotulo curto so
// existe no compacto — no desktop a palavra inteira cabe e diz melhor o que e.
export const ABAS_CURTAS: { value: Aba; label: string }[] = ABAS.map((a) => (
  a.value === 'ativos' ? { ...a, label: 'Ativos' } : a
))

export function toast(mensagem: string, tipo: 'success' | 'error' | 'info' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'trade', undefined, erroDetalhe)
}
