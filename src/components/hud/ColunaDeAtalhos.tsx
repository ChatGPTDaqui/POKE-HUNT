// Atalhos permanentes abaixo do treinador: Diário, Especialidades, Tasks,
// Calculadora e PvP. Ícones com nomes acessíveis em todos os regimes e bolha no PC.
// O topo medido e a rolagem local evitam colisões com a HUD em telas baixas.
import { CalendarCheck, Calculator, CheckSquare, Sparkle, Sword, type Icon } from '@phosphor-icons/react'
import { useDiarioStore } from '@/stores/diarioStore'
import { usePremiosProntosDoDiario } from '@/features/primeirosPassos/Diario'
import { NotificationBadge } from '@/components/game/NotificationBadge'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { useAuthStore } from '@/stores/authStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { Explicacao } from '@/components/shared/Explicacao'
import type { ReactNode } from 'react'
import { CardDoTreinador } from '@/components/hud/CardDoTreinador'
import { useUiStore, useDeviceMode, type ScreenName } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { avisarTrancado, useTrancas } from '@/features/primeirosPassos/useDesbloqueio'
import { useDestaqueDoPasso } from '@/features/primeirosPassos/useDestaqueDoPasso'

/**
 * Os tres destinos da coluna. Exportado porque `ActionDock` precisa filtrar
 * exatamente estes da grade do "Mais": o mesmo destino nos dois lugares somaria
 * badge duas vezes, e o jogador leria "2 pendencias" onde ha uma — a mesma regra
 * que `TELAS_NA_BARRA` ja aplica pros slots da doca.
 */
export const TELAS_NA_COLUNA: { screen: ScreenName; label: string; Icon: Icon }[] = [
  { screen: 'especialidades', label: 'Especialidades', Icon: Sparkle },
  { screen: 'tasks', label: 'Tasks', Icon: CheckSquare },
  { screen: 'calc', label: 'Calculadora', Icon: Calculator },
  { screen: 'pvp', label: 'PvP', Icon: Sword },
]

export function ColunaDeAtalhos() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const tranca = useTrancas()
  const destaques = { tasks: useDestaqueDoPasso('tasks'), especialidades: useDestaqueDoPasso('especialidades') } as Record<string, ReturnType<typeof useDestaqueDoPasso> | undefined>
  const trilhoHeight = useUiStore((s) => s.trilhoHeight)
  const { mode } = useDeviceMode()
  const premios = usePremiosProntosDoDiario()
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const nomeDoTreinador = useGameStateStore((s) => s.trainer.name)
  const navHeight = useUiStore((s) => s.navHeight)
  const diarioAberto = useDiarioStore((s) => s.painelAberto)
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
      data-journey-shortcuts
      className="pointer-events-none absolute right-[.5em] z-[35] flex flex-col items-end gap-[.15em]"
      // No mobile, foto e nome permanecem acima dos atalhos, abaixo do trilho.
      // No amplo, o card completo ocupa o canto superior direito.
      style={{ top: soIcone ? `calc(${trilhoHeight}px + .5em)` : '.5em',
        maxHeight: `calc(100% - ${soIcone ? trilhoHeight + navHeight : navHeight}px - 1em)`, overflowY: 'auto' }}
    >
      {!soIcone && <CardDoTreinador />}
      {soIcone && <button type="button" data-keep-open aria-label={`Perfil do treinador: ${nomeDoTreinador}`}
        onClick={() => useUiStore.getState().setPerfilOpen(true)} className="journey-trainer-mobile vidro pointer-events-auto flex min-h-[44px] w-[104px] items-center gap-[4px] rounded-[.65em] p-[4px] text-left">
        <AvatarDoTreinador userId={meuId} tamanho={1.5} nome={nomeDoTreinador} />
        <span className="min-w-0 truncate text-[.7em] font-medium leading-tight">{nomeDoTreinador}</span>
      </button>}
      <ShortcutHint label="Diário"><button type="button" data-keep-open aria-label="Diário"
        aria-pressed={diarioAberto}
        onClick={() => useDiarioStore.getState().abrirPainel()}
        className="journey-shortcut vidro pointer-events-auto relative">
        <CalendarCheck aria-hidden weight={diarioAberto ? 'fill' : 'regular'} />
        <NotificationBadge count={premios} titulo={`${premios} prêmios no Diário`} />
      </button></ShortcutHint>
      {TELAS_NA_COLUNA.map(({ screen, label, Icon }) => (
        <ShortcutHint key={screen} label={label}><button
          key={screen}
          type="button"
          // `data-keep-open`: estes botoes ja alternam a tela sozinhos. Sem a
          // marca, o fechar-ao-tocar-fora do sheet fecharia a tela ANTES do
          // onClick e o gesto viraria "fecha e reabre" — mesma razao da doca.
          data-keep-open
          aria-label={label}
          aria-pressed={currentScreen === screen}
          onClick={() => {
            const passo = tranca(screen)
            if (passo) return avisarTrancado(passo)
            useDiarioStore.getState().fecharPainel()
            destaques[screen]?.aoTocar()
            toggleScreen(screen)
          }}
          className={cn(
            'journey-shortcut vidro pointer-events-auto',
            currentScreen === screen ? 'text-foreground' : 'text-n300',
            'relative', tranca(screen) && 'opacity-55', destaques[screen]?.classe,
          )}
        >
          {tranca(screen) && <MarcaDeCadeado passoId={tranca(screen)!} />}
          <Icon className="shrink-0 text-[1.15em]" weight={currentScreen === screen ? 'fill' : 'regular'} />
        </button></ShortcutHint>
      ))}
    </div>
  )
}

function ShortcutHint({ label, children }: { label: string; children: ReactNode }) {
  const { coarse } = useDeviceMode()
  return coarse ? children : <Explicacao envolve="bloco" conteudo={label} side="left">{children}</Explicacao>
}
