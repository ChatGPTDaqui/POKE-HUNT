// Atalhos permanentes abaixo do treinador: Missões (Diário, Objetivos, Tasks,
// Especialidades, Conquistas e Bestiário numa janela só),
// Calculadora e PvP. Ícones com nomes acessíveis em todos os regimes e bolha no PC.
// O topo medido e a rolagem local evitam colisões com a HUD em telas baixas.
import { Calculator, Flag, Sword, type Icon } from '@phosphor-icons/react'
import { usePendenciasDeMissoes } from '@/features/missoes/pendenciasDeMissoes'
import { abaInicial, totalDePendencias } from '@/data/abasDeMissoes'
import { NotificationBadge } from '@/components/game/NotificationBadge'
import { Explicacao } from '@/components/shared/Explicacao'
import type { ReactNode } from 'react'
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
//
// 18/10/2026: Diario, Especialidades e Tasks sairam daqui — viraram abas da
// janela Missoes, que tem um atalho unico logo acima desta lista.
export const TELAS_NA_COLUNA: { screen: ScreenName; label: string; Icon: Icon }[] = [
  { screen: 'calc', label: 'Calculadora', Icon: Calculator },
  { screen: 'pvp', label: 'PvP', Icon: Sword },
]

export function ColunaDeAtalhos() {
  const currentScreen = useUiStore((s) => s.currentScreen)
  const toggleScreen = useUiStore((s) => s.toggleScreen)
  const tranca = useTrancas()
  // O passo atual que aponta pra uma aba de Missoes acende o atalho unico.
  const destaqueTasks = useDestaqueDoPasso('tasks')
  const destaqueEspecialidades = useDestaqueDoPasso('especialidades')
  const destaqueMissoes = destaqueTasks.classe ? destaqueTasks : destaqueEspecialidades
  const destaques: Record<string, ReturnType<typeof useDestaqueDoPasso> | undefined> = {}
  const trilhoHeight = useUiStore((s) => s.trilhoHeight)
  const pendencias = usePendenciasDeMissoes()
  const totalMissoes = totalDePendencias(pendencias)
  const missoesAbertas = currentScreen === 'missoes'
  const abrirMissoes = () => {
    destaqueMissoes.aoTocar()
    if (missoesAbertas) return useUiStore.getState().closeScreen()
    const ui = useUiStore.getState()
    ui.abrirMissoes(abaInicial(pendencias, ui.abaDeMissoes, (a) => tranca(a) != null))
  }
  const navHeight = useUiStore((s) => s.navHeight)

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
      // Treinador no cabeçalho; atalhos abaixo da altura realmente medida.
      style={{ top: `calc(${trilhoHeight}px + .5em)`,
        maxHeight: `calc(100% - ${trilhoHeight + navHeight}px - 1em)`, overflowY: 'auto' }}
    >
      <ShortcutHint label="Missões"><button type="button" data-keep-open aria-label="Missões"
        aria-pressed={missoesAbertas}
        onClick={abrirMissoes}
        className={cn('journey-shortcut vidro pointer-events-auto relative', destaqueMissoes.classe)}>
        <Flag aria-hidden weight={missoesAbertas ? 'fill' : 'regular'} />
        <NotificationBadge count={totalMissoes} titulo={`${totalMissoes} prêmio(s) para coletar em Missões`} />
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
