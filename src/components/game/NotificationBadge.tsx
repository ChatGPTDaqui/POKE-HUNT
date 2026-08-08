// Bolinha vermelha de "tem coisa te esperando aqui".
//
// Posicionada em `absolute` sobre o canto do botao — quem usa precisa ser
// `relative`. Fica FORA do fluxo de proposito: entrar no fluxo mudaria a largura
// do botao quando o contador aparece, e uma fileira de menus que muda de
// tamanho sozinha e pior que nao ter aviso nenhum.
//
// `aria-label` completo em vez do numero cru: um leitor de tela anunciando "3"
// solto ao lado de "correio" nao diz o que sao os tres.
import { cn } from '@/lib/utils'

export function NotificationBadge({
  count, titulo, className,
}: {
  count: number
  titulo?: string
  className?: string
}) {
  if (!(count > 0)) return null
  return (
    <span
      role="status"
      aria-label={titulo ?? `${count} pendência(s)`}
      className={cn(
        'pointer-events-none absolute -top-[.35em] -right-[.35em] z-[2] flex min-w-[1.35em]',
        'items-center justify-center rounded-full border border-background bg-bad px-[.25em]',
        'text-[.65em] leading-[1.35em] font-bold text-white tabular-nums shadow',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
