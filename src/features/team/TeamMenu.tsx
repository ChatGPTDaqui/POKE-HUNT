// Equipe: um card por POKE. O card inteiro abre o perfil; os botoes dentro
// dele param a propagacao.
import { SPECIES } from '@/data/pokes'
import { stoneName } from '@/data/stones'
import { canEvolve, evolutionStoneRequirement, expProgressForInstance } from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { GameButton, GameCard, Meter } from '@/components/game/controls'

export function TeamMenu() {
  const team = useGameStateStore((s) => s.team)
  const activeIndex = useGameStateStore((s) => s.activeIndex)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const acao = useAcaoPendente()

  if (team.length === 0) {
    return <p className="text-n500">Voce ainda nao tem nenhum POKE.</p>
  }

  return (
    <div className="flex flex-col gap-[.45em]">
      {team.map((poke, index) => {
        const species = SPECIES[poke.speciesId]
        // Guard herdado do vanilla: um unico POKE com especie invalida (save
        // legado) nao pode cortar o resto da lista.
        if (!species) {
          console.warn('TeamMenu: pulando POKE com especie invalida', poke)
          return null
        }
        const isActive = index === activeIndex
        const progress = expProgressForInstance(poke, species)
        const stoneReq = evolutionStoneRequirement(species)
        const hpPct = (poke.hp / poke.stats.hp) * 100
        const canRemove = team.length > 1

        return (
          <GameCard
            key={poke.uid}
            onClick={() => showProfile(poke, species)}
            className="flex items-center gap-[.55em] p-[.55em]"
          >
            <PokeSwatch species={species} isShiny={poke.isShiny} poke={poke} size={3.2} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-[.4em]">
                <PokeNameTag poke={poke} species={species} />
                <span className="text-n400">Lv{poke.level}</span>
                {isActive && (
                  <span className="rounded-full bg-primary px-[.5em] py-[.05em] text-[.7em] font-medium text-primary-foreground">
                    Em campo
                  </span>
                )}
                {canEvolve(poke, species) && (
                  <GameButton
                    variant="accent"
                    disabled={acao.isPending(`evo:${poke.uid}`)}
                    onClick={(e) => {
                      e.stopPropagation()
                      void acao.run(`evo:${poke.uid}`, () => controller.evolvePoke(poke.uid))
                    }}
                  >
                    {stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
                  </GameButton>
                )}
              </div>
              <div className="mt-[.2em] text-[.78em] text-n400">
                HP {Math.floor(poke.hp)}/{poke.stats.hp} · EXP {Math.max(0, Math.floor(progress.into))}/{progress.needed}
              </div>
              <Meter
                pct={hpPct}
                height=".3em"
                color={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'}
                className="mt-[.3em] max-w-[14em]"
              />
            </div>

            <div className="flex shrink-0 flex-col gap-[.3em]">
              {!isActive && (
                <GameButton
                  disabled={acao.pendingKey != null}
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`field:${poke.uid}`, () => controller.setActiveTeamIndex(index))
                  }}
                >
                  Colocar em campo
                </GameButton>
              )}
              {canRemove && (
                <GameButton
                  variant="ghost"
                  disabled={acao.pendingKey != null}
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`rm:${poke.uid}`, () => controller.removeFromTeam(poke.uid))
                  }}
                >
                  Retirar da equipe
                </GameButton>
              )}
            </div>
          </GameCard>
        )
      })}
    </div>
  )
}
