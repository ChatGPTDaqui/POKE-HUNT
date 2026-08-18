import { useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'

// Um unico listener de resize pro app inteiro. Alem de alimentar os
// breakpoints e o modo de dispositivo, ele LIMPA as posicoes de janela
// arrastadas: uma janela largada no canto direito de uma tela larga fica fora
// da area visivel quando a janela do navegador encolhe, e sem barra de titulo
// alcancavel nao ha como traze-la de volta.
//
// A medida sai do `visualViewport` quando existe, e nao de `window.innerHeight`:
// no celular a barra de URL entra e sai do caminho e so o visualViewport
// acompanha isso. Com `innerHeight` a doca do rodape fica sob a barra do
// navegador durante a rolagem por inercia do Safari.
//
// `orientationchange` e ouvido junto porque o iOS dispara `resize` ANTES de a
// rotacao assentar: sem o segundo evento, um giro para o modo deitado media a
// tela ainda em pe.
export function useViewportTracking(): void {
  useEffect(() => {
    // Mesmo motivo do `pontoGrosso` no uiStore: jsdom nao implementa
    // `matchMedia`, e um teste que monta a HUD nao deve morrer por isso.
    const mql = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null
    const onResize = () => {
      const vv = window.visualViewport
      useUiStore.getState().handleViewportResize(
        Math.round(vv?.width ?? window.innerWidth),
        Math.round(vv?.height ?? window.innerHeight),
        mql?.matches ?? false,
      )
    }
    onResize()
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    mql?.addEventListener('change', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
      mql?.removeEventListener('change', onResize)
    }
  }, [])
}
