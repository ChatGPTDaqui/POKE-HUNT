// Port de js/ui/draggable.js — comportamento de arrastar compartilhado por
// toda janela flutuante (telas de menu, perfil de POKE, relatorio de Farm
// Offline, painel Auto...). `elementRef` vai no container que se move,
// `handleRef` vai em qualquer filho que deve iniciar o arrasto (mesmo
// elemento que `elementRef` se so um ref for usado).
import { useEffect, useRef, type RefObject } from 'react'

const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, .no-drag'

export function useDraggable<E extends HTMLElement = HTMLDivElement, H extends HTMLElement = E>(): {
  elementRef: RefObject<E | null>
  handleRef: RefObject<H | null>
} {
  const elementRef = useRef<E>(null)
  const handleRef = useRef<H>(null)

  useEffect(() => {
    const el = elementRef.current
    const handle = handleRef.current ?? el
    if (!el || !handle) return

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if ((e.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return
      if (!el) return

      const rect = el.getBoundingClientRect()
      el.style.position = 'fixed'
      el.style.left = `${rect.left}px`
      el.style.top = `${rect.top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.margin = '0'
      el.style.transform = 'none'

      const startX = e.clientX
      const startY = e.clientY
      const origLeft = rect.left
      const origTop = rect.top
      e.preventDefault()

      function onMove(ev: MouseEvent) {
        if (!el) return
        el.style.left = `${origLeft + (ev.clientX - startX)}px`
        el.style.top = `${origTop + (ev.clientY - startY)}px`
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    handle.addEventListener('mousedown', onMouseDown)
    return () => handle.removeEventListener('mousedown', onMouseDown)
  }, [])

  return { elementRef, handleRef }
}
