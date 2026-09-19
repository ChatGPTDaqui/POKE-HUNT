// Redimensionar janelas flutuantes pelas QUATRO bordas, nao so pelo canto
// (PH-562, pedido explicito do dono do projeto: "atualmente so existe nas
// extremidades diagonais").
//
// O canto inferior direito continua sendo o `resize: both` NATIVO do CSS
// (GameWindow.tsx) — ele fica como esta, sem tocar. Este hook so ACRESCENTA
// as quatro faixas de borda que o CSS nativo nunca ofereceu em navegador
// nenhum (`resize` so tem a variante de canto).
//
// POR QUE MEDIR min/max-width VIA `getComputedStyle` EM VEZ DE HARDCODAR. A
// janela ja declara os limites como classe Tailwind (`min-w-[18em]`,
// `max-w-[calc(100vw-1.5em)]`) porque eles dependem do `hudScale`/viewport
// atual — duplicar esses numeros aqui divergiria da fonte real assim que
// qualquer um dos dois mudasse. Ler do computado garante que o hook nunca
// deixa a janela menor ou maior do que o CSS ja permite.
//
// POR QUE `left`/`top` SO MUDAM NAS BORDAS ESQUERDA/DE CIMA. Arrastar a borda
// direita ou de baixo so precisa crescer a largura/altura a partir do canto
// oposto, que ja esta fixo. Arrastar a borda esquerda ou de cima move o
// CANTO OPOSTO ao que o cursor segura — a janela cresce "pra tras" — entao a
// posicao tem que acompanhar, exatamente como o corner-resize nativo faz
// (que so mexe no canto solto, nunca no oposto).
import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useUiStore, type WindowKey } from '@/stores/uiStore'

export type BordaDeRedimensionar = 'top' | 'right' | 'bottom' | 'left'

// Mesma margem da EDGE_MARGIN de useWindowDrag.ts: a janela nao pode ser
// arrastada (aqui, encolhida-a-partir-da-esquerda-ou-de-cima) pra fora da
// tela a ponto de sumir.
const EDGE_MARGIN = 2

function limite(cs: CSSStyleDeclaration, propMin: string, propMax: string): [number, number] {
  const min = parseFloat(cs.getPropertyValue(propMin)) || 0
  const maxBruto = parseFloat(cs.getPropertyValue(propMax))
  return [min, Number.isFinite(maxBruto) ? maxBruto : Infinity]
}

export interface WindowResize {
  onPointerDownBorda: (borda: BordaDeRedimensionar) => (event: ReactPointerEvent<HTMLElement>) => void
}

export function useWindowResize(key: WindowKey): WindowResize {
  const setWinPos = useUiStore((s) => s.setWinPos)

  const onPointerDownBorda = useCallback(
    (borda: BordaDeRedimensionar) => (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      const win = event.currentTarget.closest<HTMLElement>('[data-window]')
      if (!win) return
      event.preventDefault()
      // A alca de borda fica DENTRO da janela (`data-window`), mas nao deve
      // iniciar arrasto — sem isto o pointerdown vazaria pro handler de
      // arrastar da barra de titulo se a borda ficasse sobreposta a ela.
      event.stopPropagation()

      const rect = win.getBoundingClientRect()
      const startX = event.clientX
      const startY = event.clientY
      const startW = rect.width
      const startH = rect.height
      const startLeft = rect.left
      const startTop = rect.top

      const cs = getComputedStyle(win)
      const [minW, maxW] = limite(cs, 'min-width', 'max-width')
      const [minH, maxH] = limite(cs, 'min-height', 'max-height')

      function onMove(ev: globalThis.PointerEvent) {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY

        if (borda === 'right') {
          win!.style.width = `${Math.min(Math.max(startW + dx, minW), maxW)}px`
        } else if (borda === 'left') {
          const w = Math.min(Math.max(startW - dx, minW), maxW)
          win!.style.width = `${w}px`
          // `startW - w` e o quanto a largura REALMENTE mudou depois do
          // clamp — usar `dx` puro aqui deixaria a janela "escorregar" sem
          // encolher mais assim que batesse no minimo/maximo.
          setWinPos(key, { x: Math.max(startLeft + (startW - w), EDGE_MARGIN), y: startTop })
        } else if (borda === 'bottom') {
          win!.style.height = `${Math.min(Math.max(startH + dy, minH), maxH)}px`
        } else {
          const h = Math.min(Math.max(startH - dy, minH), maxH)
          win!.style.height = `${h}px`
          setWinPos(key, { x: startLeft, y: Math.max(startTop + (startH - h), EDGE_MARGIN) })
        }
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    },
    [key, setWinPos],
  )

  return { onPointerDownBorda }
}
