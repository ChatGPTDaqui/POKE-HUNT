// Bloco shiny + badge de raridade + nome, usado em toda lista/perfil que mostra
// o nome de um POKE. Um lugar so, pra a marca de shiny e a cor de raridade
// nunca divergirem entre telas.
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { cn } from '@/lib/utils'

// Aceita qualquer coisa que carregue os 2 campos que esta tag de fato le, em
// vez de exigir um PokeInstance inteiro — o resumo do Farm Offline
// (OfflineSimSummary#captures) guarda so {speciesId, level, isShiny, rarity} e
// precisa renderizar a mesma tag. Todo PokeInstance continua satisfazendo este
// tipo, entao nenhum call site existente muda.
export type PokeNameTagTarget = Pick<PokeInstance, 'isShiny' | 'rarity'>

export function PokeNameTag({ poke, species }: { poke: PokeNameTagTarget; species: Species }) {
  const rarity = rarityOf(poke)
  return (
    <span className="inline-flex items-center gap-[.4em]">
      {poke.isShiny && <span aria-hidden>✨</span>}
      {/* Badge CONTORNADO, nao preenchido: um chip solido aqui competiria
          visualmente com os chips de tipo, que ficam na mesma linha. */}
      <span
        className="rounded-full border px-[.45em] py-[.1em] text-[.68em] leading-tight tracking-[.05em]"
        style={{ color: rarity.color, borderColor: rarity.color }}
      >
        {rarity.label}
      </span>
      <span className={cn('font-medium', poke.isShiny && 'text-shiny')}>{species.name}</span>
    </span>
  )
}
