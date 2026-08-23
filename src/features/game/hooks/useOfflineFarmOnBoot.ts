import { useEffect, useRef, useState } from 'react'
import { useGameStateStore, readLastSavedAt, forceSave, withSavesDeferred } from '@/stores/gameStateStore'
import {
  buildMapWorld,
  stepWorld,
  MIN_OFFLINE_GAP_SECONDS,
  OFFLINE_FARM_MAX_HOURS,
  OFFLINE_SIM_STEP_SECONDS,
} from '@/engine/simulation'
import { resetDrift } from '@/engine/clockDrift'
import { simulateWorldSeconds, type OfflineSimSummary } from '@/engine/systems/offlineSimSystem'
import { servidorAtivo } from '@/data/remote/servidor'
import { assentarUmaVez } from '../bootDaSessao'
import { farmOfflineSemServidorEhConfiavel, deveSerPessimista } from '../utils'

export function useOfflineFarmOnBoot(): { summary: OfflineSimSummary | null; dismiss: () => void } {
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
      // `assentarUmaVez` e nao `assentarSessaoPendente`: a decisao de reentrar
      // na hunt (PH-93) precisa do MESMO resumo, e chamar o assentamento duas
      // vezes faria o segundo receber `fechada: false` — um dos dois
      // consumidores concluiria que nao havia sessao nenhuma, e qual deles
      // dependeria de quem ganhasse a corrida. Ver features/game/bootDaSessao.
      void assentarUmaVez().then((resumo) => {
        // `stoppedEarly` entra no criterio junto com os abates: a sessao que
        // termina com o POKE no chao pode ter rendido ZERO, e era exatamente
        // esse caso que ficava sem relatorio nenhum. O jogador voltava depois de
        // uma noite fora, nao via modal, nao via ouro, e nao tinha como
        // descobrir que o POKE tinha caido nos primeiros minutos.
        if (resumo && (resumo.kills > 0 || resumo.stoppedEarly)) setSummary(resumo)
      })
      return
    }

    if (!farmOfflineSemServidorEhConfiavel(import.meta.env.PROD)) {
      console.warn(
        '[farm-offline] producao sem servidor de autoridade (VITE_SERVIDOR_URL ausente) — '
        + 'farm offline desabilitado, relogio do dispositivo nao e confiavel',
      )
      return
    }

    console.info(
      '[farm-offline] modo dev sem servidor de autoridade — usando relogio do dispositivo '
      + '(nao confiavel, valido so para desenvolvimento local)',
    )

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
    // Sem isto o farm offline sem servidor (so ativo em dev) rodava com a
    // MESMA distribuicao de dano do jogo ao vivo por ate OFFLINE_FARM_MAX_HOURS
    // sem supervisao — contradiz o invariante de nunca render mais offline
    // que jogando ao vivo (PH-15).
    world.pessimista = deveSerPessimista(elapsedSeconds)
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
