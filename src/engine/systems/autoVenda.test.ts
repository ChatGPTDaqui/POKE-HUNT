// A auto-venda APAGA POKE do jogador em troca de ouro. As formas de errar isso
// nao lancam excecao — vendem o que nao devia e ninguem descobre:
//
//  - shiny vendido (irreversivel, e a captura que o jogador mais quer);
//  - POKE vendido com o bot desligado;
//  - raridade nao marcada indo embora;
//  - POKE vendido mas ainda contado como captura (o relatorio manda o jogador
//    procurar na mochila o que nao esta lá).
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore, defaultGameStateData, type GameStateData } from '@/stores/gameStateStore'
import { attemptCapture, autoVendeEstaCaptura } from './captureSystem'

const rng = createRng(42)

// A store REAL como `GameStateStore` — e exatamente o que o loop do jogo passa
// pro motor (`stepWorld(world, dt, useGameStateStore.getState())`), entao o teste
// exercita o caminho de verdade em vez de um dublê que pode divergir.
function estadoCom(config: Partial<GameStateData['autoSellConfig']>, extras: Partial<GameStateData> = {}) {
  useGameStateStore.setState({
    ...defaultGameStateData(),
    ...extras,
    autoSellConfig: { ligado: true, raridades: [], ...config },
  })
  return {
    get store() { return useGameStateStore.getState() },
    get dados() { return useGameStateStore.getState() },
  }
}

const poke = (over: Partial<ReturnType<typeof createPokeInstance>> = {}) => ({
  ...createPokeInstance(rng, 'bulbasaur', 5, { rarity: 'comum' }),
  hp: 1,
  ...over,
})

describe('autoVendeEstaCaptura()', () => {
  it('shiny NUNCA e vendido, mesmo com a raridade dele marcada', () => {
    const config = { ligado: true, raridades: ['comum' as const, 'mythic' as const] }
    expect(autoVendeEstaCaptura(config, poke({ isShiny: true, rarity: 'comum' }))).toBe(false)
    expect(autoVendeEstaCaptura(config, poke({ isShiny: true, rarity: 'mythic' }))).toBe(false)
  })

  it('desligado nao vende nada, mesmo com raridade marcada', () => {
    expect(autoVendeEstaCaptura({ ligado: false, raridades: ['comum'] }, poke())).toBe(false)
  })

  it('vende so a raridade marcada', () => {
    const config = { ligado: true, raridades: ['comum' as const] }
    expect(autoVendeEstaCaptura(config, poke({ rarity: 'comum' }))).toBe(true)
    expect(autoVendeEstaCaptura(config, poke({ rarity: 'incomum' }))).toBe(false)
  })

  it('lista vazia nao vende nada', () => {
    expect(autoVendeEstaCaptura({ ligado: true, raridades: [] }, poke())).toBe(false)
  })
})

describe('attemptCapture() com auto-venda ligada', () => {
  // `poke_ball` + alvo com 1 de HP: a chance nao e 100%, entao o teste tenta ate
  // capturar em vez de depender de uma semente sortuda.
  function capturarAte(estado: ReturnType<typeof estadoCom>, alvo: ReturnType<typeof poke>) {
    for (let i = 0; i < 500; i++) {
      const r = attemptCapture(rng, estado.store, alvo, 'poke_ball')
      if (r.success) return r
    }
    throw new Error('nao capturou em 500 tentativas — semente ou chance mudou')
  }

  it('POKE vendido nao entra na mochila e o ouro entra na carteira', () => {
    const estado = estadoCom({ raridades: ['comum'] }, { items: { poke_ball: 999 }, wallet: { gold: 0, diamonds: 0 } })

    const r = capturarAte(estado, poke({ rarity: 'comum' }))

    expect(r.success && r.location).toBe('vendido')
    expect(estado.dados.bagPokes).toEqual([])
    expect(estado.dados.wallet.gold).toBeGreaterThan(0)
    expect(r.success && r.location === 'vendido' && r.vendidoPor).toBe(estado.dados.wallet.gold)
  })

  it('raridade fora da lista entra na mochila normalmente, sem ouro', () => {
    const estado = estadoCom({ raridades: ['mythic'] }, { items: { poke_ball: 999 }, wallet: { gold: 0, diamonds: 0 } })

    const r = capturarAte(estado, poke({ rarity: 'comum' }))

    expect(r.success && r.location).toBe('bag')
    expect(estado.dados.bagPokes).toHaveLength(1)
    expect(estado.dados.wallet.gold).toBe(0)
  })

  it('shiny da raridade marcada entra na mochila — a trava do shiny vale aqui tambem', () => {
    const estado = estadoCom({ raridades: ['comum'] }, { items: { poke_ball: 999 }, wallet: { gold: 0, diamonds: 0 } })

    const r = capturarAte(estado, poke({ rarity: 'comum', isShiny: true }))

    expect(r.success && r.location).toBe('bag')
    expect(estado.dados.bagPokes).toHaveLength(1)
    expect(estado.dados.wallet.gold).toBe(0)
  })

  it('a bola e consumida igual, venda ou nao', () => {
    const estado = estadoCom({ raridades: ['comum'] }, { items: { poke_ball: 10 }, wallet: { gold: 0, diamonds: 0 } })
    attemptCapture(rng, estado.store, poke({ rarity: 'comum' }), 'poke_ball')
    expect(estado.dados.items.poke_ball).toBe(9)
  })
})
