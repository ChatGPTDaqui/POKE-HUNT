import { useLayoutEffect, useRef, useState } from 'react'

/**
 * A fileira rolavel ainda tem conteudo escondido a direita? Mede de verdade
 * (scrollWidth, posicao da rolagem e mudanca de tamanho) para o degrade de
 * "tem mais pra la" aparecer so quando ha o que rolar — no celular o menu
 * inferior escondia Social e Mais sem nenhum sinal (auditoria dos menus,
 * 26/11/2026).
 */
export function useTransborda<T extends HTMLElement>(ativo = true) {
  const ref = useRef<T | null>(null)
  const [transborda, setTransborda] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !ativo) { setTransborda(false); return }
    const medir = () => setTransborda(el.scrollWidth - el.clientWidth - el.scrollLeft > 2)
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    return () => { el.removeEventListener('scroll', medir); ro?.disconnect() }
  }, [ativo])
  return [ref, transborda] as const
}
