// Explosao/Autodestruicao aplicam 50% de recoil no proprio atacante — se o
// atacante ja estava em HP baixo, o recoil pode mata-lo no mesmo tick em que
// o dano real do golpe pousa no alvo. `resolveHit` cancela qualquer hit
// enfileirado se o atacante ja estiver morto (guard contra acao enfileirada
// antes de um desmaio anterior); com o recoil enfileirado ANTES do dano real
// (bug original), esse guard cancelava o dano no alvo tambem. PH-10: dano
// real tem que pousar antes do recoil matar quem usou o golpe.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

function construirCenarioExplosao() {
  const rng = createRng(1)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 50)
  jogadorPoke.unlockedAbilities = ['explosion']
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
  const player = world.player!
  player.poke.hp = 1
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', 50)
  const enemyHpAntes = enemyPoke.hp
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]

  return { world, player, enemy, enemyHpAntes }
}

describe('Explosao/Autodestruicao com atacante em HP baixo (PH-10)', () => {
  it('atacante morre do proprio recoil, mas o alvo ainda leva o dano real do golpe', () => {
    const { world, player, enemy, enemyHpAntes } = construirCenarioExplosao()

    // Tick 1: engajado e sem cooldown -> executePlayerAction escolhe Explosao
    // (maior poder no ranking de dano estimado) e enfileira os hits.
    updateCombat(world, 0)
    expect(world.pendingHits.length).toBeGreaterThan(0)

    // Tick 2: os hits pousam no mesmo tick (mesmo timer). Sem o fix, o
    // recoil matava o atacante antes do dano real resolver e o alvo saia
    // ileso.
    updateCombat(world, 999)

    expect(enemy.poke.hp).toBeLessThan(enemyHpAntes)
    expect(player.fainted).toBe(true)
  })
})
