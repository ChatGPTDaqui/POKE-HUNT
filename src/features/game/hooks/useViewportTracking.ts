import { useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'

// Um unico listener de resize pro app inteiro. Alem de alimentar os
// breakpoints, ele LIMPA as posicoes de janela arrastadas: uma janela largada
// no canto direito de uma tela larga fica fora da area visivel quando a janela
// do navegador encolhe, e sem barra de titulo alcancavel nao ha como traze-la
// de volta.
export function useViewportTracking(): void {
  useEffect(() => {
    const onResize = () => useUiStore.getState().handleViewportResize(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
}
