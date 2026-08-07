// Card do treinador (topo-direito) + a coluna de menus secundarios embaixo
// dele. Em mobile o card guarda so o avatar e os botoes viram so-icone: o texto
// ao lado do avatar e o primeiro a sair porque e o unico dado do topo que ja
// aparece em outro lugar (o nivel do treinador nao muda o que o jogador pode
// fazer agora).
import { Calculator, User, BookBookmark, CheckSquare, Envelope } from '@phosphor-icons/react'
import { trainerExpProgress } from '@/engine/systems/progressionSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useUiStore, useBreakpoints, type ScreenName } from '@/stores/uiStore'
import { Meter } from '@/components/game/controls'
import { cn } from '@/lib/utils'

const SIDE_MENUS: { screen: ScreenName; label: string; Icon: typeof Envelope }[] = [
  { screen: 'correio', label: 'correio', Icon: Envelope },
  { screen: 'bestiario', label: 'bestiário', Icon: BookBookmark },
  { screen: 'tasks', label: 'tasks', Icon: CheckSquare },
  { screen: 'calc', label: 'calculadora', Icon: Calculator },
]

export function TrainerCard() {
  const trainer = useGameStateStore((s) => s.trainer)
  const { narrow } = useBreakpoints()
  const progress = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <div className="hud-surface pointer-events-auto flex items-center gap-[.8em] rounded-xl border border-n800 p-[.8em] shadow-lg">
      {!narrow && (
        <div className="flex flex-col items-end gap-[.25em]">
          <div className="max-w-[9em] truncate font-medium">{trainer.name}</div>
          <div className="text-[.78em] text-n300">Lv {trainer.level}</div>
          <Meter pct={expPct} height=".35em" color="var(--color-gold)" className="w-[7em]" />
        </div>
      )}
      <div className="flex h-[4.2em] w-[4.2em] shrink-0 items-center justify-center rounded-[.7em] border border-n700 bg-n900">
        <User className="text-[1.8em] text-n300" />
      </div>
    </div>
  )
}

export function SideMenuColumn() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const { narrow } = useBreakpoints()

  return (
    // `data-keep-open`: ver a nota em MainMenu — estes botoes alternam a tela
    // por conta propria e nao podem ser fechados pelo clique-fora antes disso.
    <div data-keep-open className="pointer-events-auto flex flex-col items-end gap-[.5em]">
      {SIDE_MENUS.map(({ screen, label, Icon }) => {
        const active = currentScreen === screen
        return (
          <button
            key={screen}
            type="button"
            title={label}
            onClick={() => toggleScreen(screen)}
            className={cn(
              'hud-surface flex cursor-pointer items-center gap-[.45em] rounded-lg border px-[.7em] py-[.45em]',
              'font-[inherit] text-[.82em] text-foreground transition-colors',
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
              active ? 'border-n400 bg-n800' : 'border-n800 hover:border-primary',
            )}
          >
            <Icon className="text-[1.25em] text-n300" />
            {!narrow && <span>{label}</span>}
          </button>
        )
      })}
    </div>
  )
}
