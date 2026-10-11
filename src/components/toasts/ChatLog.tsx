// Janela de chat/log retratil, canto inferior esquerdo.
//
// Três abas; avisos do sistema continuam no Log, sem uma quarta faixa.
//   Mundo    — mensagens de OUTROS JOGADORES (rede, chatStore). Unica que
//              aceita digitacao.
//   Comercio — resultado de compra/venda.
//   Log      — combate e avisos do jogo pro jogador.
//
// Ela se posiciona sozinha (em vez de o GameShell posiciona-la) porque a
// posicao depende de estado que so ela conhece: aberta/fechada muda a altura, e
// arrastar substitui o ancoramento inteiro. Largura e ancoragem vertical
// respondem a dois breakpoints diferentes — em <1180 ela estreita pra nao
// encostar no menu central, e em <780 ela sobe pra cima do menu inferior.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { ArrowsOutSimple, Minus, PaperPlaneRight, Plus } from '@phosphor-icons/react'
import { useToastStore, type ToastType } from '@/stores/toastStore'
import { useChatStore } from '@/stores/chatStore'
import { useUiStore, type ChatTab } from '@/stores/uiStore'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import type { AnexoChat } from '@/data/remote/servidor'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { Explicacao } from '@/components/shared/Explicacao'
import { TextoComRealce } from '@/components/shared/TextoComRealce'
import { usePedirAmizade } from '@/features/social/usePedirAmizade'
import { cn } from '@/lib/utils'

export const TABS: { key: ChatTab; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'mundo', label: 'Mundo' },
  { key: 'trade', label: 'Comércio' },
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
    <Explicacao
      className="cursor-help rounded-[.3em] border px-[.3em] whitespace-nowrap"
      estilo={{ borderColor: cor, color: cor }}
      conteudo={
        anexo.kind === 'poke' ? (
          <div className="flex flex-col gap-[.15em]">
            <b>{anexo.isShiny ? '✨ ' : ''}{anexo.nome}</b>
            <span>Nível {anexo.level ?? 1}</span>
            <span style={{ color: cor }}>{RARITIES[(anexo.rarity ?? 'comum') as RarityKey]?.label ?? anexo.rarity}</span>
            <span>IV medio {anexo.ivPercent ?? 0}%</span>
          </div>
        ) : (
          <div className="flex flex-col gap-[.15em]">
            <b>{anexo.nome}</b>
            <span>Quantidade mostrada: {anexo.quantidade ?? 0}</span>
          </div>
        )
      }
    >
      {anexo.kind === 'poke'
        ? `${anexo.isShiny ? '✨' : ''}${anexo.nome} Lv${anexo.level ?? 1}`
        : `${anexo.nome}${anexo.quantidade ? ` x${anexo.quantidade}` : ''}`}
    </Explicacao>
  )
}

/**
 * O nome de quem falou, clicavel pra pedir amizade (PH-214).
 *
 * A propria mensagem do jogador continua sendo um `<b>` inerte: pedir amizade a
 * si mesmo o servidor ja recusa, e oferecer seria fazer clicar pra descobrir o
 * obvio. Toda a regra (ja e amigo, pedido pendente, bloqueio, nick inexistente)
 * fica no servidor — ver o cabecalho de `usePedirAmizade`.
 */
function NomeNoChat({ nick }: { nick: string }) {
  const { pedir, enviando, souEu } = usePedirAmizade()
  if (souEu(nick)) return <b className="text-n200">{nick}: </b>
  return (
    <>
      <button
        type="button"
        title={`Adicionar ${nick} como amigo`}
        aria-label={`Adicionar ${nick} como amigo`}
        disabled={enviando}
        onClick={() => pedir(nick)}
        className="font-bold text-n200 hover:underline disabled:opacity-40"
      >
        {nick}
      </button>
      <b className="text-n200">: </b>
    </>
  )
}

export function AbaMundo() {
  const pontoGrosso = useUiStore((s) => s.coarsePointer)
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
          <div className="text-n500">Ninguém falou nada ainda. Diga oi.</div>
        ) : (
          mensagens.map((m) => (
            <div key={m.id} className="break-words">
              <span className="text-n600">{horaDe(m.created_at)} </span>
              {/* PH-214: o NOME e o gatilho de pedir amizade, e nao um icone ao
                  lado. Aqui ele ja e texto no meio de uma linha corrida, e
                  pendurar um icone em cada mensagem encheria o log de ruido. O
                  sublinhado ao passar o mouse e a unica pista que cabe sem
                  mudar o layout. */}
              {/* PH-548: a foto e pequena e em linha pra nao virar ruido no log. */}
              <AvatarDoTreinador userId={m.user_id} tamanho={1.1} className="mr-[.25em] align-[-.2em]" />
              <NomeNoChat nick={m.trainer_name} />
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
          // O "Shift+clique pra linkar" so existe com teclado; no celular era
          // uma instrucao morta ocupando a unica linha de dica do campo.
          placeholder={pontoGrosso ? 'Falar no mundo' : 'Falar no mundo (Shift+clique num item/POKE pra linkar)'}
          onChange={(e) => setRascunho(e.target.value)}
          // `jogo-campo`/`jogo-botao`: sao os ganchos do alvo minimo de toque
          // (index.css). Este par nao usa os primitivos do jogo — e um form
          // proprio — e por isso ficou de fora da varredura: no celular o campo
          // media 22px de altura, metade do minimo, no unico lugar do jogo em
          // que se digita.
          className="jogo-campo min-w-0 flex-1 rounded-[.4em] border border-n700 bg-n900 px-[.5em] py-[.3em] font-[inherit] text-[.76em] text-foreground placeholder:text-n600 focus-visible:border-n500 focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={carregando || !rascunho.trim()}
          aria-label="Enviar"
          className="jogo-botão jogo-botão-ícone flex h-[1.8em] w-[1.8em] shrink-0 cursor-pointer items-center justify-center rounded-[.4em] border border-n700 text-n300 hover:border-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PaperPlaneRight />
        </button>
      </form>
    </>
  )
}

/**
 * Lista de linhas de UMA aba (tudo menos "Mundo", que tem campo de digitacao e
 * fonte propria). Extraida da janela porque o chat do celular mostra o mesmo
 * conteudo dentro de um sheet — duas molduras, um corpo so.
 */
export function LinhasDaAba({ tab }: { tab: Exclude<ChatTab, 'mundo'> }) {
  const chatLines = useToastStore((s) => s.chatLines)
  // Avisos do sistema continuam visíveis, em ordem de chegada, junto ao Log.
  const lines = tab === 'log'
    ? [...chatLines.log, ...chatLines.sistema].sort((a, b) => a.seq - b.seq)
    : chatLines[tab]
  const linesRef = useRef<HTMLDivElement>(null)

  // Rola pro fim sempre que chegar linha nova.
  useEffect(() => {
    const el = linesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div
      ref={linesRef}
      className="flex min-h-0 flex-1 flex-col gap-[.25em] overflow-auto overscroll-contain px-[.55em] pt-[.3em] pb-[.6em] text-[.76em]"
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
  )
}

/** Mesmo comunicador no PC e no mobile; histórico e rascunho vivem nas stores. */
export function ChatLog({ embedded = false }: { embedded?: boolean }) {
  const activeTab = useUiStore((s) => s.chatTab)
  const setActiveTab = useUiStore((s) => s.setChatTab)
  const open = useUiStore((s) => s.chatOpen)
  const setOpen = useUiStore((s) => s.setChatOpen)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const { pos, onPointerDown } = useWindowDrag('chat')
  const [expanded, setExpanded] = useState(false)
  const tabAtual = activeTab === 'sistema' ? 'log' : activeTab
  const style: CSSProperties = embedded
    ? { position: 'relative', width: 'calc(100% - 56px)', height: expanded ? 'min(24em, 35dvh)' : 'min(10em, 24dvh)' }
    : {
        ...(pos ? { left: pos.x, top: pos.y } : { left: 0, bottom: footerHeight ? `calc(${footerHeight}px + .8em)` : '10.6em' }),
        ...(open ? { width: 'min(29em, 42vw)', height: expanded ? 'min(28em, 60dvh)' : '11em' } : {}),
      }

  return (
    <div data-window="chat" style={style}
      className={cn('journey-chat vidro-flutua pointer-events-auto z-[21] flex flex-col overflow-hidden',
        embedded && 'journey-chat-embedded',
        pos && !embedded ? 'rounded-xl' : 'rounded-r-xl',
        !embedded && 'absolute', open ? 'min-w-0' : 'w-fit')}>
      <div onPointerDown={embedded ? undefined : onPointerDown}
        className="journey-chat-header win-drag-handle">
        {open ? TABS.map((tab) => (
          <button key={tab.key} type="button" aria-pressed={tabAtual === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn('journey-chat-tab', tabAtual === tab.key && 'is-active')}>
            {tab.label}
          </button>
        )) : <span className="px-[.55em] text-[.8em]">Chat</span>}
        <span className="flex-1" />
        {open && <button type="button" aria-label={expanded ? 'Reduzir chat' : 'Ampliar chat'}
          title={expanded ? 'Reduzir chat' : 'Ampliar chat'} onClick={() => setExpanded(!expanded)}
          className="journey-chat-control"><ArrowsOutSimple aria-hidden /></button>}
        <button type="button" title={open ? 'Recolher chat' : 'Expandir chat'}
          aria-label={open ? 'Recolher chat' : 'Expandir chat'} onClick={() => setOpen(!open)}
          className="journey-chat-control">{open ? <Minus /> : <Plus />}</button>
      </div>
      {open && (tabAtual === 'mundo' ? <AbaMundo /> : <LinhasDaAba tab={tabAtual} />)}
    </div>
  )
}
