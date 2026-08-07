// Port de js/ui/panels/typeMatchups.js#weaknessSectionHtml.
import { colorForType } from '@/data/typeColors'
import { typeMatchups, typeAdvantages } from '@/data/typeMatchups'
import type { Species } from '@/data/pokes'
import type { ElementType } from '@/data/generated/types'

function TypeChip({ type }: { type: ElementType }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: colorForType(type) }}
    >
      {type.slice(0, 3)}
    </span>
  )
}

function TypeChipRow({ types }: { types: ElementType[] }) {
  if (types.length === 0) return <span className="text-xs text-muted-foreground">Nenhum</span>
  return (
    <div className="flex flex-wrap gap-1">
      {types.map((t) => (
        <TypeChip key={t} type={t} />
      ))}
    </div>
  )
}

export function TypeWeaknessSection({ species }: { species: Species }) {
  const { weak4x, weak2x, resist2x, resist4x, immune } = typeMatchups(species)
  const { advantage2x } = typeAdvantages(species)

  return (
    <div className="space-y-2">
      <div>
        <div className="mb-1 text-xs font-medium text-green-500">Vantagem contra (2x de dano):</div>
        <TypeChipRow types={advantage2x} />
      </div>
      {weak4x.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-semibold text-red-500">⚠ Fraqueza dupla (4x de dano):</div>
          <TypeChipRow types={weak4x} />
        </div>
      )}
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Fraco contra (2x de dano):</div>
        <TypeChipRow types={weak2x} />
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Resiste (0.5x de dano):</div>
        <TypeChipRow types={resist2x} />
      </div>
      {resist4x.length > 0 && (
        <div>
          <div className="mb-1 text-xs text-muted-foreground">Resiste em dobro (0.25x de dano):</div>
          <TypeChipRow types={resist4x} />
        </div>
      )}
      <div>
        <div className="mb-1 text-xs text-muted-foreground">Imune a:</div>
        <TypeChipRow types={immune} />
      </div>
    </div>
  )
}
