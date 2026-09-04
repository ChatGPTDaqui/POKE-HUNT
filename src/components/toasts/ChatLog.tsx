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
import { Explicacao } from '@/components/shared/Explicacao'
import { TextoComRealce } from '@/components/shared/TextoComRealce'
import { usePedirAmizade } from '@/features/social/usePedirAmizade'
import { cn } from '@/lib/utils'

export const TABS: { key: ChatTab; label: string }[] = [
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
  const lines = chatLines[tab]
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

export function ChatLog() {
  const activeTab = useUiStore((s) => s.chatTab)
  const setActiveTab = useUiStore((s) => s.setChatTab)
  const open = useUiStore((s) => s.chatOpen)
  const setOpen = useUiStore((s) => s.setChatOpen)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const { narrow, chatNarrow } = useBreakpoints()
  const { pos, onPointerDown } = useWindowDrag('chat')

  // O chat ganhou uma aba a mais e um campo de digitacao: nas larguras onde ele
  // ja era estreito, 4 abas em `13em` quebravam em duas fileiras e comiam a
  // area de leitura.
  const width = narrow ? '16.5em' : chatNarrow ? '15em' : '21em'
  // SEMPRE acima do rodape medido, e nao so em tela estreita. A doca da HUD
  // nova ocupa ate 52em centralizados: em 1440px isso vai de x=202 a x=1237, e
  // o chat ancorado no canto inferior esquerdo cobria os slots Equipe e
  // Mochila — verificado na tela, com o rotulo "Mochila" aparecendo cortado
  // atras da janela. A regra antiga ("acima de 780px o rodape e uma fileira
  // central estreita, longe do chat") descrevia o menu de circulos, que nao
  // existe mais. O fallback so vale ate a primeira medida chegar.
  const bottom = footerHeight ? `calc(${footerHeight}px + .8em)` : (narrow ? '13.5em' : '10.6em')
  // Recolhida a janela NAO leva a largura guardada (PH-84): ela encolhe pro
  // conteudo, que passa a ser so o rotulo "Chat" e o botao de expandir. Sem
  // isto "recolher" so tirava altura — a barra continuava atravessando a tela
  // com as quatro abas, e a janela nao saia da frente de nada. A largura fica
  // guardada em `width` e volta inteira ao expandir.
  // ENCOSTADA NA BORDA ESQUERDA (PH-494), e nao mais a `.8em` dela. Pedido do
  // dono do projeto: "mover o chat do jogo para a esquerda, tocando a tela".
  //
  // O vao de `.8em` fazia a janela LER como solta no meio do campo de jogo — o
  // cenario aparecia dos dois lados dela, e o olho a tratava como mais um
  // elemento sobre a cena em vez de uma borda da interface. Zero encosta, e a
  // leitura vira "isto e a moldura, aquilo e o jogo".
  //
  // A margem SO some na horizontal. O `bottom` continua acima do rodape medido
  // pelo mesmo motivo de sempre (a doca da HUD ocupa ate 52em centralizados e a
  // janela cobria os slots Equipe e Mochila) — encostar embaixo tambem poria a
  // janela por cima da doca, que e o defeito que aquele calculo existe pra
  // evitar.
  //
  // ARRASTAR CONTINUA GANHANDO: `pos` vem primeiro no ternario. Quem quiser a
  // janela solta arrasta, e `winPos.chat` nao e persistido de proposito (ver
  // uiStore) — recarregar devolve ela pra ca.
  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y, ...(open ? { width } : {}) }
    : { left: 0, bottom, ...(open ? { width } : {}) }

  return (
    <div
      data-window="chat"
      style={{ ...style, height: open ? '21em' : 'auto' }}
      className={cn(
        'vidro-flutua pointer-events-auto absolute z-[21] flex max-h-[72vh] max-w-[min(28em,94vw)]',
        'flex-col overflow-hidden',
        // CANTOS DA ESQUERDA RETOS ENQUANTO ELA ESTA ENCOSTADA (PH-494). Canto
        // arredondado contra a borda da tela deixa passar uma lasca de cenario
        // dentro do que devia ser a moldura — e a lasca e o que denuncia que a
        // janela nao encosta de verdade. Arrastada (`pos`), ela volta a ser uma
        // janela solta e recupera os quatro cantos.
        pos ? 'rounded-xl' : 'rounded-r-xl',
        // O piso de largura e pra JANELA ABERTA nao virar uma coluna estreita
        // demais pra ler mensagem. Recolhida ela nao tem mensagem nenhuma, e o
        // piso so deixava um retangulo vazio de 12em ao lado da palavra "Chat".
        open ? 'min-w-[12em] resize' : 'min-w-0',
      )}
    >
      <div
        onPointerDown={onPointerDown}
        className="win-drag-handle flex shrink-0 flex-wrap items-center gap-[.25em] px-[.45em] py-[.35em]"
      >
        {/* Recolhida, so o rotulo. As abas continuam MONTADAS no estado (o
            `activeTab` nao e tocado aqui), entao expandir volta na mesma aba em
            vez de resetar pra Mundo. A barra segue sendo o punho de arrastar
            nos dois casos — o `onPointerDown` esta neste div, nao nas abas. */}
        {open ? TABS.map((tab) => (
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
        )) : (
          <span className="px-[.55em] py-[.28em] text-[.74em] text-n300">Chat</span>
        )}
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

      {open && (activeTab === 'mundo' ? <AbaMundo /> : <LinhasDaAba tab={activeTab} />)}
    </div>
  )
}
