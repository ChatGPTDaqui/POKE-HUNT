// Onde cada superficie da HUD fica na tela.
//
// A HUD tem DUAS superficies permanentes, e so duas: o trilho de status
// (topo) e a doca de acao (rodape). Tudo o mais e contextual (chip de sala,
// chip de evolucao) ou aberto por toque (sheets, janelas).
//
// Isso substitui o desenho anterior, de cinco ancoras independentes nas bordas
// (`ActivePokeCard` + `RatesCard` na esquerda, `CenterBlock` no centro,
// `TrainerCard` + `SideMenuColumn` na direita, `MainMenu` + `AbilityHud` no
// rodape, `AutoButton` solto e `ChatLog` flutuante). Cada uma se posicionava
// sozinha e negociava com as vizinhas por breakpoint; em 390px elas
// literalmente se cobriam — medido no aparelho, o card do treinador ficava
// por cima do HP do POKE.
//
// A mesma arvore serve os tres regimes (ver `useDeviceMode`). Nao ha layout de
// desktop separado: o amplo e o compacto com mais largura, mais rotulo e mais
// destino visivel na barra. Um layout so pra manter, e o celular deixa de ser
// o caso degradado.
//
// Camadas (z-index):
//   0      canvas do jogo
//   18–22  HUD (trilho, doca, chips)
//   30/31  backdrop + painel (sheet no celular, janela no amplo)
//   33     sheets que abrem POR CIMA de um painel (Mais, chat)
//   40     painel Auto (nao passa pelo backdrop, de proposito)
//   45/46  perfil do POKE
//   50/51  relatorio offline
//   60     confirmacao
//   70     toasts
//
// A HUD continua ABAIXO do backdrop na pilha (ela escurece junto com o jogo) e
// mesmo assim segue tocavel: o backdrop e puramente visual
// (`pointer-events:none`) e o fechar-ao-tocar-fora e um listener de documento.
// Um backdrop que capturasse o toque faria trocar de tela exigir dois toques.
import { useRef } from 'react'
import { StatusRail } from '@/components/hud/StatusRail'
import { ReservasRail } from '@/components/hud/ReservasRail'
import { ActionDock, SheetMais } from '@/components/hud/ActionDock'
import { SalaChip } from '@/components/hud/SalaChip'
import { ClimaChip } from '@/components/hud/ClimaChip'
import { ChatLog } from '@/components/toasts/ChatLog'
import { ChatMobile } from '@/components/toasts/ChatMobile'
import { AutoWindow } from '@/components/auto/AutoFloatingPanel'
import { useDeviceMode, useUiStore } from '@/stores/uiStore'
import { useMedirAltura } from '@/hooks/useMedirAltura'
import { cn } from '@/lib/utils'

// Acima disto o chat volta a ser janela flutuante no canto: e a largura em que
// ela cabe ao lado da doca sem encostar nela. Abaixo, ticker de uma linha —
// inclusive em desktop estreito, onde a janela tambem cobria o jogo.
const LARGURA_CHAT_FLUTUANTE = 1200

export function HudLayer() {
  const { mode, width } = useDeviceMode()
  const setFooterHeight = useUiStore((s) => s.setFooterHeight)
  const chatFlutuante = mode === 'amplo' && width >= LARGURA_CHAT_FLUTUANTE

  // Mede o rodape ao vivo. Os sheets ancoram o proprio `bottom` neste numero
  // pra parar EM CIMA da doca em vez de cobri-la — a doca e o unico caminho de
  // navegacao no celular. `ResizeObserver` porque a altura muda com o regime,
  // com o numero de golpes do POKE e com o `hudScale`.
  const footerRef = useRef<HTMLDivElement>(null)
  useMedirAltura(footerRef, setFooterHeight)

  return (
    <>
      {/* Topo: trilho + o que for contextual embaixo dele. Uma coluna so, pra
          o chip de sala e o de evolucao empurrarem em vez de sobrepor. */}
      {/* `items-start`, nao `items-center` (PH-83): o `max-w-[64em]` de baixo
          impede o trilho de esticar em tela ultralarga, mas centralizado ele
          empurrava a coluna inteira pra dentro assim que a janela passava de
          64em — 112px em 1440, 352px em 1920, 672px em 2560. Em monitor grande
          o cabecalho do POKE aparecia no MEIO da tela em vez do canto. Alinhar
          a esquerda mantem o teto de largura e devolve o canto. */}
      <div className="absolute inset-x-[.5em] top-[.5em] z-20 flex flex-col items-start gap-[.4em]">
        <div className="flex w-full max-w-[64em] flex-col gap-[.4em]">
          <StatusRail />
          {/* Sala e clima na MESMA linha: os dois descrevem o lugar onde o
              jogador esta, e o clima e propriedade da sala (PH-140/PH-141).
              `flex-wrap` porque em 390px os dois nao cabem lado a lado — ali o
              clima desce pra linha de baixo em vez de espremer a sala. */}
          <div className="flex w-full flex-wrap items-center gap-[.4em]">
            <SalaChip />
            <ClimaChip />
          </div>
          {/* Trilho de reservas: mesma coluna do trilho de status, e nao uma
              ancora propria na borda esquerda. A ancora foi tentada uma vez
              (`ActivePokeCard`, ver o cabecalho deste arquivo) e cobria o HP em
              390px. Aqui ele empurra em vez de sobrepor, e continua no canto
              superior esquerdo porque o proprio componente se alinha a esquerda
              dentro da linha. */}
          <ReservasRail />
        </div>
      </div>

      {/* Rodape: ticker do chat (quando nao ha janela flutuante) + doca. Os dois
          no MESMO container medido — o botao Auto e o chat costumavam se
          posicionar por conta propria a partir da altura do rodape, e cada
          mudanca de regime exigia reancorar os dois a mao. */}
      <div
        ref={footerRef}
        className="absolute inset-x-[.5em] bottom-[.5em] z-20 flex flex-col items-center gap-[.35em]"
      >
        {/* Deitado a doca NAO se estica: numa faixa de 844px os cinco slots
            ficariam a 200px um do outro e o polegar teria que atravessar a tela
            pra trocar de aba. Cluster central, mais perto do dedo e mais perto
            do desenho compacto. */}
        <div
          className={cn(
            'flex w-full flex-col items-stretch gap-[.35em]',
            mode === 'deitado' ? 'max-w-[38em]' : 'max-w-[52em]',
          )}
        >
          {!chatFlutuante && <ChatMobile />}
          <ActionDock />
        </div>
      </div>

      {/* Camadas que abrem por cima de tudo. O sheet se desenha por portal na
          camada da HUD (ver Sheet), entao o lugar dele na arvore aqui e so
          organizacao — a janela do Auto e que precisa mesmo ficar fora da doca,
          porque ela SIM posiciona contra o ancestral. */}
      <SheetMais />
      <AutoWindow />
      {chatFlutuante && <ChatLog />}
    </>
  )
}
