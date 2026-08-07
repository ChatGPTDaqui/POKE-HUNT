// Botao Auto (pilula, canto inferior direito) + badge com as bolas que o bot
// esta usando + a janela flutuante de automacoes.
//
// A janela e FLUTUANTE de proposito e nao passa pelo backdrop das telas de
// menu: o pedido original era poder ver o campo de batalha enquanto mexe nas
// automacoes. Por isso ela vive em z-40 (acima do painel de menu) sem escurecer
// nada atras.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Robot, X } from '@phosphor-icons/react'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore, useBreakpoints } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { GameIconButton } from '@/components/game/controls'
import { AutoPanel } from './AutoPanel'
import { cn } from '@/lib/utils'

// Contagens ao vivo so dos itens que o bot pode de fato usar agora — bola
// padrao, bola shiny (se o toggle estiver ligado) e a bola de cada regra por
// especie, deduplicado. De proposito NAO e o inventario inteiro (estouraria o
// cantinho da tela).
function AutoItemBadge() {
  const autoToggles = useGameStateStore((s) => s.autoToggles)
  const autoCatchConfig = useGameStateStore((s) => s.autoCatchConfig)
  const autoCatchRules = useGameStateStore((s) => s.autoCatchRules)
  const items = useGameStateStore((s) => s.items)

  if (!autoToggles.autoCatch) return null

  const activeIds = new Set<string>()
  if (autoCatchConfig.ballId) activeIds.add(autoCatchConfig.ballId)
  if (autoCatchConfig.catchShinyEnabled && autoCatchConfig.shinyBallId) activeIds.add(autoCatchConfig.shinyBallId)
  for (const rule of autoCatchRules) {
    if (rule.ballItemId) activeIds.add(rule.ballItemId)
  }
  if (activeIds.size === 0) return null

  return (
    <div className="hud-surface flex flex-col gap-[.15em] rounded-lg border border-n800 px-[.7em] py-[.4em] text-[.72em] shadow-lg">
      {[...activeIds].map((itemId) => {
        const item = getItem(itemId)
        if (!item) return null
        const iconUrl = itemIconUrl(itemId)
        return (
          <div key={itemId} className="flex items-center gap-[.4em]">
            {iconUrl && <img src={iconUrl} alt="" className="h-[1.2em] w-[1.2em] object-contain" />}
            <span className="truncate text-n300">
              {item.name} <b className="font-medium text-n100">x{items[itemId] ?? 0}</b>
            </span>
          </div>
        )
      })}
    </div>
  )
}

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
      <AutoItemBadge />
    </div>
  )
}

export function AutoWindow() {
  const open = useUiStore((s) => s.autoOpen)
  const setOpen = useUiStore((s) => s.setAutoOpen)
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
    : { right: '.9em', bottom: colStack ? '14.2em' : '10.5em' }

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
