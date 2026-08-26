// Auto-status: o bot escolhe e usa sozinho o item que resolve o status negativo
// do POKE.
//
// A logica ja existia, mas pendurada no toggle do Auto-pocao — quem desligava a
// pocao perdia a cura de status sem nenhuma pista do motivo. Agora tem
// interruptor proprio (`autoToggles.autoStatus`).
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from '../simulation'
import { updateAutoHeal } from './autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { StatusCondition } from '@/data/statusEffects'

function cenario(status: StatusCondition, itens: Record<string, number>) {
  const rng = createRng(3)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld('route_46', poke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  player.poke.status = { tipo: status, turnosRestantes: 5 }

  useGameStateStore.setState({
    items: { ...itens },
    autoToggles: { autoPot: false, autoCatch: false, autoRevive: false, autoStatus: true, avancoManualDeSala: false },
  })
  return { world, player, gameState: useGameStateStore.getState() }
}

describe('auto-status', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
  })

  it('usa o item certo pro status que o POKE tem', () => {
    const { world, player, gameState } = cenario('poison', { antidote: 5, awakening: 5 })

    const eventos = updateAutoHeal(world, gameState, 0.1)

    expect(eventos).toEqual([{ type: 'auto_status', itemId: 'antidote' }])
    expect(player.poke.status).toBeNull()
    expect(useGameStateStore.getState().items.antidote).toBe(4)
    // O item do status errado nao foi tocado.
    expect(useGameStateStore.getState().items.awakening).toBe(5)
  })

  // A escolha "mais barato que resolve" e o que separa curar um sono por 30 de
  // ouro de curar por 120. Um "primeiro que serve" gastaria Full Heal sempre.
  it('prefere o mais barato entre os que cobrem o status', () => {
    const { world, gameState } = cenario('sleep', { awakening: 1, full_heal: 1 })

    expect(updateAutoHeal(world, gameState, 0.1)).toEqual([{ type: 'auto_status', itemId: 'awakening' }])
  })

  it('cai no Full Heal quando e o unico que o jogador tem', () => {
    const { world, gameState } = cenario('sleep', { full_heal: 1 })

    expect(updateAutoHeal(world, gameState, 0.1)).toEqual([{ type: 'auto_status', itemId: 'full_heal' }])
  })

  it('nao faz nada sem o item na mochila', () => {
    const { world, player, gameState } = cenario('paralysis', { antidote: 9 })

    expect(updateAutoHeal(world, gameState, 0.1)).toEqual([])
    expect(player.poke.status?.tipo).toBe('paralysis')
  })

  it('respeita o interruptor proprio, e nao mais o do Auto-pocao', () => {
    const { world, player } = cenario('burn', { burn_heal: 5 })
    useGameStateStore.setState({
      autoToggles: { autoPot: true, autoCatch: false, autoRevive: false, autoStatus: false, avancoManualDeSala: false },
    })

    expect(updateAutoHeal(world, useGameStateStore.getState(), 0.1)).toEqual([])
    expect(player.poke.status?.tipo).toBe('burn')

    // ...e com o Auto-pocao DESLIGADO e o Auto-status ligado, cura — que era
    // exatamente o caso impossivel antes.
    useGameStateStore.setState({
      autoToggles: { autoPot: false, autoCatch: false, autoRevive: false, autoStatus: true, avancoManualDeSala: false },
    })
    world.autoTimers.treinador = 0
    expect(updateAutoHeal(world, useGameStateStore.getState(), 0.1))
      .toEqual([{ type: 'auto_status', itemId: 'burn_heal' }])
  })

  // Item 4 da leva QoL: checkbox por item na secao Auto-status. `false`
  // explicito tira o item da lista de candidatos do bot, mesmo com estoque —
  // ausente continua habilitado (default), que os cenarios acima ja cobrem
  // implicitamente (nenhum seta `autoStatusConfig`).
  it('item desligado no config nao e usado mesmo com estoque', () => {
    const { world, player } = cenario('poison', { antidote: 5, awakening: 5 })
    useGameStateStore.setState({ autoStatusConfig: { antidote: false } })

    expect(updateAutoHeal(world, useGameStateStore.getState(), 0.1)).toEqual([])
    expect(player.poke.status?.tipo).toBe('poison')
    expect(useGameStateStore.getState().items.antidote).toBe(5)
  })

  it('com o mais barato desligado, cai pro proximo que cobre o status', () => {
    const { world } = cenario('sleep', { awakening: 1, full_heal: 1 })
    useGameStateStore.setState({ autoStatusConfig: { awakening: false } })

    expect(updateAutoHeal(world, useGameStateStore.getState(), 0.1))
      .toEqual([{ type: 'auto_status', itemId: 'full_heal' }])
  })

  it('a confusao (volatil) tambem e curada', () => {
    const rng = createRng(3)
    const poke = createPokeInstance(rng, 'charmander', 30)
    const world = buildMapWorld('route_46', poke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
    const player = world.player!
    player.statusVolatil = { tipo: 'confusion', turnosRestantes: 3 }
    useGameStateStore.setState({
      items: { full_heal: 2 },
      autoToggles: { autoPot: false, autoCatch: false, autoRevive: false, autoStatus: true, avancoManualDeSala: false },
    })

    expect(updateAutoHeal(world, useGameStateStore.getState(), 0.1))
      .toEqual([{ type: 'auto_status', itemId: 'full_heal' }])
    expect(player.statusVolatil).toBeNull()
  })
})
