// Contagem regressiva entre salas de uma hunt (ver
// engine/systems/salaSystem.ts#registrarAbate/aplicarTransicaoDeSala): a
// quota de abates da sala atual fechou, a proxima ja foi sorteada por baixo
// (world.salaPendente — o "carregamento" adiantado), e o jogo fica congelado
// ate zerar. Mesmo padrao visual do countdown de intro do Campeao Lance
// (LanceCountdownModal), so disparado no MEIO da hunt em vez de na entrada.
import { useWorldStore } from '@/stores/worldStore'
import { CampoOverlay } from './CampoOverlay'

export function SalaCountdownModal() {
  const remaining = useWorldStore((s) => s.salaCountdownRemaining)
  if (remaining == null || remaining <= 0) return null

  return (
    <CampoOverlay>
      <div className="text-lg font-semibold">Entrando em nova área...</div>
      <div className="font-mono text-6xl font-black text-sky-300">{Math.ceil(remaining)}</div>
    </CampoOverlay>
  )
}
