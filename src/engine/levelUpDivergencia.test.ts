// PH-37: causa raiz do level-up do POKE que o client mostrava e o servidor
// nunca confirmava.
//
// O resim do servidor (authority/src/progresso.ts#simularSessao) usava
// OFFLINE_SIM_STEP_SECONDS (0.1s) pra QUALQUER flush, inclusive o normal ao
// vivo -- o client (useGameLoop.ts) roda a 1/60s, 6x mais fino. RNG e
// sorteado por EVENTO (ataque, status), mas o INSTANTE em que um cooldown
// cruza zero e disparara o evento depende do tamanho do passo -- client e
// servidor, resimulando o MESMO rng_state pelo MESMO numero de segundos,
// cruzam esses limiares em instantes simulados diferentes e a sequencia de
// sorteios desalinha cedo. Nada disto depende de interacao real do jogador:
// os dois lados sao auto-battle puro.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld, LIVE_SIM_STEP_SECONDS, OFFLINE_SIM_STEP_SECONDS } from './simulation'
import { simulateWorldSeconds } from './systems/offlineSimSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

// Semente/mapa/duracao escolhidos por reproduzirem o mecanismo do bug de
// forma estavel (ver teste "documenta o mecanismo" abaixo) -- nao precisam
// bater com o caso relatado ao vivo (Charmander nivel 1->2), so precisam
// exercitar combate real o bastante pra um level-up acontecer.
const SEMENTE = 424242
const MAPA = 'route_46'
const SEGUNDOS = 90

function mundoInicial(): WorldState {
  const rng = createRng(SEMENTE)
  const poke = createPokeInstance(rng, 'charmander', 1)
  return buildMapWorld(MAPA, poke, { rng: createRng(SEMENTE), counters: { entity: 1, effect: 1, pendingHit: 1 } })
}

// Client de verdade: `useGameLoop.ts` fatia qualquer gap em sub-passos FIXOS
// de `STEP` (aqui LIVE_SIM_STEP_SECONDS) -- e exatamente isto que ele faz.
function rodarComoOClienteAoVivo(segundos: number): WorldState {
  const gameState = useGameStateStore.getState()
  const world = mundoInicial()
  let restante = segundos
  while (restante > 0) {
    const passo = Math.min(LIVE_SIM_STEP_SECONDS, restante)
    stepWorld(world, passo, gameState, { silent: true })
    restante -= passo
  }
  return world
}

describe('PH-37: passo de resimulacao afeta o nivel final do POKE', () => {
  it('documenta o mecanismo: passo 0.1s (bug) diverge do passo 1/60s (client) no mesmo intervalo', () => {
    const gameState = useGameStateStore.getState()

    const aoVivo = rodarComoOClienteAoVivo(SEGUNDOS)

    const comPassoOffline = mundoInicial()
    simulateWorldSeconds({
      world: comPassoOffline,
      gameState,
      seconds: SEGUNDOS,
      stepSeconds: OFFLINE_SIM_STEP_SECONDS,
      stepFn: (w, dt, opts) => stepWorld(w, dt, gameState, opts),
    })

    // O proprio mecanismo do bug: mesma semente, mesmo intervalo, resultado
    // diferente SO por causa do tamanho do passo. `exp`/`rng.draws` sao mais
    // sensiveis que `level` (que so muda ao cruzar um limiar) -- e sao os
    // dois que provam a sequencia de sorteios ja desalinhou, mesmo quando por
    // coincidencia os dois lados terminam no mesmo nivel.
    expect([comPassoOffline.player!.poke.exp, comPassoOffline.rng.draws]).not.toEqual(
      [aoVivo.player!.poke.exp, aoVivo.rng.draws],
    )
  })

  it('FIX: passo do servidor batendo com o do client (LIVE_SIM_STEP_SECONDS) reproduz o mesmo resultado', () => {
    const gameState = useGameStateStore.getState()

    const aoVivo = rodarComoOClienteAoVivo(SEGUNDOS)

    // simulateWorldSeconds() e a MESMA funcao que authority/src/progresso.ts
    // chama no flush -- com o fix (PH-37), fora do regime offline ela recebe
    // stepSeconds: LIVE_SIM_STEP_SECONDS em vez de OFFLINE_SIM_STEP_SECONDS.
    const resimDoServidor = mundoInicial()
    simulateWorldSeconds({
      world: resimDoServidor,
      gameState,
      seconds: SEGUNDOS,
      stepSeconds: LIVE_SIM_STEP_SECONDS,
      stepFn: (w, dt, opts) => stepWorld(w, dt, gameState, opts),
    })

    expect(resimDoServidor.player!.poke.level).toBe(aoVivo.player!.poke.level)
    expect(resimDoServidor.player!.poke.exp).toBe(aoVivo.player!.poke.exp)
    expect(resimDoServidor.rng.draws).toBe(aoVivo.rng.draws)
  })
})
