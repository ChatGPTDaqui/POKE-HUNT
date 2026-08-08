// Port do #lance-countdown-modal e do #lance-victory-return de
// js/ui/UIManager.js — os dois avisos exclusivos da hunt do Campeao Lance.
import { LANCE_MAP_ID } from '@/data/nightmareMaps'
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'
import { Button } from '@/components/ui/button'
import { CampoOverlay } from './CampoOverlay'

// Contagem regressiva de intro (world.countdownRemaining, ver
// controller.ts#buildMapWorld/stepWorld): nada nasceu ainda e o combate esta
// congelado enquanto isso corre.
export function LanceCountdownModal() {
  const remaining = useWorldStore((s) => s.countdownRemaining)
  if (remaining == null || remaining <= 0) return null

  return (
    <CampoOverlay>
      <div className="text-lg font-semibold">O Campeao Lance se aproxima...</div>
      <div className="font-mono text-6xl font-black text-amber-300">{Math.ceil(remaining)}</div>
    </CampoOverlay>
  )
}

// Atalho de vitoria: aparece SO depois de vencer o Lance, enquanto o jogador
// ainda estiver parado na hunt dele (world.sequenceCleared e setado uma vez
// por visita pelo stepWorld — sair e voltar reseta, mas
// isContinentUnlocked('kanto') fica desbloqueado pra sempre).
export function LanceVictoryReturn() {
  const visible = useWorldStore((s) => Boolean(s.mapDef?.id === LANCE_MAP_ID && s.sequenceCleared))
  if (!visible) return null

  return (
    <div className="pointer-events-auto fixed inset-x-0 top-24 z-[55] flex flex-col items-center gap-2">
      <div className="rounded-lg border border-amber-500 bg-background/95 px-4 py-3 text-center shadow-xl">
        <div className="mb-2 font-semibold text-amber-300">Voce derrotou o Campeao Lance!</div>
        <Button size="sm" onClick={() => controller.returnToHospital({ x: 0, y: 0 })}>
          Retornar ao Centro Pokemon
        </Button>
      </div>
    </div>
  )
}
