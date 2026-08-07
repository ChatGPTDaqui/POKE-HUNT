// Port do #bottom-nav de index.html (vanilla) + o wiring de
// js/ui/UIManager.js#_wireNav.
//
// Hospital NAO abre uma tela — ele TROCA A CENA do canvas de volta pro
// Hospital, e por isso e um botao de acao no meio dos de tela. Estava faltando:
// sem ele, quem entrava numa hunt so voltava pelo modal de derrota do BOSS, ou
// seja, ficava sem como ir curar. No vanilla o botao existia e fazia exatamente
// isto (UIManager#_wireNav).
//
// Auto continua fora: e um painel flutuante proprio (ver CLAUDE.md, "Auto vira
// botao compacto flutuante").
import { useUiStore, type ScreenName } from '@/stores/uiStore'
import { Button } from '@/components/ui/button'
import { controller } from '@/engine/controller'
import { useWorldStore } from '@/stores/worldStore'

const NAV_ITEMS: { screen: ScreenName; label: string }[] = [
  { screen: 'team', label: '⚾ Equipe' },
  { screen: 'bag', label: '🎒 Mochila' },
  { screen: 'hunt', label: '🗺️ Hunts' },
  { screen: 'shop', label: '🛒 Loja' },
  { screen: 'pokedex', label: '📖 Pokedex' },
  { screen: 'wiki', label: '📚 Wiki' },
  { screen: 'settings', label: '⚙️ Config' },
]

// So aparece quando o jogador esta EM UMA HUNT: no Hospital ele nao faz nada, e
// um botao que nao faz nada e pior que a ausencia dele.
function BotaoHospital() {
  const emHunt = useWorldStore((w) => w.mapDef != null)
  const closeScreen = useUiStore((s) => s.closeScreen)
  if (!emHunt) return null
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-xs"
      onClick={() => {
        void controller.returnToHospital({ x: 0, y: 0 })
        closeScreen()
      }}
    >
      🏥 Hospital
    </Button>
  )
}

export function BottomNav() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const openScreen = useUiStore((s) => s.openScreen)
  const closeScreen = useUiStore((s) => s.closeScreen)

  return (
    <nav className="pointer-events-auto flex flex-wrap justify-center gap-1 rounded-lg border bg-card/90 p-1 backdrop-blur">
      <BotaoHospital />
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
