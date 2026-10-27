import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Filtro rapido de um toque: botao que liga/desliga (pedido explicito).
 *
 * `GameCheck` nao serve aqui — a caixinha some no meio de uma fileira de
 * filtros e o alvo de toque fica pequeno demais no celular. Aqui o botao
 * INTEIRO e o alvo, e o estado ligado e legivel pela cor.
 */
export function FiltroToggle({
  ativo, cor, onClick, children,
}: {
  ativo: boolean
  cor?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        'flex cursor-pointer items-center gap-[.3em] rounded-full border px-[.6em] py-[.25em] text-[.8em] transition-colors',
        ativo ? 'border-current bg-menu-wash font-medium' : 'border-menu-line text-menu-muted hover:border-menu-line',
      )}
      style={ativo && cor ? { color: cor } : undefined}
    >
      {children}
    </button>
  )
}

