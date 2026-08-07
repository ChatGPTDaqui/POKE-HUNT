// Janela de chat/log retratil, canto inferior esquerdo. Abas Mundo/Comercio/Log.
// O roteamento canal -> aba (combat->log, trade->trade, world->world) e o cap de
// 60 linhas ja vivem no toastStore; aqui e so a apresentacao.
//
// Ela se posiciona sozinha (em vez de o GameShell posiciona-la) porque a
// posicao depende de estado que so ela conhece: aberta/fechada muda a altura, e
// arrastar substitui o ancoramento inteiro. Largura e ancoragem vertical
// respondem a dois breakpoints diferentes — em <1180 ela estreita pra nao
// encostar no menu central, e em <780 ela sobe pra cima do menu inferior.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Minus, Plus } from '@phosphor-icons/react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { useUiStore, useBreakpoints, type ChatTab } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { cn } from '@/lib/utils'

const TABS: { key: ChatTab; label: string }[] = [
  { key: 'world', label: 'Mundo' },
  { key: 'trade', label: 'Comercio' },
  { key: 'log', label: 'Log' },
]

const TYPE_COLOR: Record<ToastType, string> = {
  gold: 'var(--color-gold)',
  levelup: '#7dd3fc',
  success: 'var(--color-ok)',
  error: 'var(--color-bad)',
  'capture-success': 'var(--color-ok)',
  'capture-fail': 'var(--color-warn)',
  info: 'var(--color-n300)',
}

export function ChatLog() {
  const activeTab = useUiStore((s) => s.chatTab)
  const setActiveTab = useUiStore((s) => s.setChatTab)
  const open = useUiStore((s) => s.chatOpen)
  const setOpen = useUiStore((s) => s.setChatOpen)
  const lines = useToastStore((s) => s.chatLines[activeTab])
  const { narrow, colStack, chatNarrow } = useBreakpoints()
  const { pos, onPointerDown } = useWindowDrag('chat')
  const linesRef = useRef<HTMLDivElement>(null)

  // Rola pro fim sempre que chegar linha nova na aba visivel.
  useEffect(() => {
    const el = linesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const width = narrow ? '15em' : chatNarrow ? '13em' : '20em'
  // Quanto o chat precisa subir pra nao encostar no que ocupa o rodape:
  //  - acima de 780px ele fica colado embaixo, longe do menu central;
  //  - abaixo disso o menu se aproxima e ele sobe pra 10.6em;
  //  - em mobile os rotulos somem, o menu QUEBRA em duas fileiras e a barra de
  //    golpes fica logo acima dela — medido ao vivo em 492px, o rodape ocupa
  //    ~12.4em, entao 10.6em deixava o primeiro slot de golpe por baixo do
  //    chat. 13.5em cobre as duas fileiras com folga.
  const bottom = narrow ? '13.5em' : colStack ? '10.6em' : '.8em'
  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, width }
    : { left: '.8em', bottom, width }

  return (
    <div
      data-window="chat"
      style={{ ...style, height: open ? '19em' : 'auto' }}
      className={cn(
        'hud-surface pointer-events-auto absolute z-[21] flex max-h-[72vh] max-w-[min(26em,92vw)] min-w-[12em]',
        'flex-col overflow-hidden rounded-xl border border-n800 shadow-lg',
        open && 'resize',
      )}
    >
      <div
        onPointerDown={onPointerDown}
        className="win-drag-handle flex shrink-0 items-center gap-[.25em] px-[.45em] py-[.35em]"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'cursor-pointer rounded-[.5em] px-[.7em] py-[.28em] font-[inherit] text-[.78em]',
              activeTab === tab.key ? 'bg-n800 text-foreground' : 'text-n500 hover:bg-n800/60',
            )}
          >
            {tab.label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          title={open ? 'Recolher' : 'Expandir'}
          aria-label={open ? 'Recolher chat' : 'Expandir chat'}
          onClick={() => setOpen(!open)}
          className="flex h-[1.9em] w-[1.9em] cursor-pointer items-center justify-center rounded-[.4em] text-n300 hover:bg-n800"
        >
          {open ? <Minus /> : <Plus />}
        </button>
      </div>

      {open && (
        <div
          ref={linesRef}
          className="flex min-h-0 flex-1 flex-col gap-[.25em] overflow-auto px-[.7em] pt-[.3em] pb-[.6em] text-[.76em]"
        >
          {lines.length === 0 ? (
            <div className="text-n500">Nada por aqui ainda.</div>
          ) : (
            lines.map((line) => (
              <div key={line.id} style={{ color: TYPE_COLOR[line.type] ?? TYPE_COLOR.info }}>
                {line.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
