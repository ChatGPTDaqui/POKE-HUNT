// Bottom sheet: a forma que TODA janela assume nos regimes de celular.
//
// Substitui a `GameWindow` no compacto/deitado, e nao apenas por gosto: a
// janela flutuante depende de tres coisas que nao existem no dedo — arrastar
// pela barra de titulo, redimensionar por um canto de 16px, e escolher uma
// posicao livre numa tela onde nao ha posicao livre nenhuma.
//
// Duas decisoes que valem a leitura:
//
// 1. O sheet para ACIMA da doca (`bottom: footerHeight`), nunca por cima dela.
//    A doca e o unico caminho de navegacao no celular; um painel que a cobre
//    obriga a fechar antes de trocar de tela, ou seja, dois toques pra fazer o
//    que a barra faz em um. Mesma razao do backdrop nao capturar clique.
//
// 2. Ele e desenhado por PORTAL na camada da HUD (`#camada-hud`), nunca onde
//    foi escrito. Um `absolute` resolve contra o ancestral posicionado mais
//    proximo: um sheet declarado dentro da doca (que e absoluta e tem a
//    largura do conteudo) herdaria aquela caixa, e o "inset-x-0" dele viraria
//    a largura da doca em vez da tela. Com portal, quem abre um sheet nao
//    precisa saber onde esta na arvore.
//
// 3. `overscroll-behavior: contain` no corpo. Sem isso, chegar ao fim da lista
//    dentro do sheet propaga a rolagem pro documento — no iOS isso arrasta a
//    pagina inteira e o gesto seguinte fecha o sheet sem o jogador ter pedido.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from '@phosphor-icons/react'
import { useUiStore } from '@/stores/uiStore'
import { GameIconButton } from './controls'
import { cn } from '@/lib/utils'

/**
 * Altura do sheet.
 *
 * 'conteudo' e o default de menu curto: altura do que ele tem dentro, com teto.
 * Uma grade de 10 icones dentro de um sheet de altura fixa deixava metade da
 * altura em vidro vazio, que le como "faltou carregar alguma coisa".
 *
 * As medidas sao PERCENTUAIS DO PAI (`.hud-safe`), nunca `vh`. `vh` ignora
 * duas coisas que existem de verdade aqui: os recortes do aparelho (o pai ja
 * esta inset por eles) e a barra de URL do celular, que muda a altura util sem
 * mudar `vh` nenhum. Um sheet dimensionado em `vh` mais o rodape medido em px
 * estourava a tela pra cima — a primeira versao cobria o trilho de status e
 * escondia a propria alca.
 */
export type SheetSnap = 'conteudo' | 'meia' | 'cheia'

// Faixa reservada ao trilho de status no topo. Um sheet nunca a cobre: o
// jogador precisa continuar vendo HP e carteira com um painel aberto — e sem
// essa reserva o proprio cabecalho do sheet saia pra fora da tela.
const RESERVA_TRILHO = '4.4em'

// Arrasto para baixo maior que isto (em px) fecha. Abaixo, volta pro lugar.
// 96px e ~1/9 de uma tela de celular: alto o suficiente pra nao fechar num
// tremor de dedo durante a rolagem, baixo o suficiente pra o gesto parecer
// direto.
const LIMIAR_FECHAR = 96

export interface SheetProps {
  /** Identifica o sheet pro fechar-ao-tocar-fora (`[data-window]`). */
  winKey: string
  onClose: () => void
  title?: ReactNode
  /** Faixa fixa entre o cabecalho e o corpo rolavel (abas). */
  subheader?: ReactNode
  footer?: ReactNode
  snap?: SheetSnap
  zIndex?: number
  /** Escurece o jogo atras. Nunca captura toque — ver nota no topo. */
  backdrop?: boolean
  children: ReactNode
  bodyClassName?: string
}

export function Sheet({
  winKey, onClose, title, subheader, footer,
  snap = 'cheia', zIndex = 31, backdrop = true, children, bodyClassName,
}: SheetProps) {
  const footerHeight = useUiStore((s) => s.footerHeight)
  const [arrasto, setArrasto] = useState(0)
  const inicio = useRef<number | null>(null)
  const alvo = useCamadaHud()

  // Fechar ao tocar FORA. Mesmo desenho da GameWindow (listener de documento em
  // vez de backdrop clicavel) pra doca e trilho continuarem vivos com o sheet
  // aberto. `[data-keep-open]` marca quem ja alterna a tela por conta propria.
  useEffect(() => {
    function onDown(event: PointerEvent) {
      const alvo = event.target as HTMLElement | null
      if (!alvo) return
      if (alvo.closest(`[data-window="${winKey}"]`)) return
      if (alvo.closest('[data-keep-open]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [winKey, onClose])

  // O botao voltar do Android NAO e tratado aqui de proposito. Um `pushState`
  // por sheet parece obvio e tem uma corrida real: trocar de painel direto pela
  // doca desmonta o sheet A (cleanup chama `history.back()`, que e ASSINCRONO) e
  // monta o B (`pushState`) — o `popstate` atrasado do A chega depois e fecha o
  // B. Quem cuida do voltar e um dono unico, `useVoltarFechaPainel`, que enxerga
  // todas as camadas abertas e serializa.
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    inicio.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (inicio.current == null) return
    // So para baixo: puxar pra cima nao expande (o sheet ja abre no snap
    // pedido), e permitir o movimento daria a impressao de que expandiria.
    setArrasto(Math.max(0, e.clientY - inicio.current))
  }, [])

  const onPointerUp = useCallback(() => {
    if (inicio.current == null) return
    inicio.current = null
    setArrasto((atual) => {
      if (atual > LIMIAR_FECHAR) onClose()
      return 0
    })
  }, [onClose])

  if (!alvo) return null

  return createPortal(
    <>
      {backdrop && (
        <div
          className="pointer-events-none absolute inset-0 bg-black/55"
          style={{ zIndex: zIndex - 1 }}
        />
      )}

      <div
        data-window={winKey}
        style={{
          zIndex,
          bottom: footerHeight ? `${footerHeight}px` : '7em',
          // 'cheia' e ancorada nas DUAS pontas (topo reservado, rodape medido);
          // as outras crescem de baixo pra cima com teto.
          ...(snap === 'cheia'
            ? { top: RESERVA_TRILHO }
            : {
              height: snap === 'meia' ? '52%' : undefined,
              maxHeight: `calc(100% - ${RESERVA_TRILHO} - ${footerHeight}px)`,
            }),
          transform: arrasto ? `translateY(${arrasto}px)` : undefined,
          transition: arrasto ? 'none' : 'transform .18s ease-out',
        }}
        className={cn(
          'vidro-alto pointer-events-auto absolute inset-x-0 flex flex-col overflow-hidden',
          // Cantos so em cima: o sheet encosta na doca, e arredondar embaixo
          // deixaria duas fatias do jogo aparecendo entre as duas superficies.
          'rounded-t-[1.15em]',
        )}
      >
        {/* Alca. E ela que arrasta, e nao o cabecalho inteiro: com o cabecalho
            todo arrastavel, tocar no titulo pra rolar a lista fechava o sheet. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="win-drag-handle flex shrink-0 flex-col items-center pt-[.5em] pb-[.15em]"
        >
          <span className="h-[.28em] w-[2.6em] rounded-full bg-n600" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-[.5em] px-[.9em] pt-[.15em] pb-[.5em]">
          <span className="truncate text-[1.02em] font-medium tracking-[-.01em]">{title}</span>
          <GameIconButton variant="ghost" onClick={onClose} aria-label="Fechar" className="alvo-toque">
            <X />
          </GameIconButton>
        </div>

        {subheader && <div className="shrink-0">{subheader}</div>}

        <div
          className={cn(
            'min-h-0 flex-1 overflow-auto overscroll-contain px-[.75em] pt-[.1em] pb-[1em] text-[.85em]',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer && <div className="shrink-0 border-t border-n800 px-[.9em] py-[.6em]">{footer}</div>}
      </div>
    </>,
    alvo,
  )
}

/**
 * A camada da HUD (`.hud-safe`), ja recortada pelas areas inseguras do
 * aparelho. O `useEffect` existe porque o no so passa a existir no commit: um
 * componente irmao que renderize ANTES dele nao o encontra na primeira
 * passada, e sem o segundo tento o sheet nunca apareceria.
 */
function useCamadaHud(): HTMLElement | null {
  const [alvo, setAlvo] = useState<HTMLElement | null>(
    () => (typeof document === 'undefined' ? null : document.getElementById('camada-hud')),
  )
  useEffect(() => {
    if (!alvo) setAlvo(document.getElementById('camada-hud'))
  }, [alvo])
  return alvo
}
