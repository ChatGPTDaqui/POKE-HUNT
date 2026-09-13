import { ArrowUDownLeft } from '@phosphor-icons/react'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { buildHospitalWorld } from '@/engine/simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useRendererStore } from '@/stores/rendererStore'
import { useWorldStore } from '@/stores/worldStore'

// `lutando`: duelo AO VIVO (ex: praticar contra o poke exibido no Ranking,
// ver RankingMenu.tsx — `criarMundoPvpVisual`, sem sessao nenhuma no banco).
// `replay`: resultado do PvP com sessao (amistoso ou ranqueado) ja decidido
// pelo servidor ANTES desta tela abrir (ver usePvp.ts/usePvpRanked.ts) —
// aqui so reproduz os eventos, nunca reporta nada de volta.
const TITULO_POR_ESTADO: Record<string, (treinador: string) => string> = {
  lutando: (t) => `Duelo contra ${t}`,
  replay: (t) => `Duelo contra ${t}`,
  vitoria: () => 'Você venceu',
  derrota: (t) => `${t} venceu`,
  empate: () => 'Empate',
}

export function PvpOverlay() {
  const pvp = useWorldStore((s) => s.pvp)
  const playerHp = useWorldStore((s) => s.player?.poke.hp ?? 0)
  const rivalHp = useWorldStore((s) => s.enemies[0]?.poke.hp ?? 0)
  const rivalMaxHp = useWorldStore((s) => s.enemies[0]?.poke.stats.hp ?? 1)

  if (!pvp) return null

  const emAndamento = pvp.estado === 'lutando' || pvp.estado === 'replay'

  const encerrar = () => {
    const { team, activeIndex } = useGameStateStore.getState()
    const hospitalSpot = useRendererStore.getState().renderer?.hospitalPlayerPos ?? { x: 0, y: 0 }
    useWorldStore.getState().setWorld(buildHospitalWorld(team[activeIndex] ?? null, hospitalSpot, useWorldStore.getState()))
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[7.5em] z-24 w-[min(24em,calc(100vw-1em))] -translate-x-1/2">
      <GameCard className="p-[.65em] text-center">
        <SectionLabel>ARENA PVP</SectionLabel>
        <div className="mt-[.15em] font-medium">
          {(TITULO_POR_ESTADO[pvp.estado] ?? TITULO_POR_ESTADO.lutando)(pvp.treinador)}
        </div>
        <div className="mt-[.25em] text-[.78em] text-n400">
          Você {Math.max(0, playerHp)} HP · Rival {Math.max(0, rivalHp)}/{rivalMaxHp} HP
        </div>
        {!emAndamento && (
          <GameButton className="mt-[.45em]" variant="primary" onClick={encerrar}>
            <ArrowUDownLeft /> Voltar
          </GameButton>
        )}
      </GameCard>
    </div>
  )
}
