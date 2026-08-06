// Port de js/ui/panels/swatchHtml.js#pokeNameTagHtml — bloco
// shiny+raridade+nome usado em toda lista/perfil que mostra o nome de um
// POKE.
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { cn } from '@/lib/utils'

// Aceita qualquer coisa que carregue os 2 campos que esta tag de fato le, em
// vez de exigir um PokeInstance inteiro — o resumo do Farm Offline
// (OfflineSimSummary#captures) guarda so {speciesId, level, isShiny, rarity}
// e precisa renderizar a mesma tag. Todo PokeInstance continua satisfazendo
// este tipo, entao nenhum call site existente muda.
export type PokeNameTagTarget = Pick<PokeInstance, 'isShiny' | 'rarity'>

export function PokeNameTag({ poke, species }: { poke: PokeNameTagTarget; species: Species }) {
  const rarity = rarityOf(poke)
  return (
    <span className="inline-flex items-center gap-1.5">
      {poke.isShiny && <span aria-hidden>✨</span>}
      <span
        className="rounded border px-1 py-px text-[10px] leading-tight font-semibold tracking-wide"
        style={{ color: rarity.color, borderColor: rarity.color }}
      >
        {rarity.label}
      </span>
      <span className={cn(poke.isShiny && 'text-violet-400')}>{species.name}</span>
    </span>
  )
}
