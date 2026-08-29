import { GameCanvas } from '@/components/GameCanvas'
import { ToastStack } from '@/components/toasts/ToastStack'
import { CamadaVfx } from '@/components/CamadaVfx'
import { PokeProfileModal } from '@/components/modals/PokeProfileModal'
import { ConfirmDialog } from '@/components/modals/ConfirmDialog'
import { CamadaDeCelebracao } from '@/components/modals/CamadaDeCelebracao'
import { DefeatModal } from '@/components/modals/DefeatModal'
import { LanceCountdownModal, LanceVictoryReturn } from '@/components/modals/LanceModals'
import { ReviveCountdownModal } from '@/components/modals/ReviveCountdownModal'
import { SalaCountdownModal } from '@/components/modals/SalaCountdownModal'
import { ViagemAoHospitalOverlay } from '@/components/modals/ViagemAoHospitalOverlay'
import { OfflineFarmModal } from '@/components/modals/OfflineFarmModal'
import { HudLayer } from '../HudLayer'
import { ScreenOverlay } from '@/features/screens/ScreenOverlay'
import { HuntAnalyzer } from '@/features/hunt/HuntAnalyzer'
import { StartScreen } from '@/features/start/StartScreen'
import { PerfilTreinador } from '@/features/perfil/PerfilTreinador'
import { PerfilPublico } from '@/features/perfil/PerfilPublico'
import { TutorialModal } from '@/features/tutorial/TutorialModal'
import { useUiStore } from '@/stores/uiStore'
import { useHasStarter } from '@/stores/gameStateStore'
import { useOfflineFarmOnBoot } from '../hooks/useOfflineFarmOnBoot'
import { useBackgroundCatchUp } from '../hooks/useBackgroundCatchUp'
import { useSaidaAoEncerrarSessao } from '../hooks/useSaidaAoEncerrarSessao'
import { useSyncOnUnload } from '../hooks/useSyncOnUnload'
import { useViewportTracking } from '../hooks/useViewportTracking'
import { useVoltarFechaPainel } from '../hooks/useVoltarFechaPainel'
import { useCommitOnLevelUp } from '../hooks/useCommitOnLevelUp'
import { useTutorialInicial } from '../hooks/useTutorialInicial'
import { useAvisoDeEstoqueNoChat } from '../hooks/useAvisoDeEstoqueNoChat'

export function JogoCarregado() {
  const hasStarter = useHasStarter()
  const hudScale = useUiStore((s) => s.hudScale)
  const vidroFosco = useUiStore((s) => s.vidroFosco)
  const coarse = useUiStore((s) => s.coarsePointer)
  const tecladoPx = useUiStore((s) => s.tecladoPx)
  const { summary, dismiss } = useOfflineFarmOnBoot()
  useBackgroundCatchUp()
  useSaidaAoEncerrarSessao()
  useSyncOnUnload()
  useViewportTracking()
  useVoltarFechaPainel()
  useCommitOnLevelUp()
  useTutorialInicial(hasStarter)
  useAvisoDeEstoqueNoChat()

  return (
    <div
      // `.hud-root` define o font-size fluido do qual TODO tamanho em `em` da
      // interface deriva; `--hud-scale` e a preferencia do jogador (0.8–1.4),
      // que multiplica esse ajuste em vez de substitui-lo.
      className="hud-root relative h-svh w-svw overflow-hidden bg-background text-foreground"
      data-blur={vidroFosco ? 'off' : undefined}
      // Dedo em vez de mouse: o CSS usa isto pra dar 44px de alvo minimo aos
      // primitivos de controle. Ver "alvo de toque" no index.css.
      data-toque={coarse ? '1' : undefined}
      // `--teclado`: a camada da HUD sobe por cima do teclado virtual (ver
      // `.hud-safe` no index.css e a nota em `uiStore#tecladoPx`). Fica na raiz
      // e nao na `.hud-safe` porque o valor tambem serve pra qualquer coisa
      // futura que precise saber que o teclado esta aberto.
      style={{ '--hud-scale': hudScale, '--teclado': `${tecladoPx}px` } as React.CSSProperties}
    >
      <GameCanvas />

      {/* Camada de HUD. Ela FALTAVA: canvas, HUD, menus e StartScreen eram irmaos
          em fluxo normal, entao tudo depois do canvas (que ocupa a tela inteira)
          era empurrado pra baixo e recortado pelo `overflow-hidden` do pai — o
          jogador via so o cenario, sem menu nenhum. O sinal de que a camada
          existia no desenho original: todo componente de HUD ja traz
          `pointer-events-auto`, que so faz sentido dentro de um pai
          `pointer-events-none`.

          `pointer-events-none` no container e obrigatorio: sem ele esta camada
          cobriria o canvas inteiro e o clique na Enfermeira (cura no Hospital)
          pararia de funcionar. Cada filho reativa o clique por conta propria. */}
      <div className="pointer-events-none absolute inset-0">
        {hasStarter && (
          <>
            {/* `.hud-safe` recorta SO a HUD pelas areas inseguras do aparelho
                (notch, home indicator). O canvas fica de fora de proposito: ele
                e irmao desta camada e continua sangrando ate a borda fisica —
                cortar o cenario pra caber no retangulo seguro deixaria duas
                tarjas pretas em vez de imagem. */}
            <div id="camada-hud" className="hud-safe">
              <HudLayer />
            </div>
            {/* Camada de VFX (PH-190). DEPOIS da HUD na arvore e em `z-25`, pra
                efeito que precisa chegar num elemento do trilho ou da doca nao
                sumir atras dele. Fica ABAIXO de painel/sheet/modal de proposito
                — ver a nota de pilha em `render/camadaVfx.ts`.

                Sem `.hud-safe`: as coordenadas dela tem que casar 1:1 com o
                canvas do jogo, e aquele container recorta pelas areas inseguras
                do aparelho. Recortar aqui deslocaria todo efeito no notch. */}
            <CamadaVfx />
            <ScreenOverlay />
            <ReviveCountdownModal />
            <DefeatModal />
            <LanceCountdownModal />
            <LanceVictoryReturn />
            <SalaCountdownModal />
            <ViagemAoHospitalOverlay />
          </>
        )}

        {/* Escolha do inicial: sobreposicao de tela cheia. Antes entrava no fluxo
            normal e era medida em y=908 — exatamente uma altura de tela abaixo do
            topo, ou seja, fora da area visivel. */}
        {!hasStarter && (
          <div className="pointer-events-auto absolute inset-0 z-40 overflow-y-auto">
            <StartScreen />
          </div>
        )}
      </div>

      <ToastStack />
      <HuntAnalyzer />
      <PokeProfileModal />
      <PerfilTreinador />
      <PerfilPublico />
      <TutorialModal />
      <ConfirmDialog />
      <CamadaDeCelebracao />
      {summary && <OfflineFarmModal summary={summary} onClose={dismiss} />}
    </div>
  )
}
