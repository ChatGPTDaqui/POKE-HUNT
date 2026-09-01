// Moldura compartilhada de toda janela flutuante: painel de menu, perfil do
// POKE, relatorio offline e painel Auto.
//
// Tres coisas sao responsabilidade DAQUI, nao de cada tela, justamente pra nao
// divergirem entre elas:
//  - arrastar pela barra de titulo (posicao no uiStore, resetada no resize);
//  - redimensionar pelo canto — `resize: both` do CSS, sem JS nenhum. Exige
//    `overflow: hidden` no container, e por isso a rolagem vive no CORPO
//    (`flex-1 min-h-0 overflow-auto`) e nunca na janela inteira;
//  - manter a barra de titulo e o botao de fechar FORA da area rolavel.
import { useCallback, useEffect, type CSSProperties, type ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { useWindowDrag } from '@/hooks/useWindowDrag'
import { useFecharComEsc } from '@/hooks/useFecharComEsc'
import type { WindowKey } from '@/stores/uiStore'
import { GameIconButton } from './controls'
import { cn } from '@/lib/utils'

export interface GameWindowProps {
  winKey: WindowKey
  /** Largura padrao em `em` (36 = painel comum, 52 = Loja...). */
  widthEm: number
  /** Distancia do topo enquanto a janela nao foi arrastada. */
  defaultTop?: string
  zIndex: number
  /**
   * Escurece o jogo atras e fecha ao clicar fora. Ausente no painel Auto, que
   * de proposito nao escurece nada.
   */
  backdrop?: { zIndex: number }
  /**
   * Fecha ao tocar fora. Por padrao acompanha o backdrop, mas os dois nao sao a
   * mesma coisa: o painel Auto nao escurece nada e MESMO ASSIM sempre fechou
   * ao clicar fora.
   */
  fecharAoTocarFora?: boolean
  onClose: () => void
  title?: ReactNode
  /** Cabecalho custom (perfil do POKE usa a arte como alca de arraste). */
  header?: ReactNode
  /** Faixa fixa entre o cabecalho e o corpo rolavel (abas do perfil). */
  subheader?: ReactNode
  /** Rodape fixo (botao Fechar do relatorio offline). */
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function GameWindow({
  winKey, widthEm, defaultTop = '7.5vh', zIndex, backdrop, fecharAoTocarFora,
  onClose, title, header, subheader, footer, children, className, bodyClassName,
}: GameWindowProps) {
  const { pos, onPointerDown } = useWindowDrag(winKey)

  // A largura padrao e escrita UMA vez, por ref, e nunca entra no `style`
  // reativo. Se entrasse, todo re-render que mudasse a posicao (ou seja, cada
  // frame de arrasto) reescreveria `style.width` e desfaria o
  // redimensionamento que o jogador tivesse feito pelo canto — o `resize: both`
  // do CSS grava exatamente nessa mesma propriedade inline.
  const aplicarLarguraInicial = useCallback((el: HTMLDivElement | null) => {
    if (el && !el.style.width) el.style.width = `${widthEm}em`
  }, [widthEm])

  // `pointerdown` e nao `mousedown`: no toque o navegador so emite o evento de
  // mouse de compatibilidade DEPOIS do `touchend`, e nao emite nenhum quando o
  // gesto vira rolagem — ou seja, tocar fora da janela ora fechava com atraso,
  // ora nao fechava. `pointerdown` cobre dedo, caneta e mouse no mesmo evento.
  //
  // Fechar-ao-clicar-fora por listener de documento, e NAO por um backdrop que
  // captura o clique. A diferenca importa: um backdrop `inset-0` com
  // `pointer-events:auto` fica por cima de toda a HUD, entao clicar num botao
  // do menu com uma tela aberta acertaria ele — a tela atual fecharia e a nova
  // nao abriria, exigindo dois cliques pra trocar. Assim o backdrop so escurece
  // (`pointer-events:none`) e a HUD continua clicavel por baixo dele.
  //
  // `[data-keep-open]` marca quem NAO deve disparar o fechamento: os botoes de
  // menu ja alternam a tela por conta propria, e fechar aqui antes do onClick
  // deles transformaria "clicar de novo pra fechar" em "fecha e reabre".
  // ESC fecha a janela de cima (PH-376). O `zIndex` e a prioridade: com o
  // perfil do POKE (45) aberto sobre a Loja (31), o primeiro ESC fecha o perfil
  // e o segundo a Loja. Vale pra TODA janela, inclusive as que nao tem backdrop
  // (o painel Auto), porque o problema nao e o escurecimento — e nao haver
  // caminho de teclado nenhum.
  useFecharComEsc(onClose, zIndex)

  const fechaFora = fecharAoTocarFora ?? !!backdrop
  useEffect(() => {
    if (!fechaFora) return
    function onDown(event: PointerEvent) {
      const alvo = event.target as HTMLElement | null
      if (!alvo) return
      // Dentro de QUALQUER janela, e nao so desta: clicar no painel Auto (que
      // pode ficar aberto junto, de proposito) ou na janela do chat fechava a
      // tela de menu por tras. Cada janela cuida do proprio fora-de-clique;
      // um clique dentro de outra nunca e "fora" desta.
      if (alvo.closest('[data-window]')) return
      if (alvo.closest('[data-keep-open]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
    // Booleano na dependencia, e nao o objeto `backdrop`: os chamadores passam
    // `backdrop={{ zIndex: 30 }}` inline, objeto novo a cada render — o efeito
    // nunca le `backdrop.zIndex` (isso e lido direto no JSX abaixo), so a
    // existencia. Com o objeto na dependencia, o listener remontava a cada
    // render do pai, nao so quando o backdrop aparecia ou sumia de verdade.
  }, [fechaFora, winKey, onClose])

  // Enquanto nao foi arrastada a janela e centrada por calculo (e nao por
  // `translateX(-50%)`) porque o `transform` briga com o `resize: both`: o
  // navegador redimensiona a partir do canto superior esquerdo REAL, e com o
  // transform aplicado a janela "escorrega" enquanto e redimensionada.
  const style: CSSProperties = pos
    ? { left: pos.x, top: pos.y }
    : { left: `max(.75em, calc(50vw - ${widthEm / 2}em))`, top: defaultTop }

  return (
    <>
      {backdrop && (
        <div className="pointer-events-none absolute inset-0 bg-black/50" style={{ zIndex: backdrop.zIndex }} />
      )}

      <div
        ref={aplicarLarguraInicial}
        data-window={winKey}
        style={{ ...style, zIndex }}
        className={cn(
          // `min(86vh, 100vh - 12em)`: 86vh e o teto do handoff, mas em tela
          // baixa ele encosta na faixa do menu inferior — que fica ACIMA desta
          // janela na pilha (ver HudLayer) pra continuar clicavel com um painel
          // aberto. Sem o segundo termo, o rodape da janela vira area morta
          // coberta pelos circulos do menu.
          'pointer-events-auto absolute flex max-h-[min(86vh,calc(100vh-12em))] max-w-[calc(100vw-1.5em)]',
          // `vidro-alto` (PH-377), e nao `bg-background shadow-2xl`.
          //
          // `docs/09-interface.md#Vidro preto` define tres niveis de superficie
          // e diz que `.vidro-alto` e "sheet e janela". O `Sheet` cumpria; esta
          // janela nao — usava `#0a0a0c` opaco mais sombra espalhada, que e
          // exatamente o que a mesma secao registra que NAO le em fundo preto.
          // Eram duas identidades pra mesma tela: no celular o painel era vidro
          // sobre o jogo, no PC um retangulo preto chapado.
          //
          // A borda e a sombra locais saem junto: a classe ja traz o fio de luz
          // na borda de cima e a sombra do nivel, e `border-n700` por cima
          // somaria duas bordas.
          //
          // O QUE FICA DE OLHO: `backdrop-filter` obriga o compositor a
          // reamostrar o canvas atras, e a janela do desktop e bem maior que um
          // sheet de celular. O custo nunca foi medido — a secao do `index.css`
          // registra as duas tentativas que nao isolaram nada — e o escape
          // hatch continua sendo "Reduzir transparencia" em Configuracoes,
          // que ja cobre `.vidro-alto`.
          'vidro-alto min-h-[10em] min-w-[18em] resize flex-col overflow-hidden rounded-xl',
          className,
        )}
      >
        {header ? (
          // Com cabecalho custom o botao de fechar flutua por cima dele: o
          // conteudo (a arte do POKE, por exemplo) ocupa a largura toda, e
          // reservar uma coluna pro X desalinharia o desenho.
          <div onPointerDown={onPointerDown} className="win-drag-handle relative shrink-0">
            {header}
            <div className="absolute top-[.5em] right-[.5em]">
              <GameIconButton variant="ghost" onClick={onClose} aria-label="Fechar">
                <X />
              </GameIconButton>
            </div>
          </div>
        ) : (
          <div
            onPointerDown={onPointerDown}
            className="win-drag-handle flex shrink-0 items-center justify-between gap-[.5em] border-b border-n800 py-[.55em] pr-[.55em] pl-[.7em]"
          >
            <span className="truncate font-medium">{title}</span>
            <GameIconButton variant="ghost" onClick={onClose} aria-label="Fechar">
              <X />
            </GameIconButton>
          </div>
        )}

        {subheader && <div className="shrink-0">{subheader}</div>}

        <div className={cn('min-h-0 flex-1 overflow-auto p-[.7em] text-[.85em]', bodyClassName)}>{children}</div>

        {footer && <div className="shrink-0 border-t border-n800 px-[.7em] py-[.6em]">{footer}</div>}
      </div>
    </>
  )
}
