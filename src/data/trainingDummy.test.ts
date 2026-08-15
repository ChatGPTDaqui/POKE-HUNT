// Treinamento (boneco de treino): os dois invariantes que fazem dele um
// "decoy" de verdade, e nao uma hunt normal disfarcada.
//
// BUG REAL achado ao vivo montando esta hunt: so travar os IVs ofensivos do
// Wobbuffet em 0 NAO bastava — um Charmander Lv2 de 11 HP desmaiou com o
// proprio Ataque Basico do boneco (Lv60), porque o termo de NIVEL da formula
// de dano pesa mais que o ATK quase zerado. `passiveEnemies` (o inimigo
// nunca ataca) e o que fecha a garantia de verdade, e e exatamente o tipo de
// coisa que so aparece jogando, nao lendo o codigo — dai o teste.
import { describe, expect, it, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from '@/engine/simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { TRAINING_MAP_ID } from './trainingDummy'

describe('Treinamento — boneco de treino', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('o boneco nunca ataca, mesmo com o jogador parado nele por muito tempo', () => {
    const rng = createRng(1)
    const poke = createPokeInstance(rng, 'charmander', 1) // o caso mais fragil possivel
    const world = buildMapWorld(TRAINING_MAP_ID, poke, {
      rng: createRng(1),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    const gameState = useGameStateStore.getState()

    // 5 minutos de jogo parado em cima do boneco — se ele revidasse, um
    // Charmander Lv1 nao sobreviveria nem perto disso.
    for (let i = 0; i < 3000; i++) stepWorld(world, 0.1, gameState, { silent: true })

    expect(world.player!.fainted).toBe(false)
    expect(world.player!.poke.hp).toBe(world.player!.poke.stats.hp) // nunca levou nem um hit
  })

  it('abater o boneco nao rende ouro, XP, item nem captura', () => {
    const rng = createRng(2)
    // POKE forte o bastante pra matar o boneco dentro da janela do teste —
    // o alvo aqui e a RECOMPENSA do abate, nao o combate em si.
    const poke = createPokeInstance(rng, 'charizard', 90)
    const world = buildMapWorld(TRAINING_MAP_ID, poke, {
      rng: createRng(2),
      counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    const gameState = useGameStateStore.getState()
    gameState.addPokeToTeam(poke)

    const ouroAntes = gameState.wallet.gold
    const itensAntes = { ...gameState.items }
    const pokedexAntes = { ...gameState.pokedexKills }

    let kills = 0
    for (let i = 0; i < 3000 && kills === 0; i++) {
      const resultados = stepWorld(world, 0.1, gameState, { silent: true })
      kills += resultados.length
    }

    expect(kills).toBeGreaterThan(0) // o teste so prova algo se um abate de fato aconteceu
    expect(gameState.wallet.gold).toBe(ouroAntes)
    expect(gameState.items).toEqual(itensAntes)
    expect(gameState.pokedexKills).toEqual(pokedexAntes) // nem o Bestiario contabiliza
    expect(gameState.bagPokes.some((p) => p.speciesId === 'wobbuffet')).toBe(false) // noCatch
  })
})
