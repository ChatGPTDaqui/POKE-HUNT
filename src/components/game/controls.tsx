// Controles da HUD, dimensionados em `em`.
//
// Por que nao usar os componentes do shadcn aqui: eles sao dimensionados em
// `rem` (`h-8`, `text-sm`, `px-3`), ou seja, ancorados no font-size da RAIZ do
// documento. O contrato de layout desta interface e o oposto — tudo escala com
// o `font-size` fluido da `.hud-root` e com a preferencia `hudScale` do
// jogador. Um botao em `rem` no meio de um card em `em` para de acompanhar
// assim que a tela muda de tamanho, e o resultado e um controle que estoura o
// proprio card (aconteceu de verdade no prototipo, com o input de % do
// auto-pot). Os primitivos do shadcn continuam em uso nas telas FORA do jogo
// (login/cadastro/home), onde nao ha escala fluida.
import { useId } from 'react'
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes,
} from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // "primary" e a pilula clara de estado ativo do tema black — conteudo escuro
  // sobre fundo claro, o unico acento forte da interface.
  primary: 'bg-primary text-primary-foreground border-primary hover:bg-n200',
  secondary: 'bg-n900 text-n200 border-n700 hover:border-n500 hover:bg-n800',
  ghost: 'bg-transparent text-n300 border-transparent hover:bg-n800 hover:text-foreground',
  danger: 'bg-transparent text-bad border-bad hover:bg-bad/12',
  accent: 'bg-transparent text-gold border-gold hover:bg-gold/12',
}

export interface GameButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  block?: boolean
}

export function GameButton({ variant = 'secondary', block, className, ...props }: GameButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-[.35em] rounded-[.5em] border',
        'px-[.7em] py-[.32em] font-[inherit] text-[.85em] leading-[1.35] whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_VARIANT[variant],
        block && 'w-full',
        className,
      )}
    />
  )
}

/** Botao quadrado so-de-icone (fechar, +/-, cadeado). */
export function GameIconButton({ className, ...props }: GameButtonProps) {
  return (
    <GameButton
      {...props}
      className={cn('h-[1.9em] w-[1.9em] shrink-0 px-0 py-0 text-[1em]', className)}
    />
  )
}

export function GameInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  // Nome automatico quando o call site nao passa um: sem `name`/`id` o Chrome
  // emite "A form field element has neither an id nor a name attribute" por
  // instancia (a auditoria contou 208, quase todas de busca/qtd/filtro em
  // listas). O fallback vem DEPOIS do spread pra sempre vencer, e ainda respeita
  // um `name`/`id` explicito quando existe.
  const autoId = useId()
  return (
    <input
      {...props}
      name={props.name ?? props.id ?? autoId}
      className={cn(
        'min-w-0 rounded-[.45em] border border-n700 bg-n900 px-[.55em] py-[.32em]',
        'font-[inherit] text-[.85em] text-foreground placeholder:text-n500',
        'focus-visible:border-n500 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    />
  )
}

export function GameSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const autoId = useId()
  return (
    <select
      {...props}
      name={props.name ?? props.id ?? autoId}
      className={cn(
        'min-w-0 cursor-pointer rounded-[.45em] border border-n700 bg-n900 px-[.4em] py-[.32em]',
        'font-[inherit] text-[.85em] text-foreground',
        'focus-visible:border-n500 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
    />
  )
}

/** Checkbox nativo com rotulo. `accent-color` pinta o check sem CSS custom. */
export function GameCheck({
  checked, onChange, children, disabled, className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const autoId = useId()
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-[.4em] text-[.85em] text-n300 select-none',
        disabled && 'cursor-not-allowed opacity-45',
        className,
      )}
    >
      <input
        type="checkbox"
        name={autoId}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[1em] w-[1em] shrink-0 cursor-pointer accent-primary"
      />
      {children}
    </label>
  )
}

/** Toggle deslizante do painel Auto. */
export function GameSwitch({
  checked, onChange, label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[1.4em] w-[2.6em] shrink-0 cursor-pointer rounded-full border transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        checked ? 'border-primary bg-primary' : 'border-n600 bg-n800',
      )}
    >
      <span
        className={cn(
          'absolute top-[.12em] h-[1em] w-[1em] rounded-full transition-[left]',
          checked ? 'left-[1.35em] bg-[#0b0e18]' : 'left-[.12em] bg-n400',
        )}
      />
    </button>
  )
}

/** Abas em pilula (Mochila, Loja, Config, continentes das Hunts...). */
export function SegmentedTabs<T extends string>({
  value, options, onChange, className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-[.3em]', className)}>
      {options.map((option) => (
        <GameButton
          key={option.value}
          variant={option.value === value ? 'primary' : 'secondary'}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </GameButton>
      ))}
    </div>
  )
}

/** Barra de progresso fina. `height` em `em` pra acompanhar a escala. */
export function Meter({
  pct, color, height = '.35em', className,
}: {
  pct: number
  color: string
  height?: string
  className?: string
}) {
  return (
    <div
      className={cn('overflow-hidden rounded-full bg-n800', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
      />
    </div>
  )
}

/** Cabecalho de secao (`COMPRAR`, `AMIGOS`, `CAPTURAS`). */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-[.75em] tracking-[.08em] text-n500', className)}>{children}</div>
  )
}

/**
 * Card padrao das listas (POKE, item, hunt).
 *
 * `onClick` recebe o EVENTO (e nao e um `() => void`) porque o Shift+clique
 * precisa distinguir "abrir o perfil" de "linkar no chat" — sem o evento, cada
 * tela teria que embrulhar o card num div so pra ler `shiftKey`.
 */
export function GameCard({
  children, className, onClick, title,
}: {
  children: ReactNode
  className?: string
  onClick?: (e: React.MouseEvent) => void
  title?: string
}) {
  return (
    <div
      title={title}
      onClick={onClick}
      className={cn(
        'rounded-[.7em] border border-n800 bg-n900',
        onClick && 'cursor-pointer transition-colors hover:border-primary',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Aviso de recurso ainda sem sistema de jogo por tras. */
export function ComingSoon({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-[.6em] rounded-[.7em] border border-dashed border-n700 p-[2em] text-center">
      <span className="text-[2em] text-n300">{icon}</span>
      <div className="font-medium">{title}</div>
      <div className="max-w-[24em] text-[.8em] text-n500">{children}</div>
    </div>
  )
}
