import { useEffect, useRef, type RefObject } from 'react'

/**
 * Observa a altura de um elemento e devolve ao chamador a cada mudanca.
 *
 * Duas superficies da HUD sao medidas ao vivo (o rodape inteiro e a barra de
 * navegacao) porque a altura delas depende do regime, do numero de golpes do
 * POKE e do `hudScale` — nenhuma constante em `em` fecha os tres eixos. Estava
 * escrito duas vezes; virou hook na segunda.
 */
export function useMedirAltura(
  ref: RefObject<HTMLElement | null>,
  aoMedir: (altura: number) => void,
): void {
  // O callback entra por ref pra nao remontar o observer quando o chamador
  // passa uma funcao nova a cada render.
  const cb = useRef(aoMedir)
  cb.current = aoMedir

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => cb.current(el.getBoundingClientRect().height))
    ro.observe(el)
    cb.current(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [ref])
}
