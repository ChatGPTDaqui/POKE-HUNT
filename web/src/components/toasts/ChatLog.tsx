// Port de js/ui/panels/ChatLog.js — janela flutuante colapsavel com 3 abas.
// O roteamento canal -> aba (combat->log, trade->trade, world->world) e o cap
// de 60 linhas ja vivem no toastStore; aqui e so a apresentacao.
import { useEffect, useRef, useState } from 'react'
import { useToastStore, type ChatTab, type ToastType } from '@/stores/toastStore'
import { useDraggable } from '@/hooks/useDraggable'
import { cn } from '@/lib/utils'

const TABS: { key: ChatTab; label: string }[] = [
  { key: 'world', label: 'Mundo' },
  { key: 'trade', label: 'Comercio' },
  { key: 'log', label: 'Log' },
]

const TYPE_CLASS: Partial<Record<ToastType, string>> = {
  gold: 'text-amber-300',
  levelup: 'text-sky-300',
  success: 'text-emerald-300',
  error: 'text-destructive',
  'capture-success': 'text-emerald-300',
  'capture-fail': 'text-orange-300',
}

export function ChatLog() {
  const [activeTab, setActiveTab] = useState<ChatTab>('world')
  const [collapsed, setCollapsed] = useState(false)
  const lines = useToastStore((s) => s.chatLines[activeTab])
  const { elementRef, handleRef } = useDraggable<HTMLDivElement, HTMLDivElement>()
  const linesRef = useRef<HTMLDivElement>(null)

  // Rola pro fim sempre que chegar linha nova na aba visivel — mesma
  // conveniencia do `_renderLines` original.
  useEffect(() => {
    const el = linesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div
      ref={elementRef}
      className="pointer-events-auto w-72 overflow-hidden rounded-lg border bg-background/90 text-xs shadow-lg backdrop-blur-sm"
    >
      <div ref={handleRef} className="flex cursor-move items-center justify-between border-b px-1.5 py-1">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px]',
                activeTab === tab.key ? 'bg-accent font-medium' : 'text-muted-foreground hover:bg-accent/50',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent/50"
        >
          {collapsed ? '+' : '−'}
        </button>
      </div>

      {!collapsed && (
        <div ref={linesRef} className="max-h-40 space-y-0.5 overflow-y-auto px-2 py-1.5">
          {lines.length === 0 ? (
            <div className="text-muted-foreground">Nada por aqui ainda.</div>
          ) : (
            lines.map((line) => (
              <div key={line.id} className={TYPE_CLASS[line.type]}>
                {line.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
