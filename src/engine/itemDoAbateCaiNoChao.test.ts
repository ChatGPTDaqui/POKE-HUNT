// O ITEM DO ABATE CHEGA AO CLIENTE COMO EFEITO (11/10).
//
// O desenho (render/itemNoChao.ts) so le efeitos `rewardText` com
// `unit: 'item'`. Este teste mede a ponte no motor: o item que caiu gera o
// efeito com o `itemId` certo, e no `silent` (servidor/flush) nao nasce nada.
import { beforeEach, describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld, handleEnemyDefeated } from './simulation'

function mundoComDropGarantido() {
  const rng = createRng(3)
  const gs = useGameStateStore.getState()
  gs.resetToDefaults()
  const poke = createPokeInstance(rng, 'charmander', 30)
  gs.addPokeToTeam(poke)
  gs.setActiveIndex(0)
  const world = buildMapWorld('route_46', useGameStateStore.getState().team[0], {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  world.sala = null
  world.mapDef = { ...world.mapDef!, itemDrops: [{ itemId: 'potion', chance: 1 }] }
  const inimigo = world.enemies[0]
  expect(inimigo, 'o cenario precisa de um inimigo').toBeDefined()
  return { world, inimigo, gameState: useGameStateStore.getState() }
}

const efeitosDeItem = (world: ReturnType<typeof mundoComDropGarantido>['world']) =>
  world.effects.filter((e) => e.type === 'rewardText' && e.unit === 'item')

describe('item do abate vira efeito pro chao (11/10)', () => {
  beforeEach(() => useGameStateStore.getState().resetToDefaults())

  it('cada item derrubado gera um efeito com o itemId', () => {
    const { world, inimigo, gameState } = mundoComDropGarantido()
    const r = handleEnemyDefeated(world, inimigo, gameState)
    expect(r.droppedItems).toContain('potion')
    const ids = efeitosDeItem(world).map((e) => e.itemId)
    expect(ids).toEqual(r.droppedItems)
  })

  it('no silent (servidor) nenhum efeito nasce', () => {
    const { world, inimigo, gameState } = mundoComDropGarantido()
    const r = handleEnemyDefeated(world, inimigo, gameState, { silent: true })
    expect(r.droppedItems).toContain('potion')
    expect(efeitosDeItem(world)).toHaveLength(0)
  })
})
