// Cura limitada por PP (19/10/2026): Recover e afins gastam o PP do catálogo
// contra cada alvo, e trocar de alvo devolve tudo.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK, getAbility } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { createEnemyEntity } from './entity'
import { buildMapWorld } from './simulation'
import { updateCombat } from './systems/combatSystem'
import { ehCuraPura, gastarPpDeCura, ppDeCuraRestante, sincronizarAlvoDaCura, temPpDeCura } from './ppDeCura'

const recover = getAbility('recover')!

describe('PP de cura', () => {
  it('so cura pura conta; dreno e golpe de dano nao', () => {
    expect(ehCuraPura(recover)).toBe(true)
    expect(ehCuraPura(getAbility('giga_drain')!)).toBe(false)
    expect(ehCuraPura(getAbility('tackle')!)).toBe(false)
  })

  it('gasta o PP do catalogo e trocar de alvo devolve', () => {
    const e: { usosDeCura?: Record<string, number>; alvoDaCura?: string | null } = {}
    sincronizarAlvoDaCura(e, 'a')
    for (let i = 0; i < recover.pp; i++) gastarPpDeCura(e, recover)
    expect(ppDeCuraRestante(e, recover)).toBe(0)
    expect(temPpDeCura(e, recover)).toBe(false)
    sincronizarAlvoDaCura(e, 'a')
    expect(temPpDeCura(e, recover)).toBe(false)
    sincronizarAlvoDaCura(e, 'b')
    expect(ppDeCuraRestante(e, recover)).toBe(recover.pp)
  })

  it('em combate, o POKE cura no maximo o PP contra o mesmo alvo', () => {
    const rng = createRng(3)
    const poke = createPokeInstance(rng, 'slowpoke', 40)
    poke.unlockedAbilities = [...poke.unlockedAbilities, 'recover']
    poke.activeAbilities = ['recover']
    poke.disabledAbilities = { [BASIC_ATTACK.id]: true }
    const world = buildMapWorld('route_46', poke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
    const player = world.player!
    const inimigo = createPokeInstance(rng, 'rattata', 40)
    inimigo.disabledAbilities = Object.fromEntries(
      [...golpesUtilizaveis(inimigo, SPECIES.rattata, true), BASIC_ATTACK.id].map((id) => [id, true]),
    )
    const enemy = createEnemyEntity(world.counters, { poke: inimigo, x: player.x, y: player.y, encounterId: 'route_46_rattata' })
    enemy.state = 'engaged'
    enemy.targetId = player.id
    world.enemies = [enemy]

    let curas = 0
    for (let i = 0; i < 60 * 600; i++) {
      player.poke.hp = 1 // sempre "precisa" curar
      const antes = player.poke.hp
      updateCombat(world, 1 / 60, { silent: true })
      if (player.poke.hp > antes) curas++
    }
    expect(curas).toBeGreaterThan(0)
    expect(curas).toBeLessThanOrEqual(recover.pp)
  })
})
