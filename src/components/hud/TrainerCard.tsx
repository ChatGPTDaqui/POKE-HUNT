// Card do treinador (topo-direito) + a coluna de menus secundarios embaixo
// dele. Em mobile o card guarda so o avatar e os botoes viram so-icone: o texto
// ao lado do avatar e o primeiro a sair porque e o unico dado do topo que ja
// aparece em outro lugar (o nivel do treinador nao muda o que o jogador pode
// fazer agora).
import { Calculator, Coin, Diamond, User, BookBookmark, CheckSquare, Envelope } from '@phosphor-icons/react'
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
  const setPerfilOpen = useUiStore((s) => s.setPerfilOpen)
  const { narrow } = useBreakpoints()
  const progress = trainerExpProgress(trainer)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  // Compactacao pedida pelo usuario: o card ocupava ~5,8em de altura (3 linhas
  // de texto empilhadas + .8em de padding em cima e embaixo). Nome e nivel
  // passaram pra MESMA linha e o padding caiu pra .45em — ~5,1em agora, com a
  // foto no tamanho original (4.2em), que era a restricao explicita.
  return (
    <div className="hud-surface pointer-events-auto flex items-center gap-[.45em] rounded-xl border border-n800 p-[.45em] shadow-lg">
      <div className="flex flex-col items-end gap-[.2em]">
        {!narrow && (
          <>
            <div className="flex items-baseline gap-[.4em]">
              <span className="max-w-[8em] truncate font-medium leading-none">{trainer.name}</span>
              <span className="text-[.75em] leading-none text-n300">Lv {trainer.level}</span>
            </div>
            <Meter pct={expPct} height=".3em" color="var(--color-gold)" className="w-[7em]" />
          </>
        )}
        {/* A carteira vive AQUI, colada no treinador (pedido explicito), e nao
            mais no bloco central. O bloco central muda de ancora em <1140px (ele
            desce pra baixo dos cards laterais) — ou seja, o dado mais consultado
            do jogo trocava de lugar conforme a largura da janela. Junto do
            treinador ele fica no mesmo canto em qualquer viewport. */}
        <Carteira />
      </div>
      {/*
        A foto abre o Perfil do Treinador. E um `button` de verdade (nao uma
        `div` com onClick) pra vir de graca com foco por teclado e papel de
        botao pro leitor de tela — e `data-keep-open` porque o modal do perfil
        fecha ao clicar fora, e sem a marca o mesmo clique que o abre tambem o
        fecharia.
      */}
      <button
        type="button"
        data-keep-open
        title="Abrir perfil do treinador"
        onClick={() => setPerfilOpen(true)}
        className={cn(
          'flex h-[4.2em] w-[4.2em] shrink-0 cursor-pointer items-center justify-center rounded-[.7em] border border-n700 bg-n900',
          'transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        )}
      >
        <User className="text-[1.8em] text-n300" />
      </button>
    </div>
  )
}

const fmtMoeda = new Intl.NumberFormat('pt-BR')

function Carteira() {
  const gold = useGameStateStore((s) => s.wallet.gold)
  const diamonds = useGameStateStore((s) => s.wallet.diamonds)
  return (
    <div className="flex items-center gap-[.45em] text-[.8em] leading-none tabular-nums">
      <span className="flex items-center gap-[.25em] font-medium text-gold">
        <Coin weight="fill" /> {fmtMoeda.format(gold)}
      </span>
      <span className="flex items-center gap-[.25em] font-medium text-diamond">
        <Diamond weight="fill" /> {fmtMoeda.format(diamonds)}
      </span>
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
              'hud-surface flex cursor-pointer items-center gap-[.45em] rounded-lg border px-[.55em] py-[.45em]',
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
