// Equipe: seleção compacta e ficha focada, sem repetir ações em cada integrante.
import { SPECIES } from '@/data/pokes'
import { stoneName } from '@/data/stones'
import { canEvolve, evolutionStoneRequirement, expProgressForInstance, opcoesDisponiveis } from '@/engine/systems/progressionSystem'
import { EscolhaDeEvolucao } from '@/components/modals/EscolhaDeEvolucao'
import { controller } from '@/engine/controller'
import { useState } from 'react'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useAcaoPendente } from '@/hooks/useAcaoPendente'
import { PokeSwatch } from '@/components/shared/PokeSwatch'
import { PokeNameTag } from '@/components/shared/PokeNameTag'
import { GameButton, GameCard, Meter } from '@/components/game/controls'
import { useDeviceMode } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { MenuScene } from '@/components/game/MenuScene'
import { TypeChip } from '@/components/shared/TypeChip'
import { JourneyPokeArt } from '@/components/game/JourneyPokeArt'
import { EquipmentArt } from '@/components/game/JourneyArtwork'

// PRESO (PH-72): Wrap/Bind/Fire Spin e companhia travam a troca de POKE
// enquanto duram. O guard de verdade esta em controller.setActiveTeamIndex; aqui
// e so pra o botao nao parecer quebrado.
const MOTIVO_PRESO = 'O POKE em campo esta preso e não pode sair agora.'

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
  // PH-139: uid do POKE cuja escolha de evolucao esta aberta, ou null.
  const [escolhendo, setEscolhendo] = useState<string | null>(null)
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const selected = team.find((p) => p.uid === selectedUid && SPECIES[p.speciesId])
    ?? (SPECIES[team[activeIndex]?.speciesId] ? team[activeIndex] : undefined)
    ?? team.find((p) => SPECIES[p.speciesId])

  if (team.length === 0) {
    return <div className="journey-empty"><EquipmentArt kind="team" className="journey-empty-art" /><p>Você ainda não tem nenhum POKE.</p></div>
  }

  const pokeEscolhendo = team.find((p) => p.uid === escolhendo)
  const especieEscolhendo = pokeEscolhendo ? SPECIES[pokeEscolhendo.speciesId] : null

  return (
    <MenuScene tone="team">
      <div className="journey-team-workspace">
      <div className="journey-team-list" role="group" aria-label="Integrantes da equipe">
        {team.map((poke, index) => {
          const species = SPECIES[poke.speciesId]
          if (!species) return null
          return <button key={poke.uid} type="button" className="journey-team-choice" aria-label={`Selecionar ${species.name}`} aria-pressed={selected?.uid === poke.uid} onClick={() => setSelectedUid(poke.uid)}>
            <span className="team-position">{String(index + 1).padStart(2, '0')}</span>
            <PokeSwatch species={species} isShiny={poke.isShiny} size={2.8} />
            <span className="journey-team-copy"><PokeNameTag poke={poke} species={species} /><span>Lv{poke.level} · HP {Math.floor(poke.hp)}/{poke.stats.hp}</span>{index === activeIndex && <small>Em campo</small>}</span>
          </button>
        })}
      </div>
      <div className="team-roster journey-team-focus" aria-label="Pokémon selecionado">
      {pokeEscolhendo && especieEscolhendo && (
        <EscolhaDeEvolucao
          poke={pokeEscolhendo}
          opcoes={opcoesDisponiveis(pokeEscolhendo, especieEscolhendo)}
          requisito={(o) => evolutionStoneRequirement(especieEscolhendo, o)}
          onEscolher={(alvo) => {
            setEscolhendo(null)
            void acao.run(`evo:${pokeEscolhendo.uid}`, () => controller.evolvePoke(pokeEscolhendo.uid, alvo))
          }}
          onCancelar={() => setEscolhendo(null)}
        />
      )}
      {team.map((poke, index) => {
        if (poke.uid !== selected?.uid) return null
        const species = SPECIES[poke.speciesId]
        // Guard herdado do vanilla: um unico POKE com especie invalida (save
        // legado) nao pode cortar o resto da lista.
        if (!species) {
          console.warn('TeamMenu: pulando POKE com espécie invalida', poke)
          return null
        }
        const isActive = index === activeIndex
        const progress = expProgressForInstance(poke, species)
        const opcoesDeEvo = opcoesDisponiveis(poke, species)
        const stoneReq = evolutionStoneRequirement(species, opcoesDeEvo[0])
        const hpPct = (poke.hp / poke.stats.hp) * 100
        const canRemove = team.length > 1

        return (
          <GameCard
            key={poke.uid}
            // No celular as acoes descem pra uma segunda fileira, e nao ficam
            // numa coluna a direita: "Colocar em campo" e "Retirar da equipe"
            // empilhados custavam 45% da largura do card e empurravam nome, HP
            // e barra pra uma coluna de 8em.
            className={cn('team-member flex flex-col gap-[.4em] p-[.45em]', isActive && 'is-active')}
          >
            <div className={cn('flex min-w-0 gap-[.55em]', compacto ? 'items-center' : 'flex-1 items-center')}>
            <span className="team-position">{String(index + 1).padStart(2, '0')}</span>
            <JourneyPokeArt species={species} isShiny={poke.isShiny} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-[.4em]">
                <PokeNameTag poke={poke} species={species} />
                <span className="text-menu-muted">Lv{poke.level}</span>
                {isActive && (
                  <span className="rounded-full bg-menu-brand px-[.5em] py-[.05em] text-[.7em] font-medium text-primary-foreground">
                    Em campo
                  </span>
                )}
                {canEvolve(poke, species) && (
                  <GameButton
                    variant="accent"
                    disabled={acao.isPending(`evo:${poke.uid}`)}
                    onClick={(e) => {
                      e.stopPropagation()
                      // PH-139: com mais de um destino, quem decide e o jogador.
                      if (opcoesDeEvo.length > 1) { setEscolhendo(poke.uid); return }
                      void acao.run(`evo:${poke.uid}`, () => controller.evolvePoke(poke.uid))
                    }}
                  >
                    {opcoesDeEvo.length > 1
                      ? 'Evoluir…'
                      : stoneReq ? `Evoluir (${stoneReq.count}x ${stoneName(stoneReq.type)})` : 'Evoluir'}
                  </GameButton>
                )}
              </div>
              <div className="mt-[.35em] flex flex-wrap gap-[.25em]">{[species.type, species.type2].map((type) => type && <TypeChip key={type} type={type} />)}</div>
              <div className="mt-[.2em] text-[.78em] text-menu-muted">
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

            <dl className="journey-team-stats" aria-label="Atributos do Pokémon">
              {([
                ['HP', poke.stats.hp], ['Ataque', poke.stats.atkFis], ['Defesa', poke.stats.def],
                ['At. especial', poke.stats.atkEsp], ['Def. especial', poke.stats.defEsp], ['Velocidade', poke.stats.speed],
              ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>

            <div className="flex shrink-0 flex-wrap gap-[.3em]">
              <GameButton variant="ghost" onClick={() => showProfile(poke, species)}>Ver perfil completo</GameButton>
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
      </div>
    </MenuScene>
  )
}
