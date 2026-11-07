import { describe, expect, it } from 'vitest'
import { useRendererStore } from '@/stores/rendererStore'
import { DEFAULT_ZOOM, MAX_ZOOM } from './zoom'

describe('zoom padrao da camera', () => {
  it('comeca no maximo, e o rotulo da HUD mostra o mesmo numero', () => {
    expect(DEFAULT_ZOOM).toBe(MAX_ZOOM)
    expect(useRendererStore.getState().zoomPercent).toBe(Math.round(MAX_ZOOM * 100))
  })
})
