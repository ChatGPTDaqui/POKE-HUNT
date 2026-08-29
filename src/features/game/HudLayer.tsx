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
import { SalaChip, salaNoTrilho } from '@/components/hud/SalaChip'
import { ClimaChip } from '@/components/hud/ClimaChip'
import { LureChip } from '@/components/hud/LureChip'
import { ColunaDeAtalhos } from '@/components/hud/ColunaDeAtalhos'
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

  // Mesma medida, mesmo motivo, pro TOPO (PH-257): a coluna de atalhos do canto
  // direito comeca onde o trilho acaba, e a altura dele muda com o regime, com
  // o nome da especie em campo e com a escala da HUD.
  const trilhoRef = useRef<HTMLDivElement>(null)
  useMedirAltura(trilhoRef, useUiStore((s) => s.setTrilhoHeight))

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
      {/* PH-197: `inset-x-0 top-0`, nao `inset-x-[.5em] top-[.5em]`. A folga de
          meio `em` deixava a coluna sempre descolada do canto — alinhar a
          esquerda (PH-83) acertou a DIRECAO, mas o recuo fixo continuava ali em
          qualquer largura. O teto de `max-w-[64em]` da linha de baixo e o que
          impede o trilho de esticar; ele nao depende deste recuo. */}
      <div className="absolute inset-x-0 top-0 z-20 flex flex-col items-start gap-[.4em]">
        {/* PH-197: coluna com `gap-0`. O trilho de reservas cola no cabecalho
            do POKE ativo em vez de flutuar abaixo dele. O espacamento que
            sobrava nao era so estetico: a linha de sala/clima abaixo renderiza
            VAZIA quando a hunt nao tem sala (altura 0) e mesmo assim cobrava os
            dois `gap` em volta — 18px de vao morto entre o cabecalho e as
            reservas, sem nada no meio. Com `gap-0` a linha vazia sai de cena de
            verdade, e a margem propria dela (abaixo) so vale quando ela tem
            conteudo. */}
        <div className="flex w-full max-w-[64em] flex-col gap-0">
          {/* Medido pra `ColunaDeAtalhos` (PH-257) saber onde o trilho acaba —
              ela comeca logo abaixo do card do treinador. Um `div` so pra
              medida, sem estilo nenhum: `StatusRail` ja e uma coluna com
              largura propria, e envolver com classe mudaria o layout dele.

              A MEDIDA E SO DO TRILHO, e nao do bloco todo (foi o conflito com a
              PH-261, resolvido aqui): as reservas ficam FORA deste `div`. Medir
              os dois juntos empurraria a coluna de atalhos pra baixo da fila de
              reservas, que cresce com o tamanho da equipe — e o pedido era
              "logo abaixo do lvl do treinador", que mora no trilho. */}
          <div ref={trilhoRef}>
            <StatusRail />
          </div>
          {/* Trilho de reservas: mesma coluna do trilho de status, e nao uma
              ancora propria na borda esquerda. A ancora foi tentada uma vez
              (`ActivePokeCard`, ver o cabecalho deste arquivo) e cobria o HP em
              390px. Aqui ele empurra em vez de sobrepor, e continua no canto
              superior esquerdo porque o proprio componente se alinha a esquerda
              dentro da linha.

              ELE VEM LOGO DEPOIS DO CABECALHO DO POKE ATIVO (PH-261), e nao
              depois dos chips. A fila de reservas E a continuacao do POKE em
              campo — o slot 1 e o campo, e a numeracao dela comeca em 2 (ver
              ReservasRail). A linha de sala/clima ficava no meio dos dois e
              cortava essa leitura: no PC as reservas apareciam como um bloco
              solto abaixo de um chip, sem relacao visivel com o POKE. */}
          <ReservasRail />
          {/* Sala e clima na MESMA linha: os dois descrevem o lugar onde o
              jogador esta, e o clima e propriedade da sala (PH-140/PH-141).
              `flex-wrap` porque em 390px os dois nao cabem lado a lado — ali o
              clima desce pra linha de baixo em vez de espremer a sala.
              `:not(:empty)` (PH-197): a coluna nao espaca mais nada, entao o
              respiro dos chips passa a ser deles — e so quando existem.

              `justify-center` (PH-261): a linha e CENTRALIZADA, a pedido. Ela
              descreve o LUGAR, nao o POKE, e colada a esquerda competia com o
              cabecalho. O centro e o da coluna (`max-w-[64em]`), e nao o da
              tela: em monitor ultralargo centralizar na tela jogaria o chip pra
              longe do resto da HUD — exatamente o que o `max-w` e o
              `items-start` do container existem pra evitar (PH-83). */}
          <div className="flex w-full flex-wrap items-center justify-center gap-[.4em] [&:not(:empty)]:my-[.4em]">
            {/* PH-272: em tela com largura o chip de sala subiu pro trilho, e
                aqui ele nao pode aparecer de novo. Duas copias na tela nao dao
                erro nenhum — so ficam erradas, e em silencio. Quem decide e
                `salaNoTrilho`, a MESMA funcao que o `StatusRail` consulta.
                No compacto ele continua aqui: o trilho de 390px nao tem largura
                pra ele (ver a nota no topo de SalaChip.tsx). */}
            {!salaNoTrilho(mode) && <SalaChip />}
            <ClimaChip />
            {/* Terceiro chip da MESMA linha: os tres respondem "onde estou e o
                que o bot esta fazendo". O `flex-wrap` da linha ja cobre 390px —
                em celular o lure desce pra linha de baixo em vez de espremer a
                sala. Ele se esconde sozinho quando o lure esta inativo, entao
                nao cobra largura de quem nao usa (ver LureChip). */}
            <LureChip />
          </div>
        </div>
      </div>

      {/* Coluna de atalhos (PH-257): Especialidades, Tasks e Bestiario no canto
          superior direito, logo abaixo do card do treinador. Irma do bloco do
          topo, e nao filha: ela ancora na DIREITA e aquele container e uma
          coluna alinhada a esquerda. */}
      <ColunaDeAtalhos />

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
