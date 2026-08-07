// Port do `_showToast` de js/ui/UIManager.js — toasts flutuantes que somem
// sozinhos. A regra de "canal 'combat' vai SO pro log, nunca vira toast" ja
// vive na store (toastStore#pushToast), entao aqui e so renderizar o que
// chegou na fila.
import { useEffect } from 'react'
import { useToastStore, type ToastEntry, type ToastType } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

const TOAST_DURATION_MS = 2500

const TYPE_CLASS: Record<ToastType, string> = {
  gold: 'border-amber-500/60 text-amber-300',
  levelup: 'border-sky-500/60 text-sky-300',
  success: 'border-emerald-500/60 text-emerald-300',
  error: 'border-destructive/60 text-destructive',
  'capture-success': 'border-emerald-500/60 text-emerald-300',
  'capture-fail': 'border-orange-500/60 text-orange-300',
  info: 'border-border text-foreground',
}

export function ToastStack() {
  const toasts = useToastStore((s) => s.toasts)

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1.5">
      {toasts.map((toast) => (
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

  return (
    <div
      className={cn(
        'rounded-md border bg-background/90 px-3 py-1.5 text-xs shadow-lg backdrop-blur-sm',
        TYPE_CLASS[toast.type] ?? TYPE_CLASS.info,
      )}
    >
      {toast.message}
    </div>
  )
}
