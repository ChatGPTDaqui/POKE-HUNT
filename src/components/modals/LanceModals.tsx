// Port do #lance-countdown-modal e do #lance-victory-return de
// js/ui/UIManager.js — os dois avisos exclusivos da hunt do Campeao Lance.
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { GameButton } from '@/components/game/controls'
import { TituloDoDuelo } from './TituloDoDuelo'

// PH-552: a contagem regressiva de intro (5 s, `world.countdownRemaining`)
// saiu do duelo — a abertura (bola, pose, habilidade) e o que antecede o
// primeiro golpe. Sobrou o titulo por 1 s, so no cliente.
export function LanceCountdownModal() {
  const noLance = useWorldStore((s) => s.mapDef?.id === LANCE_MAP_ID)
  if (!noLance) return null
  return <TituloDoDuelo titulo="Duelo contra o Campeão Lance" />
}

// Atalho de vitoria: aparece SO depois de vencer o Lance, enquanto o jogador
// ainda estiver parado na hunt dele (world.sequenceCleared e setado uma vez
// por visita pelo stepWorld — sair e voltar reseta, mas
// os grupos que ele libera ficam desbloqueados pra sempre).
export function LanceVictoryReturn() {
  const visible = useWorldStore((s) => Boolean(s.mapDef?.id === LANCE_MAP_ID && s.sequenceCleared))
  if (!visible) return null

  return (
    // `top-24` era 96px fixos — no celular isso cai em cima do trilho de
    // status. Vai pra mesma reserva que o resto usa, com o recorte do aparelho
    // na conta (este aviso e `fixed`, fora da `.hud-safe`).
    <div
      className="pointer-events-auto fixed inset-x-0 z-[55] flex flex-col items-center gap-2 px-[1em]"
      style={{ top: 'calc(4.6em + var(--sa-top, 0px))' }}
    >
      <div className="rounded-lg border border-amber-500 bg-background/95 px-[1em] py-[.7em] text-center shadow-xl">
        <div className="mb-[.5em] font-semibold text-amber-300">Você derrotou o Campeão Lance!</div>
        <GameButton onClick={() => controller.returnToHospital({ x: 0, y: 0 })}>
          Retornar ao Centro Pokemon
        </GameButton>
      </div>
    </div>
  )
}
