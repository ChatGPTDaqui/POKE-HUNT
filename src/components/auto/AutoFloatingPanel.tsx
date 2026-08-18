// Botao Auto (pilula, canto inferior direito) + badge com as bolas que o bot
// esta usando + a janela flutuante de automacoes.
//
// A janela e FLUTUANTE de proposito e nao passa pelo backdrop das telas de
// menu: o pedido original era poder ver o campo de batalha enquanto mexe nas
// automacoes. Por isso ela vive em z-40 (acima do painel de menu) sem escurecer
// nada atras.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Robot, Storefront, Warning, X } from '@phosphor-icons/react'
import { useUiStore, useBreakpoints } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { GameIconButton } from '@/components/game/controls'
import { AutoPanel } from './AutoPanel'
import { useEstoqueBaixoNoAuto, LIMIAR_ESTOQUE_BAIXO } from './estoqueBaixo'
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
  // O alerta tambem vive AQUI, e nao so nos badges dentro do painel: o painel
  // fica fechado quase o tempo todo, e um aviso de "as bolas estao acabando"
  // que so aparece depois de abrir o painel chega tarde demais pra servir.
  const estoqueBaixo = useEstoqueBaixoNoAuto()

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-[.4em]">
      <button
        type="button"
        title={estoqueBaixo ? `Automacoes — um consumivel em uso esta abaixo de ${LIMIAR_ESTOQUE_BAIXO}` : 'Automacoes'}
        data-auto-toggle
        onClick={() => setOpen(!open)}
        className={cn(
          'hud-surface flex cursor-pointer items-center gap-[.5em] rounded-full border px-[.7em] py-[.5em]',
          'font-[inherit] text-[.9em] shadow-lg transition-colors',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
          open ? 'border-primary text-n100' : 'border-n700 text-foreground hover:border-primary',
          estoqueBaixo && 'animate-pulse-alerta border-bad text-bad',
        )}
      >
        <Robot className="text-[1.25em]" />
        auto
        {estoqueBaixo && <Warning className="text-[1.1em]" weight="fill" />}
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
    function onDown(e: PointerEvent) {
      if (!armado) return
      const target = e.target as HTMLElement
      if (ref.current?.contains(target)) return
      // O proprio botao ja alterna: sem esta excecao, clicar nele com o painel
      // aberto fecharia (aqui) e reabriria (no onClick) no mesmo gesto.
      if (target.closest('[data-auto-toggle]')) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', onDown, true)
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
        className="win-drag-handle flex shrink-0 items-center justify-between border-b border-n800 px-[.6em] py-[.55em]"
      >
        <span className="text-[.9em] font-medium">Automacoes</span>
        <span className="flex items-center gap-[.3em]">
          {/* Atalho pra Loja (pedido explicito): a decisao "estou sem Poke Ball"
              nasce olhando as contagens DESTE painel, e ate agora exigia fechar
              tudo e procurar a Loja no menu. Fecha o painel junto porque a Loja
              abre por cima dele e um painel escondido atras de outro so atrapalha
              o clique-fora. */}
          <GameIconButton
            variant="ghost"
            title="Comprar itens na Loja"
            aria-label="Comprar itens na Loja"
            onClick={() => {
              setOpen(false)
              useUiStore.getState().openScreen('loja')
            }}
          >
            <Storefront />
          </GameIconButton>
          <GameIconButton variant="ghost" onClick={() => setOpen(false)} aria-label="Fechar">
            <X />
          </GameIconButton>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-[.6em]">
        <AutoPanel />
      </div>
    </div>
  )
}
