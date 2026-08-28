// As duas pecas de interface que TODA automacao do painel usa: o cabecalho com
// interruptor (`BlocoAuto`) e o `?` que explica o que ela faz (`InfoIcon`).
//
// Moraram dentro de `AutoPanel.tsx` ate a aba de Lure existir. Sairam de la pra
// os dois lados poderem importar sem que `AutoPanel` e `LurePanel` se importem
// em circulo.
import { Question } from '@phosphor-icons/react'
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
      <span className="inline-flex h-[1.15em] w-[1.15em] items-center justify-center rounded-full border border-n600 text-n500">
        <Question className="text-[.7em]" />
      </span>
    </Explicacao>
  )
}

/** Bloco de uma automacao: cabecalho com toggle + corpo com as regras dela. */
export function BlocoAuto({
  titulo, dica, ligado, aoLigar, extraCabecalho, children,
}: {
  titulo: string
  dica: string
  ligado: boolean
  aoLigar: (v: boolean) => void
  extraCabecalho?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-[.5em] rounded-[.7em] border p-[.6em] transition-colors',
        ligado ? 'border-n700 bg-n900/60' : 'border-n800',
      )}
    >
      <header className="flex items-center gap-[.5em]">
        <span className="flex flex-1 items-center gap-[.4em] font-medium">
          {titulo}
          <InfoIcon text={dica} />
        </span>
        {extraCabecalho}
        <GameSwitch checked={ligado} onChange={aoLigar} label={titulo} />
      </header>
      {/* O corpo continua visivel com a automacao desligada, so esmaecido: a
          configuracao e o motivo de o jogador abrir este painel, e escondê-la
          faria "ligar" virar um salto no escuro. */}
      {children && <div className={cn('flex flex-col gap-[.5em]', !ligado && 'opacity-55')}>{children}</div>}
    </section>
  )
}
