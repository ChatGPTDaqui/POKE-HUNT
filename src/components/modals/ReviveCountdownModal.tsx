// Port do #revive-modal de js/ui/UIManager.js#_updateReviveModal.
//
// NAO estava na lista da diretiva (que citava so boss-defeat + Lance), mas e
// da mesma familia (modal que le world state em UIManager) e cobre um
// comportamento real: a contagem regressiva de 5s do Auto-Revive
// (autoSystem.ts#AUTO_REVIVE_DELAY, world.reviveCountdown). Sem ele o POKE
// simplesmente revive do nada, sem aviso nenhum.
import { useWorldStore } from '@/stores/worldStore'
import { CampoOverlay } from './CampoOverlay'

export function ReviveCountdownModal() {
  const countdown = useWorldStore((s) => s.reviveCountdown)
  if (countdown == null || countdown <= 0) return null

  // Confinado ao campo de batalha (ver CampoOverlay): a contagem durava 5
  // segundos cobrindo o menu inteiro, justo quando o jogador quer abrir a
  // Mochila pra conferir se ainda tem Revive.
  return (
    <CampoOverlay>
      <div className="text-sm font-medium">POKE desmaiado! Auto-Revive em...</div>
      <div className="font-mono text-5xl font-black text-emerald-300">{Math.ceil(countdown)}</div>
    </CampoOverlay>
  )
}
