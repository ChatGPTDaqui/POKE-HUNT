// Arrastar janelas flutuantes (paineis, perfil, relatorio offline, Auto, chat).
//
// Substitui o antigo hooks/useDraggable.ts, que escrevia `position/left/top`
// direto no style do node. Aquele desenho tinha um defeito estrutural: a
// posicao morava no DOM, entao nada mais no app sabia dela — e a regra
// "redimensionar a janela reseta as posicoes customizadas" (sem a qual uma
// janela arrastada pro canto de uma tela larga fica inalcancavel quando ela
// encolhe) nao tinha onde ser aplicada. Agora a posicao vive no uiStore, que
// limpa tudo no resize.
//
// `pointer*` em vez de `mouse*`: os mesmos handlers cobrem toque e caneta. A
// alca precisa de `touch-action: none` (classe `.win-drag-handle`), senao o
// navegador trata o gesto como rolagem e o `pointermove` nunca chega.
import { useCallback, type PointerEvent as ReactPointerEvent } from 'react'
import { useUiStore, type WindowKey } from '@/stores/uiStore'

// Cliques em controle NAO iniciam arrasto: a barra de titulo tambem carrega o
// botao de fechar e (no chat) as abas.
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a, label, .no-drag'

// Folga minima que sobra visivel ao soltar a janela. Serve pra barra de titulo
// nunca sair inteira da tela — se sair, nao ha mais como pegar a janela.
const EDGE_MARGIN = 2
const MIN_VISIBLE_X = 70
const MIN_VISIBLE_Y = 40

export interface WindowDrag {
  /** Posicao custom, ou null quando a janela ainda esta no lugar padrao. */
  pos: { x: number; y: number } | null
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
}

export function useWindowDrag(key: WindowKey): WindowDrag {
  const pos = useUiStore((s) => s.winPos[key] ?? null)
  const setWinPos = useUiStore((s) => s.setWinPos)

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return

      // O elemento arrastado e a JANELA, nao a alca: a alca e sempre um filho
      // dela, e e a janela que precisa ser posicionada.
      const win = event.currentTarget.closest<HTMLElement>('[data-window]')
      if (!win) return

      const rect = win.getBoundingClientRect()
      const grabX = event.clientX - rect.left
      const grabY = event.clientY - rect.top
      event.preventDefault()

      // Primeiro `setWinPos` acontece ja no pointerdown: ele troca a janela do
      // posicionamento padrao (centralizado via transform) pro absoluto em
      // px. Sem isso o primeiro pointermove daria um salto do centro pro
      // ponto do cursor.
      setWinPos(key, { x: rect.left, y: rect.top })

      function onMove(ev: globalThis.PointerEvent) {
        const x = Math.min(Math.max(ev.clientX - grabX, EDGE_MARGIN), window.innerWidth - MIN_VISIBLE_X)
        const y = Math.min(Math.max(ev.clientY - grabY, EDGE_MARGIN), window.innerHeight - MIN_VISIBLE_Y)
        setWinPos(key, { x, y })
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      // `pointercancel` cobre o caso do sistema roubar o gesto (chamada
      // entrando no celular, gesto de sistema): sem ele o listener de move
      // ficaria vivo pra sempre e a janela grudaria no dedo.
      window.addEventListener('pointercancel', onUp)
    },
    [key, setWinPos],
  )

  return { pos, onPointerDown }
}
