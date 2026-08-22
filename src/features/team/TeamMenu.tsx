// Equipe: um card por POKE. O card inteiro abre o perfil; os botoes dentro
// dele param a propagacao.
import { SPECIES } from '@/data/pokes'
import { stoneName } from '@/data/stones'
import { canEvolve, evolutionStoneRequirement, expProgressForInstance } from '@/engine/systems/progressionSystem'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { GameButton, GameCard, Meter } from '@/components/game/controls'
import { useDeviceMode } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

// PRESO (PH-72): Wrap/Bind/Fire Spin e companhia travam a troca de POKE
// enquanto duram. O guard de verdade esta em controller.setActiveTeamIndex; aqui
// e so pra o botao nao parecer quebrado.
const MOTIVO_PRESO = 'O POKE em campo esta preso e nao pode sair agora.'

export function TeamMenu() {
  const team = useGameStateStore((s) => s.team)
  const activeIndex = useGameStateStore((s) => s.activeIndex)
  // Selector estreito de proposito: o worldStore muda 60x por segundo, e um
  // selector que devolvesse `player` inteiro re-renderizaria a tela de Equipe
  // em todo frame de combate.
  const pokeEmCampoPreso = useWorldStore((s) => (s.player?.presoAte ?? 0) > 0)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const acao = useAcaoPendente()
  const { compacto } = useDeviceMode()

  if (team.length === 0) {
    return <p className="text-n500">Voce ainda nao tem nenhum POKE.</p>
  }

  return (
    <div className="flex flex-col gap-[.3em]">
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
            // No celular as acoes descem pra uma segunda fileira, e nao ficam
            // numa coluna a direita: "Colocar em campo" e "Retirar da equipe"
            // empilhados custavam 45% da largura do card e empurravam nome, HP
            // e barra pra uma coluna de 8em.
            className={cn('flex gap-[.5em] p-[.4em]', compacto ? 'flex-col' : 'items-center')}
          >
            <div className={cn('flex min-w-0 gap-[.55em]', compacto ? 'items-center' : 'flex-1 items-center')}>
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
            </div>

            <div className={cn('flex shrink-0 gap-[.3em]', compacto ? 'flex-row' : 'flex-col')}>
              {/* Caminho VISIVEL ate os 4 golpes. Antes a gestao existia so
                  dentro do perfil, atras de um clique no card e de uma aba que
                  nada anunciava — o jogador que quisesse trocar de golpe tinha
                  que descobrir os dois passos. A Equipe e onde ele administra o
                  POKE, entao e onde o botao pertence. */}
              <GameButton
                variant="ghost"
                className={compacto ? 'flex-1 justify-center' : undefined}
                title="Escolher os 4 golpes"
                onClick={(e) => {
                  e.stopPropagation()
                  showProfile(poke, species, 'golpes')
                }}
              >
                Golpes
              </GameButton>
              {!isActive && (
                <GameButton
                  // `flex-1`, e nao `block`: dois botoes `w-full` na mesma
                  // fileira somam 200% da largura e o segundo sai da tela — foi
                  // o que criou uma barra de rolagem horizontal no painel.
                  className={compacto ? 'flex-1 justify-center' : undefined}
                  disabled={acao.pendingKey != null || pokeEmCampoPreso}
                  // Botao desabilitado sem razao visivel e indistinguivel de
                  // botao quebrado — o `title` diz o que esta acontecendo.
                  title={pokeEmCampoPreso ? MOTIVO_PRESO : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`field:${poke.uid}`, () => controller.setActiveTeamIndex(index))
                  }}
                >
                  {compacto ? 'Pôr em campo' : 'Colocar em campo'}
                </GameButton>
              )}
              {canRemove && (
                <GameButton
                  variant="ghost"
                  className={compacto ? 'flex-1 justify-center' : undefined}
                  title="Retirar da equipe"
                  disabled={acao.pendingKey != null}
                  onClick={(e) => {
                    e.stopPropagation()
                    void acao.run(`rm:${poke.uid}`, () => controller.removeFromTeam(poke.uid))
                  }}
                >
                  {compacto ? 'Retirar' : 'Retirar da equipe'}
                </GameButton>
              )}
            </div>
          </GameCard>
        )
      })}
    </div>
  )
}
