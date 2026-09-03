// Port da metade "update" de js/core/GameLoop.js — a metade "render" nao
// faz sentido como hook React (ver plano, decisao "estado do motor"): o
// <GameCanvas> da Fase 5 desenha via seu PROPRIO requestAnimationFrame,
// lendo useWorldStore.getState() direto (imperativo, fora do ciclo de
// render do React) a cada frame — canvas nao tem virtual DOM pra
// reconciliar contra JSX, entao nao ha ganho em rotear o desenho pelo
// React. Este hook so cuida do passo de simulacao fixo (60/s via
// setInterval, pra continuar avancando mesmo com a aba em segundo plano).
import { useEffect, useRef } from 'react'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { stepWorld, LIVE_SIM_STEP_SECONDS } from './simulation'
import { controller } from './controller'
import { recordSimulatedSeconds } from './clockDrift'

// Mesma constante que o resim do servidor usa fora do regime offline
// (authority/src/progresso.ts) — ver o raciocinio completo em
// LIVE_SIM_STEP_SECONDS (simulation.ts, PH-37). Uma fonte so evita os dois
// lados desalinharem nesse numero de novo no futuro.
const STEP = LIVE_SIM_STEP_SECONDS
const UPDATE_INTERVAL_MS = 1000 / 60
const MAX_DELTA = 1.0 // clampa gaps grandes (ex: laptop hibernou) pra nao resolver um combate gigante de uma vez

// Roda o tick de simulacao fixo enquanto `active` for true. `onLiveTick` e
// chamado a cada tick real (nao-replay) — usado pela Fase 5 pra rastrear
// `lastLiveTickAt` (o catch-up de throttle do browser precisa saber quanto
// tempo real se passou desde o ultimo tick real).
export function useGameLoop(active: boolean, onLiveTick?: () => void): void {
  const lastUpdateTimeRef = useRef(0)
  // Ref em vez de dependencia direta do efeito: uma arrow function inline
  // passada pelo chamador (Fase 5, bem provavel) mudaria de identidade a
  // cada render — sem isso, o efeito reiniciaria (limpa+recria o
  // setInterval, zera lastUpdateTimeRef) toda vez que o componente
  // re-renderizasse por qualquer motivo, nao so quando `active` de fato
  // muda.
  const onLiveTickRef = useRef(onLiveTick)
  onLiveTickRef.current = onLiveTick

  useEffect(() => {
    if (!active) return

    lastUpdateTimeRef.current = performance.now()
    const intervalId = setInterval(() => {
      const now = performance.now()
      let delta = (now - lastUpdateTimeRef.current) / 1000
      lastUpdateTimeRef.current = now
      // O excedente do clamp NAO e recuperado aqui de proposito (um unico
      // tick gigante resolveria um combate inteiro de uma vez) — ele vira
      // debito no clockDrift, e o catch-up de segundo plano o simula depois
      // em passos controlados.
      if (delta > MAX_DELTA) delta = MAX_DELTA

      let simulated = 0
      while (delta > 0) {
        const step = Math.min(STEP, delta)
        const gameState = useGameStateStore.getState()
        useWorldStore.getState().update((draft) => {
          stepWorld(draft, step, gameState, { silent: false })
        })
        delta -= step
        simulated += step
      }
      // PH-428: o motor pediu pra avancar de estagio (o toggle do jogador esta
      // ligado e a ultima sala caiu). Quem EXECUTA e aqui, e nao o motor:
      // trocar de estagio abre sessao nova no servidor, e nada disso cabe
      // dentro de um tick sincrono.
      //
      // O pedido e limpo ANTES do `await`: sem isso, cada tick dos ~200ms que
      // a abertura de sessao leva releria o mesmo pedido e dispararia outra
      // — o mesmo padrao de duplo-disparo que a trava de sessao dupla existe
      // pra impedir do lado do banco.
      const alvo = useWorldStore.getState().avancarParaEstagio
      if (alvo) {
        useWorldStore.getState().update((draft) => { draft.avancarParaEstagio = null })
        void controller.enterMap(alvo, { silencioso: true })
      }
      recordSimulatedSeconds(simulated)
      onLiveTickRef.current?.()
    }, UPDATE_INTERVAL_MS)

    return () => clearInterval(intervalId)
  }, [active])
}
