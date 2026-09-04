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

  // PH-508 — O BUG DE PRODUCAO QUE ESTE ARQUIVO NAO PEGAVA.
  //
  // Todos os casos acima usam `addItem('revive', ...)`, o Revive COMUM. E a
  // condicao de parada checava exatamente esse id literal
  // (`hasItem('revive', 1)`), enquanto quem USA o item — `melhorRevive` — varre
  // a familia inteira (`kind === 'revive'`) e aceita `max_revive` igual.
  //
  // As duas regras precisavam concordar e nao concordavam, e o teste passava
  // porque testava so o caso em que elas por acaso concordam. Medido em
  // producao: um jogador com 149 `max_revive` e ZERO `revive` era expulso da
  // hunt com o toast "Seu POKE desmaiou" TODA vez que voltava ao jogo, com a
  // mochila cheia de revive. Eram 2 dos 6 jogadores com Auto-Revive ligado.
  //
  // O `removeItem` no comeco NAO E ZELO A MAIS: o `beforeEach` deste arquivo
  // nao limpa `items`, e a store e um singleton — os 50 Revives comuns do caso
  // anterior sobrevivem ate aqui. Sem zerar, este teste passaria por causa
  // deles e nao provaria nada, que e o modo de falha mais caro de um teste de
  // regressao.
  it('nao para quando o unico revive da mochila e Max Revive (PH-508)', () => {
    const gameState = useGameStateStore.getState()
    gameState.setAutoToggle('autoRevive', true)
    gameState.removeItem('revive', gameState.items.revive ?? 0)
    gameState.addItem('max_revive', 50)

    // A premissa do caso, afirmada em voz alta: se um dia o `beforeEach` passar
    // a limpar itens (ou o id mudar), estas duas linhas falham antes do resto e
    // dizem por que.
    expect(gameState.hasItem('revive', 1)).toBe(false)
    expect(gameState.hasItem('max_revive', 1)).toBe(true)

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
