// Port de js/ui/panels/TeamMenu.js.
import { SPECIES } from '@/data/pokes'
import { stoneName } from '@/data/stones'
import { canEvolve, evolutionStoneRequirement, expProgressForInstance } from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { useGameStateStore, MAX_TEAM_SIZE } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { Button } from '@/components/ui/button'

export function TeamMenu() {
  const team = useGameStateStore((s) => s.team)
  const activeIndex = useGameStateStore((s) => s.activeIndex)
  const showProfile = usePokeProfileStore((s) => s.showProfile)

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">
        Equipe ({team.length}/{MAX_TEAM_SIZE})
      </h2>

      {team.length === 0 ? (
        <p className="text-sm text-muted-foreground">Voce ainda nao tem nenhum POKE.</p>
      ) : (
        <div className="space-y-2">
          {team.map((poke, index) => {
            const species = SPECIES[poke.speciesId]
            // Guard herdado do vanilla: um unico POKE com especie invalida
            // (save legado) nao pode cortar o resto da lista.
            if (!species) {
              console.warn('TeamMenu: pulando POKE com especie invalida', poke)
              return null
            }
            const isActive = index === activeIndex
            const progress = expProgressForInstance(poke, species)
            const stoneReq = evolutionStoneRequirement(species)
            const evolveLabel = stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'
            const canRemove = team.length > 1

            return (
              <div
                key={poke.uid}
                className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/40"
                onClick={() => showProfile(poke, species)}
              >
                <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <PokeNameTag poke={poke} species={species} />
                    <span className="text-muted-foreground">Lv{poke.level}</span>
                    {canEvolve(poke, species) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          controller.evolvePoke(poke.uid)
                        }}
                      >
                        {evolveLabel}
                      </Button>
                    )}
                    {isActive && <span className="text-xs text-muted-foreground">(Em campo)</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    HP {Math.floor(poke.hp)}/{poke.stats.hp} | EXP {Math.max(0, Math.floor(progress.into))}/{progress.needed}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col gap-1">
                  {!isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        controller.setActiveTeamIndex(index)
                      }}
                    >
                      Colocar em campo
                    </Button>
                  )}
                  {canRemove && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        controller.removeFromTeam(poke.uid)
                      }}
                    >
                      Retirar da equipe
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
