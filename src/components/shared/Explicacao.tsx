// EXPLICACAO FLUTUANTE — a bolha que explica uma palavra do jogo.
//
// POR QUE ESTE ARQUIVO EXISTE, e nao so mais um `<Tooltip>`: o `TooltipTrigger`
// do base-ui abre a bolha com `mouseOnly: true` fixo no codigo do pacote
// (node_modules/@base-ui/react/tooltip/trigger/TooltipTrigger.js). Ou seja: TODA
// bolha deste jogo — golpe, item, POKE do chat, painel Auto — nunca abriu no
// celular, e nem tinha como. O mesmo vale pros `title=` espalhados pela HUD:
// atributo `title` e hover, e dedo nao faz hover.
//
// O CONSERTO: `open` controlado aqui. O hover do base-ui continua mandando
// (ele chama `onOpenChange`, que cai no mesmo estado), e o TOQUE entra por
// `onClick`. Nada de ramificar por `useDeviceMode().coarse`: um notebook com
// tela de toque e as duas coisas ao mesmo tempo, e a media query
// `(pointer: coarse)` responde por UM ponteiro so. O `pointerType` do evento
// real responde certo nos dois.
//
// POR QUE `onClick` E NAO `onPointerDown`: com pointerdown, comecar a ROLAR a
// lista com o dedo em cima da palavra abria a bolha no meio da rolagem. Click o
// browser ja suprime depois de um arrasto — de graca.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { verbete as buscarVerbete, type Verbete, type VerbeteId } from '@/data/glossario'
import { cn } from '@/lib/utils'

type Lado = 'top' | 'bottom' | 'left' | 'right'

/**
 * Mecanismo cru: hover no PC, toque no celular. `conteudo` e livre — quem tem
 * bolha rica (golpe, item) monta a sua e reusa a abertura daqui.
 */
export function Explicacao({
  conteudo, children, className, classeDoConteudo, estilo, rotulo,
  side = 'top', envolve = 'inline', tabIndex,
}: {
  conteudo: ReactNode
  children: ReactNode
  className?: string
  /** Classe da BOLHA (largura maxima, borda). O gatilho usa `className`. */
  classeDoConteudo?: string
  /** Estilo inline do gatilho, pra cor que vem de dado (raridade, tipo). */
  estilo?: CSSProperties
  /**
   * `aria-label` do gatilho. Obrigatorio em pratica quando o gatilho e um
   * GLIFO sem texto (o `?` do painel Auto): sem ele o leitor de tela anuncia um
   * elemento vazio.
   */
  rotulo?: string
  side?: Lado
  /**
   * `inline` (padrao) = a bolha ancora numa palavra, e o gatilho e um span
   * inline. `bloco` = o gatilho envolve um card inteiro e nao pode mudar o
   * layout dele (`display: contents`).
   */
  envolve?: 'inline' | 'bloco'
  tabIndex?: number
}) {
  const [aberto, setAberto] = useState(false)
  // O `pointerType` do ultimo ponteiro que desceu neste gatilho. Lido no click,
  // que nao carrega essa informacao de forma confiavel em todo browser.
  const ponteiro = useRef('mouse')

  return (
    <Tooltip open={aberto} onOpenChange={setAberto}>
      <TooltipTrigger
        render={(
          <span
            tabIndex={tabIndex}
            style={estilo}
            aria-label={rotulo}
            className={cn(envolve === 'bloco' ? 'contents' : 'inline', className)}
          />
        )}
        onPointerDown={(e: React.PointerEvent) => {
          ponteiro.current = e.pointerType || 'mouse'
        }}
        onClick={(e: React.MouseEvent) => {
          if (ponteiro.current === 'mouse') return
          // No dedo o toque na palavra e SO pra bolha: sem isto, tocar a
          // Natureza dentro de um card abriria a bolha e o card junto.
          e.stopPropagation()
          e.preventDefault()
          setAberto((v) => !v)
        }}
      >
        {children}
      </TooltipTrigger>
      {/* `data-keep-open` na BOLHA, nao no gatilho. A bolha e portada pra fora do
          sheet (base-ui monta o popup em document.body), entao pro listener de
          `pointerdown` do Sheet/GameWindow ela e "fora" — e um toque no texto da
          explicacao fechava o painel inteiro por baixo dela. Reproduzido no
          celular: ficha do POKE aberta, toque na bolha da Natureza, ficha some.
          O gatilho nao precisa da marca: ele mora dentro do `[data-window]`. */}
      <TooltipContent
        side={side}
        data-keep-open
        // A largura cede pra tela quando a tela e menor que a bolha: em 320px de
        // largura o `21em` fixo vazava pelas duas bordas.
        className={cn(
          'max-w-[min(21em,calc(100vw-1.5rem))] bg-popover text-[.85em] leading-snug text-popover-foreground',
          classeDoConteudo,
        )}
      >
        {conteudo}
      </TooltipContent>
    </Tooltip>
  )
}

/** O corpo de um verbete do glossario, formatado. */
export function BolhaDoVerbete({ v }: { v: Verbete }) {
  return (
    <div className="flex flex-col gap-[.3em] text-left">
      <b>{v.titulo}</b>
      {v.corpo.map((paragrafo) => (
        <span key={paragrafo} className="leading-tight opacity-85">{paragrafo}</span>
      ))}
      {/* Sem link: no dedo, um link dentro da bolha competiria com o toque que
          a fecha. Dizer ONDE ler mais ja resolve o caso comum. */}
      {v.wiki && <span className="text-[.85em] text-n500">Mais na Wiki, aba {v.wiki}</span>}
    </div>
  )
}

/**
 * Uma palavra explicada, com a marca visual que diz "tem explicacao aqui".
 *
 * O sublinhado pontilhado NAO e enfeite: bolha sem marca nenhuma e bolha que o
 * jogador nunca descobre — no celular ainda mais, porque nao existe hover pra
 * revelar por acidente.
 */
export function Palavra({
  verbete, children, className, side,
}: {
  /** Chave do glossario, ou um verbete montado na hora (natureza deste POKE). */
  verbete: VerbeteId | Verbete
  children: ReactNode
  className?: string
  side?: Lado
}) {
  const v = typeof verbete === 'string' ? buscarVerbete(verbete) : verbete
  return (
    <Explicacao
      conteudo={<BolhaDoVerbete v={v} />}
      side={side}
      // Focavel de proposito: um <span> com bolha nao tem papel nenhum na arvore
      // de acessibilidade, e sem tabIndex a explicacao seria inalcancavel por
      // teclado. Com ele, a interacao de foco do base-ui abre a mesma bolha e o
      // `aria-describedby` do popup passa a valer.
      tabIndex={0}
      className={cn(
        'cursor-help underline decoration-dotted decoration-n600 underline-offset-[.2em]',
        // `manipulation` mata o atraso de 300ms do duplo-toque no celular: sem
        // isso a bolha abria com um tranco perceptivel.
        'touch-manipulation',
        className,
      )}
    >
      {children}
    </Explicacao>
  )
}
