// Port do #bottom-nav de index.html (vanilla) + o wiring de
// js/ui/UIManager.js#_wireNav.
//
// Hospital e Auto NAO estao aqui de proposito: Hospital e uma cena do canvas
// (clicar na enfermeira, ver GameCanvas.tsx), e Auto e um painel flutuante
// fora do sistema de telas (ver CLAUDE.md "Auto vira botao compacto
// flutuante").
import { useUiStore, type ScreenName } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'

const NAV_ITEMS: { screen: ScreenName; label: string }[] = [
  { screen: 'team', label: '⚾ Equipe' },
  { screen: 'bag', label: '🎒 Mochila' },
  { screen: 'hunt', label: '🗺️ Hunts' },
  { screen: 'shop', label: '🛒 Loja' },
  { screen: 'pokedex', label: '📖 Pokedex' },
  { screen: 'wiki', label: '📚 Wiki' },
  { screen: 'settings', label: '⚙️ Config' },
]

export function BottomNav() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const openScreen = useUiStore((s) => s.openScreen)
  const closeScreen = useUiStore((s) => s.closeScreen)

  return (
    <nav className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-lg border bg-card/90 p-1 backdrop-blur">
      {NAV_ITEMS.map(({ screen, label }) => (
        <Button
          key={screen}
          size="sm"
          variant={currentScreen === screen ? 'default' : 'ghost'}
          className="text-xs"
          // Clicar de novo na tela ja aberta fecha (toggle) — mesmo
          // comportamento do nav do vanilla.
          onClick={() => (currentScreen === screen ? closeScreen() : openScreen(screen))}
        >
          {label}
        </Button>
      ))}
    </nav>
  )
}
