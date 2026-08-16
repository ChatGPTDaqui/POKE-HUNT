// Onde cada superficie da HUD fica na tela, e como isso muda com a largura do
// viewport.
//
// Foi extraido do GameShell porque sao duas responsabilidades com ciclos de
// vida diferentes: o GameShell cuida de boot/persistencia/catch-up (efeitos que
// rodam uma vez), este arquivo cuida so de posicionamento.
//
// Os breakpoints sao aplicados em JS e nao por media query porque varias
// decisoes nao sao de estilo: em <640 o card de taxas nao encolhe, ele SOME e o
// mesmo dado reaparece como chip dentro do bloco central (outro ponto da
// arvore) — coisa que media query nao faz. Ver useBreakpoints no uiStore.
//
// Camadas (z-index):
//   0      canvas do jogo
//   18–22  HUD
//   30/31  backdrop + painel de menu
//   40     painel Auto (nao passa pelo backdrop, de proposito)
//   45/46  perfil do POKE
//   50/51  relatorio offline
//   60     confirmacao
//   70     toasts
//
// A HUD continua ABAIXO do backdrop na pilha (ela e escurecida junto com o
// jogo, como o desenho pede) e mesmo assim segue clicavel: o backdrop e
// puramente visual (`pointer-events:none`) e o fechar-ao-clicar-fora e um
// listener de documento — ver GameWindow. Um backdrop que capturasse o clique
// faria trocar de tela exigir dois toques, porque o primeiro acertaria ele em
// vez do botao do menu (bug reproduzido ao vivo nesta rodada, e ja conhecido do
// jogo vanilla).
import { ActivePokeCard } from '@/components/hud/ActivePokeCard'
import { RatesCard } from '@/components/hud/RatesCard'
import { CenterBlock } from '@/components/hud/CenterBlock'
import { TrainerCard, SideMenuColumn } from '@/components/hud/TrainerCard'
import { ZoomControl } from '@/components/hud/ZoomControl'
import { AbilityHud } from '@/components/hud/AbilityHud'
import { StatusEffectsBar } from '@/components/hud/StatusEffectsBar'
import { ChatLog } from '@/components/toasts/ChatLog'
import { AutoButton, AutoWindow } from '@/components/auto/AutoFloatingPanel'
import { MainMenu } from '@/features/nav/MainMenu'
import { useBreakpoints, useUiStore } from '@/stores/uiStore'
import { useWorldStore } from '@/stores/worldStore'
import { useEffect, useRef } from 'react'

export function HudLayer() {
  const { narrow, mid, colStack } = useBreakpoints()
  // O zoom e controle de CAMERA sobre o mapa da hunt. O Hospital e um cenario
  // fixo desenhado pra caber na tela (ver Renderer#_hospitalLayout), entao la
  // o controle nao teria efeito nenhum — botao que nao faz nada e pior que
  // botao ausente. Seletor booleano: so re-renderiza na troca de cena.
  const emHunt = useWorldStore((s) => s.mapDef !== null)
  const footerHeight = useUiStore((s) => s.footerHeight)
  const setFooterHeight = useUiStore((s) => s.setFooterHeight)

  // Mede o rodape (barra de golpes + menu) ao vivo. Chat e Auto ancoram acima
  // dele a partir deste numero — ver a nota em uiStore#footerHeight sobre por
  // que um offset `em` fixo nao serve (rodape muda de altura com a largura E com
  // o hudScale). ResizeObserver cobre os dois: reflow do menu (quebra de fileira)
  // e mudanca de escala disparam o mesmo callback.
  const footerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = footerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFooterHeight(el.getBoundingClientRect().height))
    ro.observe(el)
    setFooterHeight(el.getBoundingClientRect().height)
    return () => ro.disconnect()
  }, [setFooterHeight])

  // Acima do rodape, com uma folga. So no regime empilhado (<780): acima disso o
  // rodape e uma fileira central estreita e o Auto/chat, nos cantos, nao chegam
  // perto. Enquanto a medida nao chega (primeiro paint), cai no valor antigo.
  const acimaDoRodape = footerHeight ? `calc(${footerHeight}px + .8em)` : '10.6em'

  // A pilula de zoom fica sob o card do POKE ativo, entao a altura dela depende
  // de quanto o topo esquerdo ocupa — que muda quando o bloco central desce
  // (mid) e quando o card do POKE perde o card de taxas ao lado (narrow).
  const zoomTop = narrow ? '17em' : mid ? '13.2em' : '11.5em'

  return (
    <>
      {/* topo-esquerdo: POKE ativo + taxas */}
      <div className="absolute top-[.8em] left-[.8em] z-20 flex items-start gap-[.5em]">
        <ActivePokeCard />
        {!narrow && <RatesCard />}
      </div>

      {/* topo-centro: carteira, local, Pokedex. Abaixo de 1140px ele desce pra
          baixo dos cards laterais e se estica, em vez de disputar a faixa do
          meio com eles. */}
      <div
        className="absolute z-[19] flex justify-center"
        style={
          mid
            ? { top: '7.7em', left: '.8em', right: '.8em' }
            : { top: '.8em', left: '50%', transform: 'translateX(-50%)' }
        }
      >
        <CenterBlock />
      </div>

      {/* topo-direito: treinador + coluna de menus secundarios */}
      <div className="absolute top-[.8em] right-[.8em] z-20 flex flex-col items-end gap-[.5em]">
        <TrainerCard />
        <SideMenuColumn />
      </div>

      {emHunt && (
        <div className="absolute left-[.8em] z-[21]" style={{ top: zoomTop }}>
          <ZoomControl />
        </div>
      )}

      {/* rodape-centro: golpes acima do menu. Os dois juntos formam a "faixa
          segura" do rodape — o canvas desenha nome/HP/texto de combate ate uns
          90px acima do sprite, e antes disso essa area estava livre pra colidir
          com a barra de golpes. */}
      <div ref={footerRef} className="absolute bottom-[.8em] left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-[.5em]">
        <StatusEffectsBar />
        <AbilityHud />
        <MainMenu />
      </div>

      {/* Auto: canto inferior direito, explicitamente posicionado. Antes ele
          era filho direto da camada sem wrapper e caia no fluxo normal, ou seja,
          aparecia no canto superior ESQUERDO por cima do HUD. No regime
          empilhado (<780) o menu do rodape cresce e sobe; o Auto tem que ficar
          ACIMA dele (medido), senao a fileira de baixo do menu passa por tras. */}
      <div className="absolute right-[.9em] z-[22]" style={{ bottom: colStack ? acimaDoRodape : '6.8em' }}>
        <AutoButton />
      </div>
      <AutoWindow />

      <ChatLog />
    </>
  )
}
