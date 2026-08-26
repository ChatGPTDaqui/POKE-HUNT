// Publica a caixa de um elemento da HUD como ancora nomeada da camada de VFX
// (PH-190).
//
// Existe pra a camada mirar em elemento de React sem conhece-lo: o voo de ouro
// (PH-191) termina na Carteira, que e um `<span>` dentro do `StatusRail`.
//
// Mesmo padrao de `useMedirAltura` — `ResizeObserver` no elemento, callback por
// ref — com duas diferencas que importam:
//
//  - publica a CAIXA inteira (`DOMRect`), nao so a altura: a camada precisa de
//    x e y pra mirar.
//  - escuta `scroll` e `resize` da janela tambem. `ResizeObserver` dispara
//    quando o elemento muda de TAMANHO, e nao quando ele muda de LUGAR sem
//    mudar de tamanho — que e o caso mais comum aqui (um vizinho `shrink-0`
//    aparece no trilho e empurra a Carteira pro lado). Sem isso a ancora fica
//    apontando pro lugar antigo, e o efeito erra o alvo em silencio.
import { useEffect, useRef, type RefObject } from 'react'
import { definirAncora } from '@/render/camadaVfx'

export function useAncoraDeVfx(nome: string, ref: RefObject<HTMLElement | null>): void {
  const nomeRef = useRef(nome)
  nomeRef.current = nome

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publicar = () => definirAncora(nomeRef.current, el.getBoundingClientRect())
    publicar()

    const ro = new ResizeObserver(publicar)
    ro.observe(el)
    // O trilho e a doca sao `absolute` na tela e nao rolam, mas o listener e
    // barato e cobre o caso de a camada ser usada por um elemento dentro de
    // painel que rola.
    window.addEventListener('resize', publicar)
    window.addEventListener('scroll', publicar, { capture: true, passive: true })

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', publicar)
      window.removeEventListener('scroll', publicar, { capture: true })
      // Limpa ao desmontar: ancora apontando pra elemento que saiu da arvore
      // faria o efeito mirar num retangulo congelado.
      definirAncora(nomeRef.current, null)
    }
  }, [ref])
}

/**
 * Nomes das ancoras, num lugar so.
 *
 * String solta nos dois lados (quem publica e quem consome) e erro de digitacao
 * que falha em silencio: `centroDaAncora` devolve `null` e o efeito
 * simplesmente nao acontece, sem nada dizendo por que.
 */
export const ANCORA = {
  /** A Carteira do trilho de status (ouro + diamantes). Destino do PH-191. */
  carteira: 'carteira',
} as const
