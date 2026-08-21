import { useToastStore, type ToastType } from '@/stores/toastStore'

export const fmt = new Intl.NumberFormat('pt-BR')

/**
 * Numero abreviado para rotulo que divide fileira com outros controles.
 *
 * Existe porque "Tudo * 2.999.940" (99.998 antidotos) usava 160px e empurrava o
 * nome do item pra uma terceira linha, inflando o card em 40px. O valor exato
 * continua no `title` e no rotulo do botao de confirmar, que mostra o total da
 * quantidade escolhida.
 */
export function fmtCurto(valor: number): string {
  const abs = Math.abs(valor)
  if (abs >= 1_000_000_000) return `${(valor / 1_000_000_000).toFixed(1).replace(/[.,]0$/, '')}B`
  if (abs >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace(/[.,]0$/, '')}M`
  if (abs >= 100_000) return `${Math.round(valor / 1000)}k`
  return fmt.format(valor)
}

export function toast(message: string, type: ToastType = 'success') {
  useToastStore.getState().pushToast(message, type, 'trade')
}
