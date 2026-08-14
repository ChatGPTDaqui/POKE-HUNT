// world.pessimista zera critico e forca o piso da variacao de dano
// (combatSystem.ts:270-273) — existe pra farm offline NUNCA render melhor que
// jogo ao vivo. O bug real (PH-15) era o farm offline sem servidor nunca
// ligar essa flag: mesma distribuicao de dano do jogo ao vivo por ate 6h sem
// supervisao. Este teste prova o efeito fim-a-fim (mesma semente, mesmo mapa,
// so a flag muda) em vez de so exercitar a formula isolada.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { simulateWorldSeconds } from './systems/offlineSimSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

const SEMENTE = 424242
const PASSO = 0.1
const UMA_HORA = 3600

function simular(pessimista: boolean) {
  const gameState = useGameStateStore.getState()
  const rng = createRng(SEMENTE)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld('route_46', poke, {
    rng: createRng(SEMENTE),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  world.pessimista = pessimista
  return simulateWorldSeconds({
    world,
    gameState,
    seconds: UMA_HORA,
    stepSeconds: PASSO,
    stepFn: (w, dt, opts) => stepWorld(w, dt, gameState, opts),
  })
}

describe('world.pessimista: farm offline nunca renderiza melhor que ao vivo (PH-15)', () => {
  beforeEach(() => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', false)
    gameState.setAutoToggle('autoPot', false)
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('revive', 50)
  })

  it('mesma semente e mapa: pessimista nunca soma mais ouro/XP/abates que o otimista', () => {
    const otimista = simular(false)
    const pessimista = simular(true)

    expect(pessimista.gold).toBeLessThanOrEqual(otimista.gold)
    expect(pessimista.xp).toBeLessThanOrEqual(otimista.xp)
    expect(pessimista.kills).toBeLessThanOrEqual(otimista.kills)
    // Nao pode ser so um empate por falha de setup: precisa ter havido
    // combate real pra comparacao significar algo.
    expect(otimista.kills).toBeGreaterThan(0)
  })
})
