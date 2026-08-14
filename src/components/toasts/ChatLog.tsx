// Janela de chat/log retratil, canto inferior esquerdo.
//
// Quatro abas, e a divisao entre elas nao e cosmetica:
//   Mundo    — mensagens de OUTROS JOGADORES (rede, chatStore). Unica que
//              aceita digitacao.
//   Sistema  — avisos do jogo pro jogador (o antigo canal `world`).
//   Comercio — resultado de compra/venda.
//   Log      — combate.
//
// Ela se posiciona sozinha (em vez de o GameShell posiciona-la) porque a
// posicao depende de estado que so ela conhece: aberta/fechada muda a altura, e
// arrastar substitui o ancoramento inteiro. Largura e ancoragem vertical
// respondem a dois breakpoints diferentes — em <1180 ela estreita pra nao
// encostar no menu central, e em <780 ela sobe pra cima do menu inferior.
import { useEffect, useRef, type CSSProperties } from 'react'
import { Minus, PaperPlaneRight, Plus } from '@phosphor-icons/react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { useChatStore } from '@/stores/chatStore'
import { useUiStore, useBreakpoints, type ChatTab } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import type { AnexoChat } from '@/data/remote/servidor'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TextoComRealce } from '@/components/shared/TextoComRealce'
import { cn } from '@/lib/utils'

const TABS: { key: ChatTab; label: string }[] = [
  { key: 'mundo', label: 'Mundo' },
  { key: 'sistema', label: 'Sistema' },
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

const SEM_LINHAS: never[] = []

function horaDe(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Um link de item/POKE dentro de uma mensagem.
 *
 * O conteudo vem do SNAPSHOT gravado junto da mensagem, nunca de uma consulta
 * por id — ver a nota em server/src/social.ts#saneiaAnexos. Na pratica: o link
 * continua mostrando o que o autor mostrou, mesmo que o POKE ja tenha sido
 * vendido.
 */
function LinkAnexo({ anexo }: { anexo: AnexoChat }) {
  const cor = anexo.kind === 'poke'
    ? (RARITIES[(anexo.rarity ?? 'comum') as RarityKey]?.color ?? 'var(--color-n300)')
    : 'var(--color-gold)'
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="cursor-help rounded-[.3em] border px-[.3em] whitespace-nowrap"
            style={{ borderColor: cor, color: cor }}
          />
        }
      >
        {anexo.kind === 'poke'
          ? `${anexo.isShiny ? '✨' : ''}${anexo.nome} Lv${anexo.level ?? 1}`
          : `${anexo.nome}${anexo.quantidade ? ` x${anexo.quantidade}` : ''}`}
      </TooltipTrigger>
      <TooltipContent className="bg-popover text-popover-foreground">
        {anexo.kind === 'poke' ? (
          <div className="flex flex-col gap-[.15em] text-[.95em]">
            <b>{anexo.isShiny ? '✨ ' : ''}{anexo.nome}</b>
            <span>Nivel {anexo.level ?? 1}</span>
            <span style={{ color: cor }}>{RARITIES[(anexo.rarity ?? 'comum') as RarityKey]?.label ?? anexo.rarity}</span>
            <span>IV medio {anexo.ivPercent ?? 0}%</span>
          </div>
        ) : (
          <div className="flex flex-col gap-[.15em] text-[.95em]">
            <b>{anexo.nome}</b>
            <span>Quantidade mostrada: {anexo.quantidade ?? 0}</span>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

function AbaMundo() {
  const mensagens = useChatStore((s) => s.mensagens)
  const rascunho = useChatStore((s) => s.rascunho)
  const setRascunho = useChatStore((s) => s.setRascunho)
  const enviar = useChatStore((s) => s.enviar)
  const carregando = useChatStore((s) => s.carregando)
  const erro = useChatStore((s) => s.erro)
  const iniciarAoVivo = useChatStore((s) => s.iniciarAoVivo)
  const fimRef = useRef<HTMLDivElement>(null)

  useEffect(() => iniciarAoVivo(), [iniciarAoVivo])
  useEffect(() => { fimRef.current?.scrollIntoView({ block: 'end' }) }, [mensagens])

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-[.25em] overflow-auto px-[.55em] pt-[.3em] pb-[.3em] text-[.76em]">
        {mensagens.length === 0 ? (
          <div className="text-n500">Ninguem falou nada ainda. Diga oi.</div>
        ) : (
          mensagens.map((m) => (
            <div key={m.id} className="break-words">
              <span className="text-n600">{horaDe(m.created_at)} </span>
              <b className="text-n200">{m.trainer_name}: </b>
              <span className="text-n300">{m.body}</span>
              {m.anexos?.length > 0 && (
                <span className="ml-[.3em] inline-flex flex-wrap gap-[.25em]">
                  {m.anexos.map((a, i) => <LinkAnexo key={`${m.id}-${i}`} anexo={a} />)}
                </span>
              )}
            </div>
          ))
        )}
        <div ref={fimRef} />
      </div>

      {erro && <div className="px-[.55em] pb-[.2em] text-[.7em] text-bad">{erro}</div>}

      <form
        className="flex shrink-0 items-center gap-[.3em] border-t border-n800 px-[.5em] py-[.4em]"
        onSubmit={(e) => { e.preventDefault(); void enviar() }}
      >
        <input
          name="chat-mundo"
          value={rascunho}
          maxLength={240}
          placeholder="Falar no mundo (Shift+clique num item/POKE pra linkar)"
          onChange={(e) => setRascunho(e.target.value)}
          className="min-w-0 flex-1 rounded-[.4em] border border-n700 bg-n900 px-[.5em] py-[.3em] font-[inherit] text-[.76em] text-foreground placeholder:text-n600 focus-visible:border-n500 focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={carregando || !rascunho.trim()}
          aria-label="Enviar"
          className="flex h-[1.8em] w-[1.8em] shrink-0 cursor-pointer items-center justify-center rounded-[.4em] border border-n700 text-n300 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PaperPlaneRight />
        </button>
      </form>
    </>
  )
}

export function ChatLog() {
  const activeTab = useUiStore((s) => s.chatTab)
  const setActiveTab = useUiStore((s) => s.setChatTab)
  const open = useUiStore((s) => s.chatOpen)
  const setOpen = useUiStore((s) => s.setChatOpen)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const chatLines = useToastStore((s) => s.chatLines)
  const { narrow, colStack, chatNarrow } = useBreakpoints()
  const { pos, onPointerDown } = useWindowDrag('chat')
  const linesRef = useRef<HTMLDivElement>(null)

  // Constante compartilhada, e nao `[]` inline: um literal novo a cada render
  // faria o efeito de auto-scroll abaixo rodar em TODO render (a aba "Mundo"
  // tem o proprio scroll, esta lista nem existe la).
  const lines = activeTab === 'mundo' ? SEM_LINHAS : chatLines[activeTab]

  // Rola pro fim sempre que chegar linha nova na aba visivel.
  useEffect(() => {
    const el = linesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  // O chat ganhou uma aba a mais e um campo de digitacao: nas larguras onde ele
  // ja era estreito, 4 abas em `13em` quebravam em duas fileiras e comiam a
  // area de leitura.
  const width = narrow ? '16.5em' : chatNarrow ? '15em' : '21em'
  // Abaixo de 780px o menu do rodape se aproxima do chat (canto inferior
  // esquerdo) e cresce em fileiras. Em vez de um offset `em` chutado (que ja
  // deixou a barra de golpes por baixo do chat em 390px, mesmo depois de
  // ajustada a mao duas vezes), o chat sobe pela altura REAL do rodape, medida
  // no HudLayer. Acima de 780px o rodape e uma fileira central estreita, longe
  // do chat, entao ele fica colado embaixo. O fallback so vale ate a primeira
  // medida chegar.
  const bottom = colStack
    ? footerHeight ? `calc(${footerHeight}px + .8em)` : (narrow ? '13.5em' : '10.6em')
    : '.8em'
  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, width }
    : { left: '.8em', bottom, width }

  return (
    <div
      data-window="chat"
      style={{ ...style, height: open ? '21em' : 'auto' }}
      className={cn(
        'hud-surface pointer-events-auto absolute z-[21] flex max-h-[72vh] max-w-[min(28em,94vw)] min-w-[12em]',
        'flex-col overflow-hidden rounded-xl border border-n800 shadow-lg',
        open && 'resize',
      )}
    >
      <div
        onPointerDown={onPointerDown}
        className="win-drag-handle flex shrink-0 flex-wrap items-center gap-[.25em] px-[.45em] py-[.35em]"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'cursor-pointer rounded-[.5em] px-[.55em] py-[.28em] font-[inherit] text-[.74em]',
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

      {open && (activeTab === 'mundo' ? (
        <AbaMundo />
      ) : (
        <div
          ref={linesRef}
          className="flex min-h-0 flex-1 flex-col gap-[.25em] overflow-auto px-[.55em] pt-[.3em] pb-[.6em] text-[.76em]"
        >
          {lines.length === 0 ? (
            <div className="text-n500">Nada por aqui ainda.</div>
          ) : (
            lines.map((line) => (
              <div key={line.id} style={{ color: TYPE_COLOR[line.type] ?? TYPE_COLOR.info }}>
                <TextoComRealce texto={line.message} realce={line.realce} />
              </div>
            ))
          )}
        </div>
      ))}
    </div>
  )
}
