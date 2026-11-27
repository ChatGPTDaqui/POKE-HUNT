import { GameCard, SegmentedTabs } from '@/components/game/controls'
import { useUiTheme } from '@/components/game/ThemeProvider'

// Escolha exclusiva entre dois temas: controle segmentado, nao dois botoes
// primarios/secundarios (pendencias da auditoria dos menus, 26/11/2026).
const TEMAS = [
  { value: 'light' as const, label: 'Claro · Jornada' },
  { value: 'dark' as const, label: 'Escuro · Dark Glass' },
]

export function ThemeSelector() {
  const { theme, setTheme } = useUiTheme()
  return <GameCard className="flex flex-col gap-[.4em] p-[.6em]">
    <div className="font-medium" id="ui-theme-label">Tema da interface</div>
    <div role="group" aria-labelledby="ui-theme-label">
      <SegmentedTabs className="grid w-full grid-cols-2" value={theme} onChange={setTheme} options={TEMAS} />
    </div>
    <div className="text-[.8em] text-menu-muted">Aplica aos menus, chat e HUD. Salvo neste aparelho.</div>
  </GameCard>
}
