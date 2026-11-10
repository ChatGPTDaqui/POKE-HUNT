// Bloco "fraquezas e resistencias" compartilhado pelo perfil do POKE e pela
// Pokedex. Os multiplicadores saem do TYPE_CHART real usado no combate.
import { typeMatchups, typeAdvantages } from '@/data/typeMatchups'
import type { Species } from '@/data/pokes'
import type { ElementType } from '@/data/generated/types'
import { TypeChip } from './TypeChip'

function TypeChipRow({ types }: { types: ElementType[] }) {
  if (types.length === 0) return <span className="text-[.8em] text-menu-muted">Nenhum</span>
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
      <div className="text-[.8em]" style={{ color: color ?? 'var(--color-menu-muted)' }}>{label}</div>
      <TypeChipRow types={types} />
    </div>
  )
}

export function TypeWeaknessSection({ species }: { species: Species }) {
  const { weak4x, weak2x, resist2x, resist4x, immune } = typeMatchups(species)
  const { advantage2x } = typeAdvantages(species)

  return (
    <div className="flex flex-col gap-[.4em]">
      {/* Rótulos dizem a direção do dano: "Vantagem contra" e "Fraco contra"
          lado a lado, ambos com (2x), confundiam ataque com defesa. */}
      <Bloco label="Golpes do tipo dele são fortes contra (2x)" color="var(--journey-leaf, #4ade80)" types={advantage2x} />
      {/* 4x so aparece quando existe: uma linha "Nenhum" pra um caso raro so
          alonga o bloco sem informar nada. */}
      {weak4x.length > 0 && <Bloco label="⚠ Recebe dano quádruplo de (4x)" color="var(--color-bad)" types={weak4x} />}
      <Bloco label="Recebe dano dobrado de (2x)" color="var(--color-warn)" types={weak2x} />
      <Bloco label="Recebe metade do dano de (0,5x)" types={resist2x} />
      {resist4x.length > 0 && <Bloco label="Recebe um quarto do dano de (0,25x)" types={resist4x} />}
      {immune.length > 0 && <Bloco label="Imune a" types={immune} />}
    </div>
  )
}
