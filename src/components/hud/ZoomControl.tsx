// Pilula de zoom (−/%/+). O Renderer real vive dentro do <GameCanvas>; esta UI
// chega nele via rendererStore (ver o comentario la sobre por que essa ponte
// existe). O gesto de Ctrl+Scroll continua sendo tratado dentro do proprio
// GameCanvas.
import { Minus, Plus } from '@phosphor-icons/react'
import { useRendererStore } from '@/stores/rendererStore'

export function ZoomControl() {
  const zoomPercent = useRendererStore((s) => s.zoomPercent)
  const zoomStep = useRendererStore((s) => s.zoomStep)

  return (
    <div className="pointer-events-auto inline-flex items-center gap-[.16em] rounded-full border border-n800 bg-background/75 p-[.16em]">
      <ZoomButton label="Diminuir zoom" onClick={() => zoomStep(-1)}>
        <Minus />
      </ZoomButton>
      <span className="min-w-[2.6em] text-center text-[.8em] tabular-nums text-n300">{zoomPercent}%</span>
      <ZoomButton label="Aumentar zoom" onClick={() => zoomStep(1)}>
        <Plus />
      </ZoomButton>
    </div>
  )
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-[1.5em] w-[1.5em] cursor-pointer items-center justify-center rounded-full text-[.8em] text-n300 hover:bg-n800 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
