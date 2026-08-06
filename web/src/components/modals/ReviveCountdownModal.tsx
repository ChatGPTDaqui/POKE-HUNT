// Port do #revive-modal de js/ui/UIManager.js#_updateReviveModal.
//
// NAO estava na lista da diretiva (que citava so boss-defeat + Lance), mas e
// da mesma familia (modal que le world state em UIManager) e cobre um
// comportamento real: a contagem regressiva de 5s do Auto-Revive
// (autoSystem.ts#AUTO_REVIVE_DELAY, world.reviveCountdown). Sem ele o POKE
// simplesmente revive do nada, sem aviso nenhum.
import { useWorldStore } from '@/stores/worldStore'

export function ReviveCountdownModal() {
  const countdown = useWorldStore((s) => s.reviveCountdown)
  if (countdown == null || countdown <= 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[55] flex flex-col items-center justify-center gap-2 bg-black/60">
      <div className="text-sm font-medium">POKE desmaiado! Auto-Revive em...</div>
      <div className="font-mono text-5xl font-black text-emerald-300">{Math.ceil(countdown)}</div>
    </div>
  )
}
