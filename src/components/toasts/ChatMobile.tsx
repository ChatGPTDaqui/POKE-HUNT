// Chat no celular: uma LINHA sobre o jogo, e o resto atras de um toque.
//
// A janela de chat do desktop media 264x336px numa tela de 390x844 — 12% da
// area, permanentemente, em cima do campo de batalha, mostrando conversa que o
// jogador nao pediu pra ver agora. O ticker resolve o unico caso que justifica
// presenca permanente ("aconteceu alguma coisa?") e devolve o resto da tela.
//
// A ultima linha vem do LOG (combate/sistema), nao do chat de jogadores: e o
// canal que descreve o que esta acontecendo no jogo enquanto o jogador olha.
// Conversa de outros jogadores nao interrompe — ela espera dentro do sheet.
import { useState, type CSSProperties } from 'react'
import { ChatCircleDots } from '@phosphor-icons/react'
import { useToastStore } from '@/stores/toastStore'
import { ultimaLinhaDeTodasAsAbas } from '@/stores/toastStoreVanilla'
import { useUiStore, type ChatTab } from '@/stores/uiStore'
import { Sheet } from '@/components/game/Sheet'
import { TextoComRealce } from '@/components/shared/TextoComRealce'
import { AbaMundo, LinhasDaAba, TABS } from './ChatLog'
import { cn } from '@/lib/utils'

export function ChatMobile() {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <Ticker onOpen={() => setAberto(true)} />
      {aberto && <SheetChat onClose={() => setAberto(false)} />}
    </>
  )
}

// Mesma escala do chat e do toast: no compacto o ticker e o UNICO canal de
// feedback que sobra, entao a cor tem que carregar a mesma informacao que
// carregava no toast (verde capturou, laranja escapou, vermelho falhou).
const COR_POR_TIPO: Record<string, string> = {
  gold: 'var(--color-gold)',
  levelup: '#7dd3fc',
  success: 'var(--color-ok)',
  error: 'var(--color-bad)',
  'capture-success': 'var(--color-ok)',
  'capture-fail': 'var(--color-warn)',
  info: 'var(--color-n300)',
}

function Ticker({ onOpen }: { onOpen: () => void }) {
  const chatLines = useToastStore((s) => s.chatLines)
  // A MAIS RECENTE DAS TRES ABAS, por `seq` (PH-372).
  //
  // Era `sistema.at(-1) ?? trade.at(-1) ?? log.at(-1)` — prioridade de canal
  // fantasiada de recencia, com o comentario antigo justificando o desempate
  // "a favor do aviso ao jogador". Nao era desempate: `sistema.at(-1)` so
  // devolve `undefined` enquanto a aba esta VAZIA, e ela recebe as 23 chamadas
  // de canal `world` (erro de rede, "Equipe curada!", recusa do servidor).
  // Depois da primeira delas o ticker ficava preso naquela frase para sempre, e
  // o canal `combat` — abate com ouro, level up, captura falhada, auto-pot,
  // auto-revive — nao aparecia mais nunca.
  //
  // O agravante e o regime: no compacto o ticker e o UNICO canal de chat (so
  // `error` continua virando toast), entao nao havia segunda superficie onde
  // esse feed aparecesse. Ver docs/09-interface.md#O que so existe no dedo.
  const ultima = ultimaLinhaDeTodasAsAbas(chatLines)
  const cor = ultima ? COR_POR_TIPO[ultima.type] ?? COR_POR_TIPO.info : undefined

  return (
    <button
      type="button"
      data-keep-open
      onClick={onOpen}
      aria-label="Abrir chat"
      // Faixa fina de proposito (cada pixel dela e jogo escondido), com a area
      // de toque crescida por baixo — ver `.alvo-estendido` no index.css.
      //
      // LARGURA DE CONTEUDO (PH-262), e nao `w-full`. A faixa escura ia de ponta
      // a ponta do rodape em toda mensagem: "Item encontrado: Potion" ocupa um
      // terco dela, e os outros dois tercos eram vidro fosco cobrindo o campo de
      // batalha sem dizer nada. O pedido foi literal — "deixe apenas o suficiente
      // para a escrita".
      //
      // `max-w-full` mantem o teto: mensagem longa continua truncando na largura
      // da tela em vez de estourar pra fora dela. `self-center` e obrigatorio
      // porque o pai e `items-stretch` (HudLayer) — sem ele o `w-fit` nao teria
      // efeito nenhum.
      className={cn(
        'vidro alvo-estendido pointer-events-auto relative flex w-fit max-w-full cursor-pointer',
        'self-center items-center gap-[.45em]',
        'rounded-full px-[.7em] py-[.3em] text-left font-[inherit]',
      )}
      // A AREA DE TOQUE NAO ENCOLHE JUNTO. `--alvo-folga` ja crescia o alvo por
      // cima/por baixo; com a faixa curta, `--alvo-folga-x` (era 0) passa a
      // crescer tambem pros lados, senao o alvo do chat encolheria junto com a
      // mensagem — e uma linha de duas palavras viraria um botao de 80px.
      style={{ '--alvo-folga': '-9px', '--alvo-folga-x': '-16px' } as CSSProperties}
    >
      <ChatCircleDots className="shrink-0 text-[.95em] text-n400" />
      <span
        // `key` na mensagem: sem ela o React reaproveita o node e a animacao de
        // chegada nao reinicia — linha nova entrava sem nenhum sinal de que era
        // nova, que e justamente o que o ticker precisa dizer.
        key={ultima?.id}
        className="hud-ticker-linha min-w-0 flex-1 truncate text-[.72em]"
        style={{ color: cor }}
      >
        {ultima ? <TextoComRealce texto={ultima.message} realce={ultima.realce} /> : 'Chat'}
      </span>
    </button>
  )
}

function SheetChat({ onClose }: { onClose: () => void }) {
  const activeTab = useUiStore((s) => s.chatTab)
  const setActiveTab = useUiStore((s) => s.setChatTab)

  return (
    <Sheet
      winKey="chat-mobile"
      snap="meia"
      zIndex={33}
      onClose={onClose}
      title="Chat"
      // O corpo do chat gerencia a propria rolagem e o campo de digitacao fica
      // colado embaixo: sem `p-0` o padrao do sheet empurraria o input pra
      // dentro de uma area que rola.
      bodyClassName="flex flex-col p-0"
      subheader={
        <div className="flex gap-[.25em] px-[.7em] pb-[.4em]">
          {TABS.map((tab) => (
            <BotaoAba
              key={tab.key}
              label={tab.label}
              ativo={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>
      }
    >
      {activeTab === 'mundo' ? <AbaMundo /> : <LinhasDaAba tab={activeTab as Exclude<ChatTab, 'mundo'>} />}
    </Sheet>
  )
}

function BotaoAba({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // `jogo-botao` e o gancho do alvo minimo de toque: sao quatro abas lado
        // a lado com 27px de altura, e errar a vizinha troca o canal que o
        // jogador esta lendo.
        'jogo-botao flex-1 cursor-pointer rounded-[.6em] px-[.4em] py-[.45em] font-[inherit] text-[.75em]',
        ativo ? 'bg-n800 text-foreground' : 'text-n500',
      )}
    >
      {label}
    </button>
  )
}
