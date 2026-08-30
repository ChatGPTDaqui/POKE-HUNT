import { useEffect } from 'react'
import { useGameStateStore, forceSave, withSavesDeferred } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import {
  stepWorld,
  syncActivePokeToGameState,
  MIN_CATCHUP_GAP_SECONDS,
  OFFLINE_SIM_STEP_SECONDS,
  CATCHUP_CHECK_INTERVAL_MS,
  CATCHUP_WALL_CLOCK_BUDGET_MS,
} from '@/engine/simulation'
import { pendingDriftSeconds, resetDrift } from '@/engine/clockDrift'
import { simulateWorldSeconds } from '@/engine/systems/offlineSimSystem'
import { recordBatch } from '@/engine/systems/farmRates'
import { commitAgora } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'
import { encurtarTransicaoDeSala } from '@/engine/systems/salaSystem'
import { segundosCatchUpEfetivos, deveSerPessimista } from '../utils'

export function useBackgroundCatchUp(): void {
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

      // Sob autoridade do servidor a sessao aberta ja fica sendo simulada
      // LA — este catch-up local seria predicao pura sobre um mundo que o
      // proximo flush (`INTERVALO_FLUSH_MS`, no maximo 30s) vai substituir
      // pelo calculo real do servidor. `forceSave()` alias ja e no-op sob
      // servidor (ver comentario em onVisibilityChange abaixo), entao rodar
      // a simulacao aqui nao persistia nada — so mostrava um estado (kills,
      // capturas) que desaparecia segundos depois (PH-16).
      if (servidorAtivo()) return

      const world = useWorldStore.getState()
      if (!world.mapDef || !world.player) return // nada a adiantar no Hospital

      const cappedSeconds = segundosCatchUpEfetivos(gapSeconds)
      withSavesDeferred(() => {
        useWorldStore.getState().update((draft) => {
          draft.pessimista = deveSerPessimista(gapSeconds)
          const summary = simulateWorldSeconds({
            world: draft,
            gameState: useGameStateStore.getState(),
            seconds: cappedSeconds,
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
      // PH-302: VOLTAR pra aba tambem fecha a janela na hora.
      //
      // `runCatchUp` sai na primeira linha sob autoridade (`servidorAtivo()`),
      // entao ate aqui ficar visivel de novo nao disparava NADA: a janela em
      // aberto continuava crescendo ate o proximo tique do timer. Numa aba que
      // o navegador tinha congelado, esse tique so vem depois do descongelo — e
      // a janela ja atravessou `LIMIAR_OFFLINE_SEGUNDOS` fazia tempo.
      //
      // `commitAgora` ja tem o piso de `INTERVALO_MINIMO_COMMIT_MS`, entao
      // alternar de aba varias vezes seguidas nao vira rajada de request.
      void commitAgora()
      // A contagem de "Entrando em nova area" corre em tempo SIMULADO, e o loop
      // local quase nao anda com a aba oculta (o navegador derruba o tick):
      // 3 segundos de aviso viravam minutos de jogo congelado depois de voltar.
      // Ninguem estava olhando o overlay — resolve a transicao no proximo tick
      // em vez de fazer o jogador esperar por uma animacao que ja passou.
      useWorldStore.getState().update((draft) => { encurtarTransicaoDeSala(draft) })
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
