// Golpe de barreira/protecao cria o efeito de desenho em QUEM USOU (12/11).
//
// Estes golpes nao tem `status`/`statChanges` no catalogo — o efeito e por id
// no motor — e por isso nao marcavam "algo pegou": o golpe saia sem efeito
// nenhum na tela. A familia Barreiras (render/vfx) desenha em cima do efeito
// criado aqui. So desenho: nada de dano, rng ou relogio muda.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { getAbility } from '@/data/abilities'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateCombat } from './combatSystem'

function usar(abilityId: string, antes?: (player: NonNullable<ReturnType<typeof buildMapWorld>['player']>) => void) {
  const poke = createPokeInstance(createRng(1), 'kangaskhan', 50, { rarity: 'comum' })
  const world = buildMapWorld('route_46', poke, { seed: 0, rng: createRng(1), counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  const enemy = criarInimigoDeTeste(world, 'rattata', 50, { x: player.x + 40, y: player.y })
  enemy.targetId = player.id
  world.enemies = [enemy]
  antes?.(player)
  world.effects = []
  world.pendingHits.push({
    id: `hit-${world.counters.pendingHit++}`,
    timer: 0, attackerId: player.id, targetId: enemy.id, ability: getAbility(abilityId)!,
  })
  updateCombat(world, 0)
  return { player, efeitos: world.effects.filter((e) => e.type === 'abilityEffect' && e.abilityId === abilityId) }
}

describe('barreira cria o efeito em quem usou', () => {
  for (const id of ['protect', 'detect', 'endure', 'wide_guard', 'reflect', 'light_screen', 'safeguard', 'mist', 'lucky_chant']) {
    it(id, () => {
      const { player, efeitos } = usar(id)
      expect(efeitos).toHaveLength(1)
      expect(efeitos[0].x).toBe(player.x)
      expect(efeitos[0].origemX).toBe(player.x)
      expect(efeitos[0].isAoe).toBeFalsy()
    })
  }

  it('protecao que FALHA nao mostra barreira', () => {
    // 30 usos seguidos: chance ~0 de pegar.
    const { player, efeitos } = usar('protect', (p) => { p.protecoesSeguidas = 30 })
    expect(player.protegida).toBeFalsy()
    expect(efeitos).toHaveLength(0)
  })
})

describe('clima cria o efeito de invocacao em quem usou', () => {
  for (const id of ['rain_dance', 'sunny_day', 'hail', 'sandstorm']) {
    it(id, () => {
      const { player, efeitos } = usar(id)
      expect(efeitos).toHaveLength(1)
      expect(efeitos[0].x).toBe(player.x)
      expect(efeitos[0].origemX).toBe(player.x)
      expect(efeitos[0].isAoe).toBeFalsy()
    })
  }
})
