import { useEffect, useRef } from 'react'
import { Flag } from '@phosphor-icons/react'
import { CartaoDoPasso } from '@/features/primeirosPassos/CartaoDoPasso'
import { FaixaDePremios } from '@/features/primeirosPassos/FaixaDePremios'

/** Informações de planejamento só ocupam o campo quando solicitadas. */
export function JornadaNaHud() {
  const raiz = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function fecharFora(event: PointerEvent) {
      if (raiz.current && !raiz.current.contains(event.target as Node)) raiz.current.open = false
    }
    document.addEventListener('pointerdown', fecharFora)
    return () => document.removeEventListener('pointerdown', fecharFora)
  }, [])

  return <details ref={raiz} className="journey-hud-agenda pointer-events-auto relative min-w-0 self-start"
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
        event.stopPropagation()
      }
    }}>
    <summary className="journey-field-chip flex min-h-[44px] cursor-pointer list-none items-center gap-[.35em] rounded-[.5em] px-[.6em] text-[.72em]">
      <Flag aria-hidden /> Objetivos
    </summary>
    <div data-appearance="journey" className="journey-hud-agenda-content absolute left-0 top-full z-30 mt-[4px] max-h-[50dvh] w-[min(24em,calc(100vw-120px))] overflow-y-auto rounded-[.65em] border border-menu-line bg-menu-paper p-[.4em] shadow-xl">
      <CartaoDoPasso />
      <FaixaDePremios />
    </div>
  </details>
}
