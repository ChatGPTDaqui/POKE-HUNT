// Ponte entre o <GameCanvas> (que e o unico dono da instancia de Renderer) e
// os controles de UI que precisam mexer na camera — hoje so o ZoomControl.
//
// No vanilla, main.js tinha o `renderer` como variavel de modulo e os botoes
// #zoom-in-btn/#zoom-out-btn liam ele direto. Em React o Renderer nasce
// dentro do useEffect de montagem do GameCanvas e nao existe fora dele, entao
// esta store publica a referencia (setRenderer) pra quem precisar.
//
// `zoomPercent` e estado React de verdade (o label re-renderiza quando muda),
// enquanto `renderer` e so um handle imperativo — por isso zoomStep escreve
// nos dois: chama o metodo imperativo E publica o novo valor pra UI.
import { create } from 'zustand'
import type { Renderer } from '@/render/renderer'

interface RendererState {
  renderer: Renderer | null
  zoomPercent: number
  setRenderer: (renderer: Renderer | null) => void
  setZoomPercent: (percent: number) => void
  zoomStep: (direction: number) => void
}

export const useRendererStore = create<RendererState>((set, get) => ({
  renderer: null,
  zoomPercent: 150, // DEFAULT_ZOOM (1.5) do Renderer, ate o canvas montar

  setRenderer: (renderer) => {
    set({ renderer, zoomPercent: renderer ? Math.round(renderer.zoom * 100) : 150 })
  },

  setZoomPercent: (zoomPercent) => set({ zoomPercent }),

  zoomStep: (direction) => {
    const { renderer } = get()
    if (!renderer) return
    const zoom = renderer.zoomStep(direction)
    set({ zoomPercent: Math.round(zoom * 100) })
  },
}))
