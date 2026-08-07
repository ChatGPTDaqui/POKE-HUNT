// Port de js/ui/panels/swatchHtml.js#swatchHtml — icone pequeno (foto de
// rosto real quando a especie tem arte, senao um quadrado colorido) com
// borda na cor da raridade e badge de brilho. Passar `poke` liga o hover
// com o resumo de stats (PokeTooltipContent).
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
  size?: 'sm' | 'md'
  className?: string
}

export function PokeSwatch({ species, isShiny = false, poke = null, size = 'md', className }: PokeSwatchProps) {
  const url = faceIconUrl(species.id, isShiny)
  const borderColor = poke ? rarityOf(poke).color : 'var(--border)'
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'

  const icon = (
    <span className={cn('relative inline-block shrink-0', dim, className)}>
      {url ? (
        <img
          src={url}
          alt={species.name}
          className="h-full w-full rounded-md border-2 object-contain"
          style={{ borderColor }}
        />
      ) : (
        <span className="block h-full w-full rounded-md border-2" style={{ background: species.color, borderColor }} />
      )}
      {isShiny && (
        <span className="absolute -top-1 -left-1 text-[10px] leading-none" aria-hidden>
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
