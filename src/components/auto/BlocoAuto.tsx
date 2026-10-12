// As duas pecas de interface que TODA automacao do painel usa: o cabecalho com
// interruptor (`BlocoAuto`) e o `?` que explica o que ela faz (`InfoIcon`).
//
// Moraram dentro de `AutoPanel.tsx` ate a aba de Lure existir. Sairam de la pra
// os dois lados poderem importar sem que `AutoPanel` e `LurePanel` se importem
// em circulo.
import { CaretDown, Question, Warning } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { GameSwitch } from '@/components/game/controls'
import { Explicacao } from '@/components/shared/Explicacao'
import { cn } from '@/lib/utils'

// A explicacao de cada automacao vivia so no hover do `?` — e e justamente aqui
// que o jogador decide se liga o auto-catch e com qual bola. Este arquivo tinha
// um ramo proprio por `coarse` abrindo um Sheet; virou `Explicacao`, o mecanismo
// unico que abre nos dois ponteiros (ver components/shared/Explicacao.tsx).
export function InfoIcon({ text }: { text: string }) {
  return (
    <Explicacao
      conteudo={text}
      classeDoConteudo="max-w-[18em]"
      className="cursor-help"
      rotulo="O que isso faz"
    >
      <span className="inline-flex h-[1.15em] w-[1.15em] items-center justify-center rounded-full border border-menu-line text-menu-muted">
        <Question className="text-[.7em]" />
      </span>
    </Explicacao>
  )
}

/** Bloco de uma automacao: cabecalho com toggle + corpo com as regras dela. */
export function BlocoAuto({
  titulo, dica, ligado, aoLigar, extraCabecalho, children, resumo, alerta,
}: {
  titulo: string
  dica: string
  ligado: boolean
  aoLigar: (v: boolean) => void
  extraCabecalho?: React.ReactNode
  children?: React.ReactNode
  resumo?: string
  alerta?: boolean
}) {
  const [expandido, setExpandido] = useState(false)
  const conteudoId = useId()
  const recolhivel = resumo != null
  return (
    <section
      className="journey-auto-section flex min-w-0 flex-col border-b border-menu-line py-[.2em] last:border-b-0"
    >
      <header className="flex min-w-0 items-center gap-[.35em]">
        {recolhivel ? <button type="button" aria-label={`Configurar ${titulo}`}
          aria-expanded={expandido} aria-controls={conteudoId} onClick={() => setExpandido(v => !v)}
          className="flex min-h-[44px] min-w-0 flex-1 cursor-pointer items-center gap-[.35em] text-left">
          <span className="flex min-w-0 flex-1 flex-col gap-[.15em]">
            <span className="font-medium">{titulo}</span>
            <span className={cn('truncate', alerta ? 'font-medium text-bad' : 'text-menu-muted')}>
              {alerta && <Warning aria-label="Estoque baixo" className="mr-[.25em] inline" />} {resumo}
            </span>
          </span>
          <CaretDown aria-hidden className={cn('shrink-0', expandido && 'rotate-180')} />
        </button> : <span className="flex min-h-[44px] flex-1 items-center gap-[.4em] font-medium">{titulo}<InfoIcon text={dica} /></span>}
        {extraCabecalho}
        <GameSwitch checked={ligado} onChange={aoLigar} label={titulo} />
      </header>
      {/* Recolher é só apresentação; não desliga nem desmonta configurações. */}
      {children && <div id={conteudoId} hidden={recolhivel && !expandido}>
        <div className="flex flex-col gap-[.35em] pb-[.35em]">
          {recolhivel && <p className="text-menu-muted">{dica}</p>}
          {children}
        </div>
      </div>}
    </section>
  )
}
