import { useEffect, useRef } from 'react'
import { ArrowUDownLeft } from '@phosphor-icons/react'
import { GameButton, GameCard, SectionLabel } from '@/components/game/controls'
import { buildHospitalWorld } from '@/engine/simulation'
import * as pvpRpc from '@/data/remote/pvpRpc'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useRendererStore } from '@/stores/rendererStore'
import { useWorldStore } from '@/stores/worldStore'

export function PvpOverlay() {
  const pvp = useWorldStore((s) => s.pvp)
  const playerHp = useWorldStore((s) => s.player?.poke.hp ?? 0)
  const rivalHp = useWorldStore((s) => s.enemies[0]?.poke.hp ?? 0)
  const rivalMaxHp = useWorldStore((s) => s.enemies[0]?.poke.stats.hp ?? 1)
  const registrados = useRef(new Set<string>())

  useEffect(() => {
    if (!pvp?.sessaoId || pvp.estado === 'lutando' || registrados.current.has(pvp.sessaoId)) return
    registrados.current.add(pvp.sessaoId)
    const vencedorId = pvp.estado === 'vitoria' ? pvp.meuId ?? null : pvp.rivalId ?? null
    void pvpRpc.registrarResultadoPvp(pvp.sessaoId, vencedorId)
  }, [pvp])

  if (!pvp) return null

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
          {pvp.estado === 'lutando' ? `Duelo contra ${pvp.treinador}` : pvp.estado === 'vitoria' ? 'Você venceu' : `${pvp.treinador} venceu`}
        </div>
        <div className="mt-[.25em] text-[.78em] text-n400">
          Você {Math.max(0, playerHp)} HP · Rival {Math.max(0, rivalHp)}/{rivalMaxHp} HP
        </div>
        {pvp.estado !== 'lutando' && (
          <GameButton className="mt-[.45em]" variant="primary" onClick={encerrar}>
            <ArrowUDownLeft /> Voltar
          </GameButton>
        )}
      </GameCard>
    </div>
  )
}
