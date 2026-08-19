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
// Piso pra chamar de "teclado" o que o visualViewport perdeu. Um teclado de
// celular ocupa 250-350px; a barra de URL, ~60px.
const MINIMO_TECLADO_PX = 120

export function useViewportTracking(): void {
  useEffect(() => {
    // Mesmo motivo do `pontoGrosso` no uiStore: jsdom nao implementa
    // `matchMedia`, e um teste que monta a HUD nao deve morrer por isso.
    const mql = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null
    const onResize = () => {
      const vv = window.visualViewport
      const altura = Math.round(vv?.height ?? window.innerHeight)
      // Quanto o teclado virtual esta comendo. So conta acima de 120px: a barra
      // de URL do celular encolhe o visualViewport em ~60px o tempo todo, e um
      // pinch tambem — nenhum dos dois e teclado. Abaixo do piso, zero.
      const roubado = Math.max(0, window.innerHeight - altura)
      const teclado = roubado > MINIMO_TECLADO_PX ? roubado : 0
      useUiStore.getState().handleViewportResize(
        Math.round(vv?.width ?? window.innerWidth),
        altura,
        mql?.matches ?? false,
        teclado,
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
