// Port dos botoes #zoom-in-btn/#zoom-out-btn/#zoom-level de js/main.js. O
// Renderer real vive dentro do <GameCanvas>; esta UI chega nele via
// rendererStore (ver o comentario la sobre por que essa ponte existe).
//
// O gesto de Ctrl+Scroll continua sendo tratado dentro do proprio GameCanvas
// (listener no canvas) — so o par de botoes + label moraram aqui.
import { useRendererStore } from '@/stores/rendererStore'
import { Button } from '@/components/ui/button'

export function ZoomControl() {
  const zoomPercent = useRendererStore((s) => s.zoomPercent)
  const zoomStep = useRendererStore((s) => s.zoomStep)

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border bg-background/85 px-1.5 py-1 text-xs shadow-lg backdrop-blur-sm">
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => zoomStep(-1)} title="Diminuir zoom">
        −
      </Button>
      <span className="w-10 text-center tabular-nums">{zoomPercent}%</span>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => zoomStep(1)} title="Aumentar zoom">
        +
      </Button>
    </div>
  )
}
