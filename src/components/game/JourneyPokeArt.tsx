import { useState } from 'react'
import type { Species } from '@/data/pokes'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { PokeSwatch } from '@/components/shared/PokeSwatch'

/** Arte da ficha, não do combate. A chave reinicia o fallback ao trocar espécie. */
export function JourneyPokeArt({ species, isShiny = false }: { species: Species; isShiny?: boolean }) {
  return <PokeArt key={`${species.id}:${isShiny}`} species={species} isShiny={isShiny} />
}

function PokeArt({ species, isShiny }: { species: Species; isShiny: boolean }) {
  const [failed, setFailed] = useState(false)
  return <span className="journey-poke-stage">
    {failed ? <PokeSwatch species={species} isShiny={isShiny} size={5} />
      : <img src={gen5SpriteUrl(species.id, isShiny)} alt={species.name} onError={() => setFailed(true)} className="journey-poke-art" />}
  </span>
}
