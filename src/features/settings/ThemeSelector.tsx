import { GameButton, GameCard } from '@/components/game/controls'
import { useUiTheme } from '@/components/game/ThemeProvider'

export function ThemeSelector() {
  const { theme, setTheme } = useUiTheme()
  return <GameCard className="flex flex-col gap-[.4em] p-[.6em]">
    <div className="font-medium" id="ui-theme-label">Tema da interface</div>
    <div role="group" aria-labelledby="ui-theme-label" className="grid grid-cols-2 gap-[.4em]">
      <GameButton className="min-w-0 whitespace-normal" variant={theme === 'light' ? 'primary' : 'secondary'} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
        Claro · Jornada
      </GameButton>
      <GameButton className="min-w-0 whitespace-normal" variant={theme === 'dark' ? 'primary' : 'secondary'} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
        Escuro · Dark Glass
      </GameButton>
    </div>
    <div className="text-[.8em] text-menu-muted">Aplica aos menus, chat e HUD. Salvo neste aparelho.</div>
  </GameCard>
}
