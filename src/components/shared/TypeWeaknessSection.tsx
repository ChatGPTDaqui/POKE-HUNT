// Bloco "fraquezas e resistencias" compartilhado pelo perfil do POKE e pela
// Pokedex. Os multiplicadores saem do TYPE_CHART real usado no combate.
import { typeMatchups, typeAdvantages } from '@/data/typeMatchups'
import type { Species } from '@/data/pokes'
import type { ElementType } from '@/data/generated/types'
import { TypeChip } from './TypeChip'

function TypeChipRow({ types }: { types: ElementType[] }) {
  if (types.length === 0) return <span className="text-[.8em] text-n500">Nenhum</span>
  return (
    <div className="flex flex-wrap gap-[.25em]">
      {types.map((t) => (
        <TypeChip key={t} type={t} />
      ))}
    </div>
  )
}

function Bloco({ label, color, types }: { label: string; color?: string; types: ElementType[] }) {
  return (
    <div className="flex flex-col gap-[.25em]">
      <div className="text-[.8em]" style={{ color: color ?? 'var(--color-n400)' }}>{label}</div>
      <TypeChipRow types={types} />
    </div>
  )
}

export function TypeWeaknessSection({ species }: { species: Species }) {
  const { weak4x, weak2x, resist2x, resist4x, immune } = typeMatchups(species)
  const { advantage2x } = typeAdvantages(species)

  return (
    <div className="flex flex-col gap-[.4em]">
      <Bloco label="Vantagem contra (2x)" color="#4ade80" types={advantage2x} />
      {/* 4x so aparece quando existe: uma linha "Nenhum" pra um caso raro so
          alonga o bloco sem informar nada. */}
      {weak4x.length > 0 && <Bloco label="⚠ Fraqueza dupla (4x)" color="var(--color-bad)" types={weak4x} />}
      <Bloco label="Fraco contra (2x)" color="var(--color-warn)" types={weak2x} />
      <Bloco label="Resiste (0.5x)" types={resist2x} />
      {resist4x.length > 0 && <Bloco label="Resiste em dobro (0.25x)" types={resist4x} />}
      <Bloco label="Imune a" types={immune} />
    </div>
  )
}
