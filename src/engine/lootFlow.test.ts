// O ganho de um kill NAO pode depender de a captura ter dado certo.
//
// A regra (pedido explicito do usuario): o POKE e derrotado -> o jogador
// recebe 100% do loot/ouro -> so entao a chance de captura e sorteada. Ela ja
// e a ordem de `handleEnemyDefeated`, mas e uma ordem que qualquer refatoracao
// inverte sem parecer errada — e o sintoma ("capturar rende menos que matar")
// so aparece como uma diferenca estatistica de ouro/hora, que ninguem liga ao
// commit que causou.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'

const SEMENTE = 987654321
const MAPA = 'route_46'
const PASSO = 0.1
const PASSOS = 4000

describe('fluxo de loot', () => {
  beforeEach(() => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', true)
    gameState.setAutoToggle('autoRevive', true)
    gameState.setAutoToggle('autoPot', true)
    gameState.addItem('poke_ball', 5000)
  })

  it('todo kill credita ouro, inclusive quando a captura funciona', () => {
    const gameState = useGameStateStore.getState()
    const rng = createRng(SEMENTE)
    const poke = createPokeInstance(rng, 'charmander', 40)
    const world = buildMapWorld(MAPA, poke, { rng: createRng(SEMENTE), counters: { entity: 1, effect: 1, pendingHit: 1 } })

    let comCaptura = 0
    let semOuro = 0
    for (let i = 0; i < PASSOS; i++) {
      for (const kill of stepWorld(world, PASSO, gameState, { silent: true })) {
        if (kill.gold <= 0) semOuro++
        if (kill.captured) comCaptura++
      }
    }

    // Sem nenhuma captura o teste passaria sem provar nada.
    expect(comCaptura).toBeGreaterThan(0)
    expect(semOuro).toBe(0)
  })
})
