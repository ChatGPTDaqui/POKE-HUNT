// Toasts flutuantes que somem sozinhos, empilhados sob o topo da tela. A regra
// de "canal 'combat' vai SO pro log, nunca vira toast" ja vive na store
// (toastStore#pushToast) — aqui e so renderizar a fila.
//
// `pointer-events: none` na pilha inteira: um toast que aparece bem no meio da
// tela nao pode roubar um clique do jogador.
import { useEffect } from 'react'
import { useToastStore, type ToastEntry, type ToastType } from '@/stores/toastStore'
import { useDeviceMode } from '@/stores/uiStore'
import { TextoComRealce } from '@/components/shared/TextoComRealce'

const TOAST_DURATION_MS = 2500

const TYPE_COLOR: Record<ToastType, string> = {
  gold: 'var(--color-gold)',
  levelup: '#7dd3fc',
  success: 'var(--color-ok)',
  error: 'var(--color-bad)',
  'capture-success': 'var(--color-ok)',
  'capture-fail': 'var(--color-warn)',
  info: 'var(--color-n300)',
}

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts)
  const { compacto } = useDeviceMode()

  // No celular so ERRO vira toast. Todo toast tambem vira linha de chat
  // (`pushToast` escreve nos dois), e no compacto essa linha ja esta na tela o
  // tempo todo, no ticker acima da doca — o toast era a MESMA frase, uma
  // segunda vez, cobrindo o campo de batalha. Erro fica porque significa que
  // uma acao do jogador falhou: isso precisa interromper, nao esperar ele
  // olhar pro ticker.
  const visiveis = compacto ? toasts.filter((t) => t.type === 'error') : toasts

  return (
    <div className="pointer-events-none absolute top-[7.5em] left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-[.4em]">
      {visiveis.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function Toast({ toast }: { toast: ToastEntry }) {
  const dismissToast = useToastStore((s) => s.dismissToast)

  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), TOAST_DURATION_MS)
    return () => clearTimeout(id)
  }, [toast.id, dismissToast])

  const color = TYPE_COLOR[toast.type] ?? TYPE_COLOR.info
  return (
    <div
      className="rounded-lg border bg-background/92 px-[.65em] py-[.5em] text-[.8em] shadow-lg backdrop-blur-sm"
      style={{ borderColor: color, color, animation: 'hud-toast-in .18s ease-out' }}
    >
      <TextoComRealce texto={toast.message} realce={toast.realce} />
    </div>
  )
}
