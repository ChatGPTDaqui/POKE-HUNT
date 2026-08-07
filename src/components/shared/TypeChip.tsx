// Chip de tipo elemental. Estava duplicado em cinco telas (Hunts, Pokedex,
// perfil, bestiario, calculadora), cada uma com um tamanho e um corte de nome
// diferente — o mesmo dado lido de cinco jeitos.
//
// Preenchido com a cor do tipo e texto escuro: as 17 cores de TYPE_COLORS foram
// escolhidas claras o bastante pra isso, e e o que distingue este chip do badge
// de raridade (contornado) que costuma aparecer ao lado.
import { colorForType } from '@/data/typeColors'
import type { ElementType } from '@/data/generated/types'
import { cn } from '@/lib/utils'

export function TypeChip({ type, full, className }: { type: ElementType; full?: boolean; className?: string }) {
  return (
    <span
      title={type}
      className={cn(
        'inline-block shrink-0 rounded-full px-[.5em] py-[.1em] text-[.68em] font-semibold text-[#0b0e18]',
        className,
      )}
      style={{ background: colorForType(type) }}
    >
      {full ? type : type.slice(0, 3)}
    </span>
  )
}
