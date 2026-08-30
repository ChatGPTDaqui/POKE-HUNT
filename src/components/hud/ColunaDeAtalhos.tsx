// Coluna de atalhos do canto superior direito: Especialidades, Tasks, Bestiario.
//
// POR QUE ELA EXISTE (PH-257)
// ---------------------------------------------------------------------------
// Os tres viviam atras de dois toques. Bestiario e Tasks so apareciam dentro do
// sheet "Mais" da doca, e Especialidades so pela grade de la — telas que o
// jogador abre varias vezes por sessao, escondidas no mesmo lugar em que moram
// Wiki e Ajustes, que ele abre uma vez por mes. O pedido foi por uma coluna
// fixa, no canto superior direito, logo abaixo do card do treinador.
//
// POR QUE ELA NAO E "MAIS UMA ANCORA DE BORDA"
// ---------------------------------------------------------------------------
// O cabecalho do HudLayer registra que cinco ancoras independentes nas bordas ja
// existiram e se cobriam em 390px — uma delas era literalmente uma
// `SideMenuColumn` a direita. O que fazia aquilo colidir era cada ancora
// decidir a propria posicao por breakpoint. Esta aqui nao decide: ela comeca na
// altura MEDIDA do trilho (`uiStore.trilhoHeight`, mesmo mecanismo do rodape) e
// encolhe pra so-icone no compacto, onde a largura e disputada.
//
// PH-282: O CARD DO TREINADOR PASSOU A MORAR AQUI, no mesmo container, acima dos
// atalhos. Ele vivia dentro do trilho, que tem teto de largura (`max-w-[64em]`)
// e e alinhado a esquerda por PH-83 — em 1920px o trilho acaba por volta de
// x=1440 e o card acabava junto, com ~480px de tela vazia a direita, desalinhado
// desta coluna que ja estava colada na borda. Juntar os dois resolve as duas
// coisas de uma vez: mesma borda, e a coluna continua logo abaixo do card sem
// depender de medida nenhuma.
//
// O `top` medido continua existindo pro COMPACTO, onde o card nao e renderizado
// (ele desce pra gaveta por falta de largura): sem ele, a coluna subiria pra
// cima do trilho, que em 390px ocupa a largura inteira.
import { BookBookmark, CheckSquare, Sparkle, type Icon } from '@phosphor-icons/react'
import { CardDoTreinador } from '@/components/hud/CardDoTreinador'
import { useUiStore, useDeviceMode, type ScreenName } from '@/stores/uiStore'
import { cn } from '@/lib/utils'

/**
 * Os tres destinos da coluna. Exportado porque `ActionDock` precisa filtrar
 * exatamente estes da grade do "Mais": o mesmo destino nos dois lugares somaria
 * badge duas vezes, e o jogador leria "2 pendencias" onde ha uma — a mesma regra
 * que `TELAS_NA_BARRA` ja aplica pros slots da doca.
 */
export const TELAS_NA_COLUNA: { screen: ScreenName; label: string; Icon: Icon }[] = [
  { screen: 'especialidades', label: 'Especialidades', Icon: Sparkle },
  { screen: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { screen: 'bestiario', label: 'Bestiário', Icon: BookBookmark },
]

export function ColunaDeAtalhos() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const trilhoHeight = useUiStore((s) => s.trilhoHeight)
  const { mode } = useDeviceMode()
  // 'deitado' conta como estreito aqui, ao contrario do trilho: ali o que
  // sobra e largura, e o rotulo cabe. Aqui a coluna cresce pra BAIXO, e deitado
  // a tela tem 390px de altura — tres botoes com rotulo comeriam a faixa em que
  // o jogador precisa ver o proprio POKE.
  const soIcone = mode !== 'amplo'

  return (
    // `top` vem da medida do trilho, e nao de um `em` fixo: a altura dele muda
    // com o regime, com o nome da especie em campo e com o `hudScale`. A folga
    // de meio `em` e a mesma que o rodape usa.
    //
    // `pointer-events-none` no container e `auto` nos botoes: a coluna e
    // estreita, mas a caixa dela nao pode capturar clique do canvas na faixa
    // vazia abaixo do ultimo botao.
    <div
      className="pointer-events-none absolute right-[.5em] z-20 flex flex-col items-end gap-[.35em]"
      // No amplo/deitado o card do treinador abre esta coluna e ela comeca no
      // topo da tela; no compacto o card nao existe e ela precisa comecar
      // abaixo do trilho, que ali ocupa a largura toda.
      style={{ top: soIcone ? `calc(${trilhoHeight}px + .5em)` : '.5em' }}
    >
      {!soIcone && <CardDoTreinador />}
      {TELAS_NA_COLUNA.map(({ screen, label, Icon }) => (
        <button
          key={screen}
          type="button"
          // `data-keep-open`: estes botoes ja alternam a tela sozinhos. Sem a
          // marca, o fechar-ao-tocar-fora do sheet fecharia a tela ANTES do
          // onClick e o gesto viraria "fecha e reabre" — mesma razao da doca.
          data-keep-open
          aria-label={label}
          aria-pressed={currentScreen === screen}
          onClick={() => toggleScreen(screen)}
          className={cn(
            'vidro alvo-toque pointer-events-auto flex cursor-pointer items-center gap-[.4em]',
            'rounded-[.7em] px-[.55em] py-[.35em] font-[inherit] text-[.78em] transition-colors',
            currentScreen === screen ? 'text-foreground' : 'text-n300',
          )}
        >
          <Icon className="shrink-0 text-[1.15em]" weight={currentScreen === screen ? 'fill' : 'regular'} />
          {!soIcone && <span className="leading-none">{label}</span>}
        </button>
      ))}
    </div>
  )
}
