// Controles da HUD, dimensionados em `em`.
//
// Cada primitivo carrega uma classe estavel (`jogo-botao`, `jogo-campo`,
// `jogo-check`, `jogo-switch`). Ela nao pinta nada: e o gancho por onde o CSS
// aplica o alvo minimo de toque quando o aparelho tem dedo em vez de mouse
// (ver `[data-toque]` no index.css). Fazer isso por CSS, e nao por prop, evita
// passar `coarse` por ~200 pontos de chamada — e um controle novo nasce com o
// tamanho certo so por usar o primitivo.
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
import { CaretDown, CircleNotch } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes,
} from 'react'
import { useDeviceMode } from '@/stores/uiStore'
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
  /**
   * Round-trip em andamento: desabilita e mostra um giro no lugar do rotulo.
   *
   * Existe porque `disabled` sozinho NAO e feedback. Botao que so apaga por
   * um ou dois segundos e indistinguivel de botao quebrado — e o mesmo modo
   * de falha do "Entrar" da hunt, que custou uma sessao inteira de
   * diagnostico antes de virar aviso de tela.
   *
   * O rotulo continua ocupando o espaco (`invisible`, nao `hidden`) e o giro
   * vem sobreposto: sem isso o botao encolhe no clique e a lista inteira
   * pula, que e pior que nao ter indicador nenhum.
   */
  carregando?: boolean
}

export function GameButton({
  variant = 'secondary', block, carregando, className, children, disabled, ...props
}: GameButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        'jogo-botão relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-[.35em] rounded-[.5em] border',
        'px-[.55em] py-[.32em] font-[inherit] text-[.85em] leading-[1.35] whitespace-nowrap transition-colors',
        'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        BUTTON_VARIANT[variant],
        block && 'w-full',
        className,
      )}
    >
      {/* Sem `carregando`, o filho vai direto pro botao — os botoes que nao
          usam a prop renderizam exatamente como antes. */}
      {carregando == null ? children : (
        <>
          <span className={cn('inline-flex items-center gap-[.35em]', carregando && 'invisible')}>
            {children}
          </span>
          {carregando && (
            <CircleNotch className="absolute animate-spin" aria-hidden />
          )}
        </>
      )}
    </button>
  )
}

/**
 * "Carregando..." para uma LISTA ou painel inteiro que ainda nao tem dado.
 *
 * Existe separado do `carregando` do botao porque o modo de falha e outro, e
 * pior: uma lista que renderiza vazia enquanto a query esta no ar mostra o
 * estado vazio — "Nenhuma captura registrada ainda", "voce nao tem ofertas" —
 * e isso nao e ausencia de feedback, e feedback ERRADO. O jogador le que nao
 * tem nada, e o que estava acontecendo era que o dado nao tinha chegado.
 *
 * Regra: onde houver um estado vazio com texto, o caminho de carregamento tem
 * que vir ANTES dele no `if`.
 */
export function Carregando({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <p className="flex items-center gap-[.4em] p-[.6em] text-[.85em] text-n500">
      <CircleNotch className="animate-spin" aria-hidden /> {texto}
    </p>
  )
}

/** Botao quadrado so-de-icone (fechar, +/-, cadeado). */
export function GameIconButton({ className, ...props }: GameButtonProps) {
  return (
    <GameButton
      {...props}
      className={cn('jogo-botão-ícone h-[1.9em] w-[1.9em] shrink-0 px-0 py-0 text-[1em]', className)}
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
        'jogo-campo min-w-0 rounded-[.45em] border border-n700 bg-n900 px-[.55em] py-[.32em]',
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
        'jogo-campo min-w-0 cursor-pointer rounded-[.45em] border border-n700 bg-n900 px-[.4em] py-[.32em]',
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
        'jogo-check-rotulo inline-flex cursor-pointer items-center gap-[.4em] text-[.85em] text-n300 select-none',
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
        className="jogo-check h-[1em] w-[1em] shrink-0 cursor-pointer accent-primary"
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
        'jogo-switch relative h-[1.4em] w-[2.6em] shrink-0 cursor-pointer rounded-full border transition-colors',
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

/**
 * Abas em pilula (Mochila, Loja, Config, continentes das Hunts...).
 *
 * No celular a fileira ROLA de lado em vez de quebrar em varias. A Wiki tem 7
 * abas: quebradas, elas ocupavam 150px dos ~470px uteis antes de a primeira
 * linha de conteudo aparecer. Rolagem horizontal e o padrao de barra de abas em
 * jogo mobile justamente por isso.
 *
 * O risco conhecido do padrao e a aba fora da tela passar despercebida — o
 * degrade na borda direita existe pra dizer que ha mais coisa ali. Com poucas
 * abas nada rola e nada aparece.
 */
export function SegmentedTabs<T extends string>({
  value, options, onChange, className,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
}) {
  const { compacto } = useDeviceMode()
  // O degrade da borda so entra quando a fileira PROVAVELMENTE nao cabe. Ele e
  // estatico (CSS nao enxerga overflow), entao aplicado sempre ele apagaria a
  // ultima aba de uma fileira que cabia inteira. Cinco e o ponto em que a
  // fileira passa de 374px uteis com rotulos de tamanho tipico.
  const podeRolar = compacto && options.length >= 5
  return (
    <div
      className={cn(
        'flex gap-[.3em]',
        compacto ? 'fileira-abas flex-nowrap overflow-x-auto' : 'flex-wrap',
        podeRolar && 'tiras-de-aba',
        className,
      )}
    >
      {options.map((option) => (
        <GameButton
          key={option.value}
          variant={option.value === value ? 'primary' : 'secondary'}
          aria-pressed={option.value === value}
          className={compacto ? 'shrink-0' : undefined}
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

/**
 * Cabecalho que gruda no topo enquanto a lista rola (abas, busca, filtros).
 *
 * Precisa ser o PRIMEIRO filho do corpo da janela: as margens negativas
 * cancelam o padding do `GameWindow` pra faixa cobrir a largura inteira. Sem
 * elas a lista apareceria correndo pelas laterais, por baixo do cabecalho.
 *
 * `bg-background` solido (e nao translucido) pelo mesmo motivo: com alfa, o
 * conteudo rolando por baixo continua legivel atraves do cabecalho.
 */
export function StickyHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // `-top-[.7em]` e nao `top-0`: o `-mt-[.7em]` que cancela o padding do
        // corpo tambem desloca a posicao onde o sticky gruda (ele ancora pela
        // caixa de MARGEM), e com `top-0` sobrava uma faixa de ~12px acima do
        // cabecalho por onde a lista passava rolando. O deslocamento negativo
        // devolve a borda do cabecalho exatamente ao topo da area rolavel.
        'sticky -top-[.7em] z-[5] -mx-[.7em] -mt-[.7em] flex flex-col gap-[.4em]',
        'border-b border-n800 bg-background px-[.7em] pt-[.45em] pb-[.35em]',
        className,
      )}
    >
      {children}
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
    <div className="flex flex-col items-center gap-[.45em] rounded-[.7em] border border-dashed border-n700 p-[1.2em] text-center">
      <span className="text-[2em] text-n300">{icon}</span>
      <div className="font-medium">{title}</div>
      <div className="max-w-[24em] text-[.8em] text-n500">{children}</div>
    </div>
  )
}

/**
 * Bloco que abre e fecha, com um resumo do estado na propria barra.
 *
 * Existe por causa de uma conta de tela: no celular o painel util tem ~470px de
 * altura, e a configuracao de auto-venda sozinha ocupava 300px permanentes no
 * topo da Mochila — sobravam quatro POKEs visiveis numa lista que pode ter
 * cem. Configuracao que se mexe uma vez por semana nao pode empurrar a lista
 * que se olha todo dia.
 *
 * O `resumo` na barra e o que torna o fechamento honesto: fechado, o jogador
 * continua sabendo se a auto-venda esta ligada e em quais raridades. Um
 * acordeao que esconde o ESTADO, e nao so os controles, e pior que a secao
 * sempre aberta.
 */
export function Recolhivel({
  titulo, resumo, icone, inicialmenteAberto = false, children, className,
}: {
  titulo: ReactNode
  resumo?: ReactNode
  icone?: ReactNode
  inicialmenteAberto?: boolean
  children: ReactNode
  className?: string
}) {
  const [aberto, setAberto] = useState(inicialmenteAberto)
  return (
    <div className={cn('overflow-hidden rounded-[.7em] border border-n800 bg-n900', className)}>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="jogo-botão flex w-full cursor-pointer items-center gap-[.5em] border-0 bg-transparent px-[.6em] py-[.5em] text-left font-[inherit]"
      >
        {icone}
        <span className="font-medium">{titulo}</span>
        {resumo && <span className="min-w-0 flex-1 truncate text-right text-[.78em] text-n400">{resumo}</span>}
        <CaretDown className={cn('shrink-0 text-n400 transition-transform duration-150', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="border-t border-n800 px-[.6em] py-[.55em]">{children}</div>}
    </div>
  )
}
