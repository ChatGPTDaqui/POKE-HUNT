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
  const linhasLog = useToastStore((s) => s.chatLines.log)
  const linhasSistema = useToastStore((s) => s.chatLines.sistema)
  const linhasTrade = useToastStore((s) => s.chatLines.trade)
  // A mais recente das duas fontes. Sem timestamp comparavel nas linhas, o
  // criterio e a ordem de chegada dentro de cada lista — pegar a ultima de cada
  // e preferir Sistema empata a favor do aviso ao jogador, que e o que ele
  // precisa ver.
  const ultima = linhasSistema.at(-1) ?? linhasTrade.at(-1) ?? linhasLog.at(-1)
  const cor = ultima ? COR_POR_TIPO[ultima.type] ?? COR_POR_TIPO.info : undefined

  return (
    <button
      type="button"
      data-keep-open
      onClick={onOpen}
      aria-label="Abrir chat"
      // Faixa fina de proposito (cada pixel dela e jogo escondido), com a area
      // de toque crescida por baixo — ver `.alvo-estendido` no index.css.
      className={cn(
        'vidro alvo-estendido pointer-events-auto relative flex w-full cursor-pointer items-center gap-[.45em]',
        'rounded-full px-[.7em] py-[.3em] text-left font-[inherit]',
      )}
      style={{ '--alvo-folga': '-9px', '--alvo-folga-x': '0px' } as CSSProperties}
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
