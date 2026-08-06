// Port de js/ui/panels/autoFloatingPanel.js + o badge de itens ativos de
// AutoButtonBadge.js. E um painel FLUTUANTE de proposito (nao uma tela do
// uiStore): o pedido original era poder ver o campo de batalha enquanto mexe
// nas automacoes, entao ele nao passa pelo overlay que escurece o jogo.
import { useEffect, useRef, useState } from 'react'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useDraggable } from '@/hooks/useDraggable'
import { AutoPanel } from './AutoPanel'
import { Button } from '@/components/ui/button'

// Contagens ao vivo so dos itens que o bot pode de fato usar agora — bola
// padrao, bola shiny (se o toggle estiver ligado) e a bola de cada regra por
// especie, deduplicado. De proposito NAO e o inventario inteiro (estouraria o
// painelzinho do canto).
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
    <div className="pointer-events-auto w-40 space-y-0.5 rounded-lg border bg-background/85 px-2.5 py-1.5 text-[11px] shadow-lg backdrop-blur-sm">
      {[...activeIds].map((itemId) => {
        const item = getItem(itemId)
        if (!item) return null
        const iconUrl = itemIconUrl(itemId)
        return (
          <div key={itemId} className="flex items-center gap-1.5">
            {iconUrl && <img src={iconUrl} alt={item.name} className="h-4 w-4 object-contain" />}
            <span className="truncate">
              {item.name} x{items[itemId] ?? 0}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function AutoFloatingPanel() {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const { elementRef, handleRef } = useDraggable<HTMLDivElement, HTMLDivElement>()

  // Fecha ao clicar fora. O listener e registrado no proximo tick pra que o
  // mesmo clique que abriu o painel (borbulhando do botao) nao o feche na
  // hora — mesma razao do setTimeout(…, 0) no original.
  useEffect(() => {
    if (!open) return
    let active = false
    const timer = setTimeout(() => {
      active = true
    }, 0)
    function onMouseDown(e: MouseEvent) {
      if (!active) return
      const target = e.target as Node
      if (elementRef.current?.contains(target)) return
      if (buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [open, elementRef])

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        <Button
          ref={buttonRef}
          variant="outline"
          className="pointer-events-auto h-10 px-5 text-xl"
          onClick={() => setOpen((o) => !o)}
          title="Automacoes"
        >
          🤖
        </Button>
        <AutoItemBadge />
      </div>

      {open && (
        <div
          ref={elementRef}
          className="pointer-events-auto fixed bottom-24 left-4 z-40 w-72 overflow-hidden rounded-lg border bg-background/95 shadow-xl backdrop-blur-sm"
        >
          <div ref={handleRef} className="flex cursor-move items-center justify-between border-b px-2 py-1">
            <span className="text-xs font-medium">Automacoes</span>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setOpen(false)}>
              ✕
            </Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2.5">
            <AutoPanel />
          </div>
        </div>
      )}
    </>
  )
}
