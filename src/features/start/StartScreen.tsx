// Port de js/ui/panels/StartScreen.js — escolha do POKE inicial.
import { SPECIES } from '@/data/pokes'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { controller } from '@/engine/controller'
import { Button } from '@/components/ui/button'

// Trio inicial fixo — separado do roster (bem maior) que vem da planilha.
const STARTER_SPECIES_IDS = ['charmander', 'squirtle', 'bulbasaur']

// `hospitalSpot` e so a posicao INICIAL guardada na entidade do jogador:
// Renderer.renderHospital sempre recalcula a posicao real de desenho a partir
// do tamanho do canvas a cada frame, e stepWorld nem roda movimento na cena
// do Hospital — entao esse valor e inerte fora do GameCanvas.
const INERT_HOSPITAL_SPOT = { x: 0, y: 0 }

export function StartScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 overflow-y-auto bg-background/95 p-6">
      <h2 className="text-2xl font-semibold">NOVO POKE IDLE</h2>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Voce esta prestes a comecar sua jornada. Escolha um POKE para chamar de seu.
      </p>

      <div className="flex flex-wrap justify-center gap-4">
        {STARTER_SPECIES_IDS.map((speciesId) => {
          const species = SPECIES[speciesId]
          if (!species) return null
          return (
            <div key={speciesId} className="flex w-56 flex-col items-center gap-2 rounded-lg border bg-card p-4">
              <img
                src={gen5SpriteUrl(species.id, false)}
                alt={species.name}
                className="h-24 w-24 object-contain [image-rendering:pixelated]"
              />
              <div className="text-base font-medium">{species.name}</div>
              <div className="text-center text-xs text-muted-foreground">{species.description}</div>
              <Button className="mt-1 w-full" onClick={() => controller.chooseStarter(species.id, INERT_HOSPITAL_SPOT)}>
                Escolher
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
