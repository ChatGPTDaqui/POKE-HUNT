// Port de js/ui/panels/levelUpSplash.js — banner "LVL UP!" mostrado na
// evolucao de POKE e no level-up do Treinador. Nao existe asset de pixel art
// pra isso, entao o visual "pixelado" e simulado com fonte monospace pesada +
// camadas de text-shadow em degrau, igual ao CSS original. Some sozinho
// depois de 2s.
import { useEffect } from 'react'
import { useLevelUpSplashStore } from '@/stores/levelUpSplashStore'

const DURATION_MS = 2000

export function LevelUpSplash() {
  const visible = useLevelUpSplashStore((s) => s.visible)
  const hide = useLevelUpSplashStore((s) => s.hide)

  useEffect(() => {
    if (!visible) return
    const id = setTimeout(hide, DURATION_MS)
    return () => clearTimeout(id)
  }, [visible, hide])

  if (!visible) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
      <span
        className="animate-in fade-in zoom-in-95 font-mono text-6xl font-black tracking-widest text-amber-300"
        style={{
          textShadow: '3px 3px 0 #000, -3px 3px 0 #000, 3px -3px 0 #000, -3px -3px 0 #000, 6px 6px 0 rgba(0,0,0,0.35)',
        }}
      >
        LVL UP !
      </span>
    </div>
  )
}
