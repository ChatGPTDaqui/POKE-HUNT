// POKE caido tem que PARAR a simulacao, e isso tem que ser dito em voz alta.
//
// Bug real medido contra o servidor de producao: com o POKE desmaiado, cada
// flush creditava o intervalo inteiro (6h), simulava 0,1 segundo — o primeiro
// passo ja encontra o POKE no chao — e devolvia zero de ouro. Tres flushes
// seguidos: 18 horas de relogio queimadas, nada ganho, nenhum aviso.
//
// Nada disso lanca excecao nem loga: `stoppedEarly` e um booleano no resumo, e
// se ele parar de ser setado (ou passar a ser setado onde nao devia) o unico
// sintoma e "o farm offline nao funciona as vezes". Dai o teste.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { simulateWorldSeconds } from './systems/offlineSimSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

const SEMENTE = 424242
const PASSO = 0.1
const UMA_HORA = 3600

function simular(mapa: string, nivel: number) {
  const gameState = useGameStateStore.getState()
  const rng = createRng(SEMENTE)
  const poke = createPokeInstance(rng, 'charmander', nivel)
  const world = buildMapWorld(mapa, poke, { seed: 0,
    rng: createRng(SEMENTE),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  return {
    poke,
    world,
    correr: () => simulateWorldSeconds({
      world,
      gameState,
      seconds: UMA_HORA,
      stepSeconds: PASSO,
      stepFn: (w, dt, opts) => stepWorld(w, dt, gameState, opts),
    }),
  }
}

describe('farm offline: POKE caido para a simulacao', () => {
  beforeEach(() => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoCatch', false)
    gameState.setAutoToggle('autoPot', false)
    gameState.setAutoToggle('autoRevive', false)
  })

  it('para no primeiro passo quando o POKE ja comeca desmaiado', () => {
    const { poke, world, correr } = simular('route_46', 5)
    poke.hp = 0
    world.player!.poke.hp = 0
    world.player!.fainted = true

    const resumo = correr()

    expect(resumo.stoppedEarly).toBe(true)
    expect(resumo.kills).toBe(0)
    expect(resumo.gold).toBe(0)
    // O ponto: NAO consumiu a hora inteira. Sem a parada, o laco rodaria 36 mil
    // passos com um cadaver em campo.
    expect(resumo.simulatedSeconds).toBeLessThanOrEqual(PASSO * 2)
    expect(resumo.requestedSeconds).toBe(UMA_HORA)
  })

  it('nao para quando auto-revive pode levantar o POKE', () => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('revive', 50)

    const { poke, world, correr } = simular('route_46', 25)
    poke.hp = 0
    world.player!.poke.hp = 0
    world.player!.fainted = true

    const resumo = correr()

    expect(resumo.stoppedEarly).toBe(false)
    expect(resumo.simulatedSeconds).toBeCloseTo(UMA_HORA, 0)
    expect(resumo.kills).toBeGreaterThan(0)
  })

  it('hunt BOSS ignora auto-revive e para mesmo com Revive na mochila', () => {
    // `autoSystem` desliga reanimacao em hunt BOSS (`noRespawn`) de proposito.
    // Sem espelhar essa regra na condicao de parada, o laco considerava o POKE
    // "recuperavel", rodava as 6 horas inteiras sem nenhum abate e devolvia
    // `stoppedEarly: false` — um zero sem explicacao no relatorio.
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoRevive', true)
    gameState.addItem('revive', 50)

    const { poke, world, correr } = simular('boss_articuno', 25)
    expect(world.mapDef?.noRespawn).toBe(true)
    poke.hp = 0
    world.player!.poke.hp = 0
    world.player!.fainted = true

    const resumo = correr()

    expect(resumo.stoppedEarly).toBe(true)
    expect(resumo.simulatedSeconds).toBeLessThanOrEqual(PASSO * 2)
  })
})
