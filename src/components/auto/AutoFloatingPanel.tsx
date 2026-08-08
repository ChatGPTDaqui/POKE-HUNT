// Botao Auto (pilula, canto inferior direito) + badge com as bolas que o bot
// esta usando + a janela flutuante de automacoes.
//
// A janela e FLUTUANTE de proposito e nao passa pelo backdrop das telas de
// menu: o pedido original era poder ver o campo de batalha enquanto mexe nas
// automacoes. Por isso ela vive em z-40 (acima do painel de menu) sem escurecer
// nada atras.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Robot, X } from '@phosphor-icons/react'
import { useUiStore, useBreakpoints } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { GameIconButton } from '@/components/game/controls'
import { AutoPanel } from './AutoPanel'
import { cn } from '@/lib/utils'

// O badge de contagem de bolas que ficava logo ABAIXO do botao "auto" foi
// removido (pedido explicito do usuario, limpeza de interface). A informacao nao
// se perdeu: as mesmas contagens aparecem ao lado de cada `<select>` de item
// DENTRO do painel Auto (`AutoPanel`, `.item-count-badge`), que e onde o jogador
// esta quando essa informacao importa. Fora dali era um bloco permanente sobre o
// campo de batalha repetindo dado que ninguem estava olhando.

export function AutoButton() {
  const open = useUiStore((s) => s.autoOpen)
  const setOpen = useUiStore((s) => s.setAutoOpen)

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-[.4em]">
      <button
        type="button"
        title="Automacoes"
        data-auto-toggle
        onClick={() => setOpen(!open)}
        className={cn(
          'hud-surface flex cursor-pointer items-center gap-[.5em] rounded-full border px-[1em] py-[.5em]',
          'font-[inherit] text-[.9em] shadow-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
          open ? 'border-primary text-n100' : 'border-n700 text-foreground hover:border-primary',
        )}
      >
        <Robot className="text-[1.25em]" />
        auto
      </button>
    </div>
  )
}

export function AutoWindow() {
  const open = useUiStore((s) => s.autoOpen)
  const setOpen = useUiStore((s) => s.setAutoOpen)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const { colStack } = useBreakpoints()
  const { pos, onPointerDown } = useWindowDrag('auto')
  const ref = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora. Registrado no proximo tick pra que o mesmo clique que
  // abriu o painel (borbulhando do botao) nao o feche na hora.
  useEffect(() => {
    if (!open) return
    let armado = false
    const timer = setTimeout(() => {
      armado = true
    }, 0)
    function onDown(e: MouseEvent) {
      if (!armado) return
      const target = e.target as HTMLElement
      if (ref.current?.contains(target)) return
      // O proprio botao ja alterna: sem esta excecao, clicar nele com o painel
      // aberto fecharia (aqui) e reabriria (no onClick) no mesmo gesto.
      if (target.closest('[data-auto-toggle]')) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onDown, true)
    }
  }, [open, setOpen])

  if (!open) return null

  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { right: '.9em', bottom: colStack ? (footerHeight ? `calc(${footerHeight}px + 4.2em)` : '14.2em') : '10.5em' }

  return (
    <div
      ref={ref}
      data-window="auto"
      style={style}
      className="pointer-events-auto absolute z-40 flex max-h-[72vh] max-w-[85vw] min-h-[9em] w-[19em] min-w-[15em] resize flex-col overflow-hidden rounded-xl border border-n700 bg-background/95 shadow-2xl backdrop-blur-md"
    >
      <div
        onPointerDown={onPointerDown}
        className="win-drag-handle flex shrink-0 items-center justify-between border-b border-n800 px-[.8em] py-[.55em]"
      >
        <span className="text-[.9em] font-medium">Automacoes</span>
        <GameIconButton variant="ghost" onClick={() => setOpen(false)} aria-label="Fechar">
          <X />
        </GameIconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-[.8em]">
        <AutoPanel />
      </div>
    </div>
  )
}
