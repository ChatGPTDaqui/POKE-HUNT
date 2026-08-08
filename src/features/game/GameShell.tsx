// Shell do JOGO: canvas + HUD + telas + modais, e os pedacos de js/main.js
// que nao eram nem motor (Fase 4) nem canvas (Fase 5) — boot do Farm Offline,
// catch-up de aba oculta e sync ao sair da pagina.
//
// Era o App.tsx ate a migracao pro Supabase; virou rota autenticada (`/jogo`)
// quando o roteamento entrou. O App.tsx de hoje so cuida de rotas e auth, e
// este componente so monta depois de RequireAuth — entao pode assumir que ha
// sessao.
import { useEffect, useRef, useState } from 'react'
import { GameCanvas } from '@/components/GameCanvas'
import { ToastStack } from '@/components/toasts/ToastStack'
import { PokeProfileModal } from '@/components/modals/PokeProfileModal'
import { ConfirmDialog } from '@/components/modals/ConfirmDialog'
import { LevelUpSplash } from '@/components/modals/LevelUpSplash'
import { BossDefeatModal } from '@/components/modals/BossDefeatModal'
import { LanceCountdownModal, LanceVictoryReturn } from '@/components/modals/LanceModals'
import { ReviveCountdownModal } from '@/components/modals/ReviveCountdownModal'
import { OfflineFarmModal } from '@/components/modals/OfflineFarmModal'
import { HudLayer } from './HudLayer'
import { ScreenOverlay } from '@/features/screens/ScreenOverlay'
import { HuntAnalyzer } from '@/features/hunt/HuntAnalyzer'
import { StartScreen } from '@/features/start/StartScreen'
import { PerfilTreinador } from '@/features/perfil/PerfilTreinador'
import { TutorialModal } from '@/features/tutorial/TutorialModal'
import { useTutorialStore, TUTORIAL_BOT } from '@/stores/tutorialStore'
import { useUiStore } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { observarEstoqueBaixo } from '@/components/auto/estoqueBaixo'
import { useGameStateStore, useHasStarter, readLastSavedAt, forceSave, withSavesDeferred, type GameStateData } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import {
  buildMapWorld,
  stepWorld,
  syncActivePokeToGameState,
  MIN_CATCHUP_GAP_SECONDS,
  MIN_OFFLINE_GAP_SECONDS,
  OFFLINE_FARM_MAX_HOURS,
  OFFLINE_SIM_STEP_SECONDS,
  CATCHUP_CHECK_INTERVAL_MS,
  CATCHUP_WALL_CLOCK_BUDGET_MS,
} from '@/engine/simulation'
import { pendingDriftSeconds, resetDrift } from '@/engine/clockDrift'
import { simulateWorldSeconds, type OfflineSimSummary } from '@/engine/systems/offlineSimSystem'
import { recordBatch } from '@/engine/systems/statsTracker'
import { useProgressoRemoto, type EstadoProgresso } from './useProgressoRemoto'
import { assentarSessaoPendente, commitAgora } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'

// Farm Offline (aba fechada / PC desligado) — porta o bloco de boot do
// js/main.js. Roda uma vez, no primeiro mount, e so quando o save diz que o
// jogador estava DENTRO de uma hunt (`currentMapId`) e ficou fora por mais de
// MIN_OFFLINE_GAP_SECONDS (evita disparar em todo F5 de desenvolvimento).
function useOfflineFarmOnBoot(): { summary: OfflineSimSummary | null; dismiss: () => void } {
  const [summary, setSummary] = useState<OfflineSimSummary | null>(null)
  const ranRef = useRef(false)

  useEffect(() => {
    // Guard de execucao unica: em dev o StrictMode monta o efeito 2x, e
    // simular o mesmo periodo offline duas vezes pagaria a recompensa em
    // dobro.
    if (ranRef.current) return
    ranRef.current = true

    // Sob autoridade do servidor, quem simulou o tempo offline foi ELE — a
    // sessao ficou aberta desde a ultima vez que o jogador jogou. Simular de
    // novo aqui produziria numeros diferentes dos creditados (RNG e mundo
    // independentes), e o jogador veria um relatorio que nao bate com o ouro
    // que recebeu. Entao aqui so pedimos o resumo e mostramos.
    if (servidorAtivo()) {
      void assentarSessaoPendente().then((resumo) => {
        if (resumo && resumo.kills > 0) setSummary(resumo)
      })
      return
    }

    const savedAt = readLastSavedAt()
    if (savedAt == null) return
    const gameState = useGameStateStore.getState()
    const mapId = gameState.currentMapId
    if (!mapId) return
    const activePoke = gameState.team[gameState.activeIndex]
    if (!activePoke) return

    const elapsedSeconds = (Date.now() - savedAt) / 1000
    // `savedAt` no futuro (relogio do aparelho andou pra tras desde o save,
    // ou o save veio de uma maquina adiantada) da gap negativo: pular a
    // simulacao mas reescrever o timestamp com o relogio DESTE aparelho, pra
    // a proxima sessao funcionar normal em vez de ficar travada.
    if (elapsedSeconds < 0) {
      forceSave()
      return
    }
    if (elapsedSeconds < MIN_OFFLINE_GAP_SECONDS) return
    const cappedSeconds = Math.min(elapsedSeconds, OFFLINE_FARM_MAX_HOURS * 3600)

    const world = buildMapWorld(mapId, activePoke)
    const result = withSavesDeferred(() =>
      simulateWorldSeconds({
        world,
        gameState,
        seconds: cappedSeconds,
        stepSeconds: OFFLINE_SIM_STEP_SECONDS,
        stepFn: (w, dt, opts) => stepWorld(w, dt, useGameStateStore.getState(), opts),
      }),
    )
    // O replay acima queimou tempo de parede que nenhum tick ao vivo cobriu —
    // re-ancora o debito pra o primeiro catch-up nao tentar "recuperar" o
    // proprio tempo de carregamento.
    resetDrift()
    forceSave()
    if (result.kills > 0) setSummary(result)
  }, [])

  return { summary, dismiss: () => setSummary(null) }
}

// Correcao de atraso do navegador (aba minimizada/oculta, NUNCA fechada) —
// porta o handler de `visibilitychange` do js/main.js. Navegadores fazem
// throttling agressivo de setInterval em aba oculta; quando ela volta, isso
// roda a simulacao pelo intervalo perdido SOBRE o mundo que ja existe
// (mesmos inimigos/posicoes/cooldowns reais). Sem limite de tempo e
// totalmente silencioso, por decisao explicita do usuario: "se a aba estiver
// aberta nao e farm offline, e so o navegador tendo se perdido".
// O custo dele e limitado (ver maxSteps/maxWallClockMs em
// offlineSimSystem.ts), que e o que impede um gap de varios dias de travar
// um celular.
function useBackgroundCatchUp(): void {
  useEffect(() => {
    function runCatchUp() {
      // O debito vem do clockDrift (tempo de parede menos tempo simulado) —
      // ver o comentario naquele modulo pro porque de "timestamp do ultimo
      // tick" nao servir: sob throttle de timer ele e reescrito o tempo todo
      // e o gap real nunca aparece.
      const gapSeconds = pendingDriftSeconds()
      resetDrift()

      // Relogio andou pra tras (resync de NTP, usuario/SO mudando a hora).
      // Nunca simular gap negativo — so re-ancorar e forcar um save, pra o
      // `savedAt` gravado parar de estar no futuro; senao o Farm Offline
      // ficaria morto ate o tempo real alcancar o timestamp furado.
      if (!Number.isFinite(gapSeconds) || gapSeconds < 0) {
        forceSave()
        return
      }
      if (gapSeconds < MIN_CATCHUP_GAP_SECONDS) return // jitter normal de frame, nao throttle

      const world = useWorldStore.getState()
      if (!world.mapDef || !world.player) return // nada a adiantar no Hospital

      withSavesDeferred(() => {
        useWorldStore.getState().update((draft) => {
          const summary = simulateWorldSeconds({
            world: draft,
            gameState: useGameStateStore.getState(),
            seconds: gapSeconds,
            stepSeconds: OFFLINE_SIM_STEP_SECONDS,
            stepFn: (w, dt, opts) => stepWorld(w, dt, useGameStateStore.getState(), opts),
            maxWallClockMs: CATCHUP_WALL_CLOCK_BUDGET_MS,
          })
          // O painel de taxa (Ouro/H, XP/H) conta o relogio o tempo todo, entao
          // sem isso um catch-up silencioso faria a farmagem parecer mais
          // fraca do que foi de verdade (bug real ja corrigido no vanilla).
          recordBatch(useGameStateStore.getState(), {
            gold: summary.gold,
            xp: summary.xp,
            mobs: summary.kills,
            shinys: summary.shinySeen,
          })
        })
      })
      syncActivePokeToGameState(useWorldStore.getState(), useGameStateStore.getState())
      forceSave()
    }

    function onVisibilityChange() {
      if (document.hidden) {
        // Navegadores mobile matam uma pagina em segundo plano sem disparar
        // `beforeunload` — este (com o `pagehide`) e o unico ponto de save
        // confiavel nesses aparelhos.
        syncActivePokeToGameState(useWorldStore.getState(), useGameStateStore.getState())
        forceSave()
        // `forceSave` NAO grava nada sob autoridade do servidor (o cliente
        // perdeu a escrita na Fase D): sem este commit, ocultar a aba deixava o
        // intervalo inteiro pendente ate o proximo flush de 30s — e num celular
        // que mata a pagina em segundo plano, ate o proximo boot.
        void commitAgora()
        return
      }
      runCatchUp()
    }

    // Tres gatilhos, porque nenhum sozinho dispara em todo dispositivo:
    // - `visibilitychange` cobre o caso comum de trocar de aba/minimizar.
    // - `pageshow` cobre a volta pelo bfcache (botao voltar), onde a pagina
    //   retoma sem necessariamente passar por uma transicao de visibilidade.
    // - o timer periodico cobre os casos SEM nenhum evento de visibilidade:
    //   notebook com a tampa fechada e a aba em foco, tela do celular
    //   desligada em alguns navegadores Android, e o throttle puro de timer
    //   enquanto a aba fica oculta por horas (roda-lo com a aba oculta
    //   tambem mantem o save fresco, entao uma aba descartada em segundo
    //   plano retoma de um ponto recente em vez de uma hora atras).
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pageshow', runCatchUp)
    const catchUpInterval = setInterval(runCatchUp, CATCHUP_CHECK_INTERVAL_MS)
    return () => {
      clearInterval(catchUpInterval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pageshow', runCatchUp)
    }
  }, [])
}

// Level-up e um evento CRITICO: grava na hora, sem esperar o ciclo normal.
//
// Bug relatado: "dou F5 e perco niveis". Sob autoridade do servidor, o que a
// tela mostra entre dois flushes e PREDICAO local — quem credita e o servidor,
// re-simulando o intervalo. Um nivel que a predicao ja mostrou e a verdade
// ainda nao tem volta atras no primeiro carregamento. Nada de tempo se perde,
// mas o numero regride, e pro jogador isso e perda de progresso.
//
// Observa o ESTADO em vez de receber um callback do motor de proposito:
// `engine/simulation.ts` roda identico no servidor (headless) e nao pode
// importar nada de `data/remote`. E observando o estado, todo caminho que sobe
// nivel entra aqui de graca — combate ao vivo, catch-up de aba oculta e o
// proprio flush do servidor.
function useCommitOnLevelUp(): void {
  useEffect(() => {
    const assinatura = (s: GameStateData) =>
      s.trainer.level + s.team.reduce((soma, p) => soma + p.level, 0)
    let anterior = assinatura(useGameStateStore.getState())
    return useGameStateStore.subscribe((estado) => {
      const atual = assinatura(estado)
      // So SUBIDA. Descida acontece por penalidade de morte, por trocar POKE de
      // equipe e — principalmente — quando a resposta do servidor corrige a
      // predicao; commitar ali seria commitar em cima do proprio commit.
      if (atual > anterior) void commitAgora()
      anterior = atual
    })
  }, [])
}

// O `zustand/persist` ja grava a cada mudanca do gameState, mas o HP/EXP do
// POKE em campo vive no worldStore durante a hunt (ver nota de arquitetura em
// engine/controller.ts) — sem isso, fechar a aba no meio de uma luta perderia
// o progresso desde o ultimo sync periodico.
function useSyncOnUnload(): void {
  useEffect(() => {
    function onUnload() {
      syncActivePokeToGameState(useWorldStore.getState(), useGameStateStore.getState())
      forceSave()
    }
    // `pagehide` junto com `beforeunload` de proposito: iOS/Android
    // frequentemente encerram a pagina sem disparar `beforeunload` nenhum, e
    // e nesses aparelhos que "o farm offline nao funciona" aparecia.
    window.addEventListener('beforeunload', onUnload)
    window.addEventListener('pagehide', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('pagehide', onUnload)
    }
  }, [])
}

// Um unico listener de resize pro app inteiro. Alem de alimentar os
// breakpoints, ele LIMPA as posicoes de janela arrastadas: uma janela largada
// no canto direito de uma tela larga fica fora da area visivel quando a janela
// do navegador encolhe, e sem barra de titulo alcancavel nao ha como traze-la
// de volta.
function useViewportTracking(): void {
  useEffect(() => {
    const onResize = () => useUiStore.getState().handleViewportResize(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
}

export function GameShell() {
  const progresso = useProgressoRemoto()

  // Gate obrigatorio, nao cosmetico: montar o jogo antes do progresso chegar
  // faria o GameCanvas construir o mundo com o estado default (equipe vazia) e
  // o primeiro autosave gravaria esse vazio por cima do save real.
  if (progresso.fase !== 'pronto') return <TelaCarregandoProgresso estado={progresso} />

  return <JogoCarregado />
}

function TelaCarregandoProgresso({ estado }: { estado: EstadoProgresso }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      {estado.fase === 'erro' ? (
        <>
          <p className="font-medium text-destructive">Nao foi possivel carregar seu progresso.</p>
          <p className="max-w-md text-sm text-muted-foreground">{estado.mensagem}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md border px-4 py-2 text-sm hover:bg-accent"
          >
            Tentar de novo
          </button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Carregando seu progresso...</p>
      )}
    </div>
  )
}

// Tutorial do Bot no primeiro contato.
//
// Dispara depois de o jogador ter um inicial — antes disso a tela de escolha
// ocupa tudo e um modal por cima dela so atrapalha. Uma vez so por aparelho: o
// controle de "ja viu" mora no localStorage (ver tutorialStore), nao no save,
// porque o save e sobrescrito pelo servidor a cada flush.
function useTutorialInicial(hasStarter: boolean): void {
  const jaDisparou = useRef(false)
  useEffect(() => {
    if (!hasStarter || jaDisparou.current) return
    jaDisparou.current = true
    useTutorialStore.getState().abrirSeInedito(TUTORIAL_BOT)
  }, [hasStarter])
}

// O alerta de "sem bola/pocao/revive" tambem vira linha no chat (aba Sistema).
// O pisca no botao Auto so existe enquanto alguem esta olhando; a linha do chat
// sobrevive a uma hora de jogo em segundo plano.
function useAvisoDeEstoqueNoChat(): void {
  useEffect(() => observarEstoqueBaixo((mensagem) => {
    useToastStore.getState().pushToast(mensagem, 'error', 'world')
  }), [])
}

function JogoCarregado() {
  const hasStarter = useHasStarter()
  const hudScale = useUiStore((s) => s.hudScale)
  const { summary, dismiss } = useOfflineFarmOnBoot()
  useBackgroundCatchUp()
  useSyncOnUnload()
  useViewportTracking()
  useCommitOnLevelUp()
  useTutorialInicial(hasStarter)
  useAvisoDeEstoqueNoChat()

  return (
    <div
      // `.hud-root` define o font-size fluido do qual TODO tamanho em `em` da
      // interface deriva; `--hud-scale` e a preferencia do jogador (0.8–1.4),
      // que multiplica esse ajuste em vez de substitui-lo.
      className="hud-root relative h-svh w-svw overflow-hidden bg-background text-foreground"
      style={{ '--hud-scale': hudScale } as React.CSSProperties}
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
            <HudLayer />
            <ScreenOverlay />
            <ReviveCountdownModal />
            <BossDefeatModal />
            <LanceCountdownModal />
            <LanceVictoryReturn />
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
      <TutorialModal />
      <ConfirmDialog />
      <LevelUpSplash />
      {summary && <OfflineFarmModal summary={summary} onClose={dismiss} />}
    </div>
  )
}
