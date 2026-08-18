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
import { useState } from 'react'
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

function Ticker({ onOpen }: { onOpen: () => void }) {
  const linhasLog = useToastStore((s) => s.chatLines.log)
  const linhasSistema = useToastStore((s) => s.chatLines.sistema)
  // A mais recente das duas fontes. Sem timestamp comparavel nas linhas, o
  // criterio e a ordem de chegada dentro de cada lista — pegar a ultima de cada
  // e preferir Sistema empata a favor do aviso ao jogador, que e o que ele
  // precisa ver.
  const ultima = linhasSistema.at(-1) ?? linhasLog.at(-1)

  return (
    <button
      type="button"
      data-keep-open
      onClick={onOpen}
      aria-label="Abrir chat"
      className={cn(
        'vidro pointer-events-auto flex w-full cursor-pointer items-center gap-[.45em] rounded-full',
        'px-[.7em] py-[.3em] text-left font-[inherit]',
      )}
    >
      <ChatCircleDots className="shrink-0 text-[.95em] text-n400" />
      <span className="min-w-0 flex-1 truncate text-[.72em] text-n300">
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
        'flex-1 cursor-pointer rounded-[.6em] px-[.4em] py-[.45em] font-[inherit] text-[.75em]',
        ativo ? 'bg-n800 text-foreground' : 'text-n500',
      )}
    >
      {label}
    </button>
  )
}
