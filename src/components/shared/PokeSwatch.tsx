// Icone pequeno de POKE (rosto real quando a especie tem arte, senao um
// quadrado na cor do tipo) com borda na cor da RARIDADE e marca de shiny.
// Passar `poke` liga o hover com o resumo de stats.
//
// Dimensionado em `em` pra acompanhar a escala fluida da HUD — ver a nota de
// topo em components/game/controls.tsx.
import { faceIconUrl } from '@/data/sprites'
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { PokeTooltipContent } from './PokeTooltipContent'
import { cn } from '@/lib/utils'

export interface PokeSwatchProps {
  species: Species
  isShiny?: boolean
  poke?: PokeInstance | null
  /** Lado do quadrado, em `em`. */
  size?: number
  className?: string
}

export function PokeSwatch({ species, isShiny = false, poke = null, size = 2.8, className }: PokeSwatchProps) {
  const url = faceIconUrl(species.id, isShiny)
  const borderColor = poke ? rarityOf(poke).color : 'var(--color-n700)'
  const box = { width: `${size}em`, height: `${size}em` }

  const icon = (
    <span className={cn('relative inline-block shrink-0', className)} style={box}>
      {url ? (
        <img
          src={url}
          alt={species.name}
          className="h-full w-full rounded-[.5em] border-2 object-contain"
          style={{ borderColor }}
        />
      ) : (
        <span
          className="block h-full w-full rounded-[.5em] border-2"
          style={{ background: species.color, borderColor }}
        />
      )}
      {isShiny && (
        <span className="absolute -top-[.35em] -left-[.35em] text-[.7em] leading-none" aria-hidden>
          ✨
        </span>
      )}
    </span>
  )

  if (!poke) return icon

  return (
    <Tooltip>
      <TooltipTrigger render={<span tabIndex={0} className="inline-block cursor-default" />}>
        {icon}
      </TooltipTrigger>
      <TooltipContent className="max-w-none border bg-popover px-3 py-2 text-xs text-popover-foreground">
        <PokeTooltipContent poke={poke} species={species} />
      </TooltipContent>
    </Tooltip>
  )
}
