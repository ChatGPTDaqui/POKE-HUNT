// Substitui o sistema de overlay de js/ui/UIManager.js (#overlay-root +
// PANEL_RENDERERS + _renderScreen).
//
// Duas coisas do vanilla que NAO precisam ser portadas:
//  - `_scrollPositions`: la o painel inteiro era destruido e recriado a cada
//    clique de filtro (`refresh()` = `overlayRoot.innerHTML = ''`), entao a
//    posicao do scroll tinha que ser salva/restaurada a mao. Aqui o painel e
//    um componente montado — ele so re-renderiza, o node de scroll continua
//    o mesmo, e a posicao se mantem sozinha.
//  - O padrao de "DOM incremental" pra nao quebrar clique: o reconciler do
//    React ja resolve isso.
import { useUiStore } from '@/stores/uiStore'
import { useDraggable } from '@/hooks/useDraggable'
import { TeamMenu } from '@/features/team/TeamMenu'
import { BagMenu } from '@/features/bag/BagMenu'
import { ShopMenu } from '@/features/shop/ShopMenu'
import { HuntMenu } from '@/features/hunt/HuntMenu'
import { PokedexMenu } from '@/features/pokedex/PokedexMenu'
import { WikiMenu } from '@/features/wiki/WikiMenu'
import { SettingsScreen } from '@/features/settings/SettingsScreen'
import { Button } from '@/components/ui/button'

const PANELS = {
  team: TeamMenu,
  bag: BagMenu,
  shop: ShopMenu,
  hunt: HuntMenu,
  pokedex: PokedexMenu,
  wiki: WikiMenu,
  settings: SettingsScreen,
} as const

export function ScreenOverlay() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const closeScreen = useUiStore((s) => s.closeScreen)
  const { elementRef, handleRef } = useDraggable<HTMLDivElement, HTMLDivElement>()

  if (!currentScreen) return null
  const Panel = PANELS[currentScreen]

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 bg-black/50"
      // Clique-fora-fecha: so quando o alvo e o proprio backdrop, nunca um
      // clique que borbulhou de dentro do painel.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeScreen()
      }}
    >
      <div
        ref={elementRef}
        className="absolute top-1/2 left-1/2 flex max-h-[78vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
      >
        {/* Barra de titulo: alca de arrastar + botao fechar, fora da area
            rolavel pra continuar acessivel com a lista longa. */}
        <div ref={handleRef} className="flex shrink-0 cursor-move items-center justify-end border-b px-2 py-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={closeScreen}>
            ✕
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Panel />
        </div>
      </div>
    </div>
  )
}
