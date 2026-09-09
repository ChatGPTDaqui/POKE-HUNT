import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { getAbility } from '@/data/abilities'
import { createPokeInstance } from '@/data/pokes'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { golpeErrou, updateCombat } from './combatSystem'

function cenario(golpe: string) {
  const rng = createRng(512)
  const poke = createPokeInstance(rng, 'charizard', 60)
  poke.activeAbilities = []
  const world = buildMapWorld('route_46', poke, { seed: 512, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  const alvo = createPokeInstance(rng, 'snorlax', 60)
  alvo.hp = alvo.stats.hp = 100_000
  const enemy = createEnemyEntity(world.counters, { poke: alvo, x: player.x + 20, y: player.y, encounterId: 'route_46_rattata' })
  world.enemies = [enemy]
  enemy.state = 'engaged'
  enemy.targetId = player.id
  player.globalCooldown = enemy.globalCooldown = 100
  world.pendingHits = [{ id: 'hit-1', timer: 0, attackerId: player.id, targetId: enemy.id, ability: getAbility(golpe)! }]
  return { world, player, enemy, usar: () => updateCombat(world, 0, { silent: true }) }
}

describe('efeitos das TMs', () => {
  it.each(['fling', 'nature_power', 'return', 'frustration', 'grass_knot'])('%s causa dano real', golpe => {
    const c = cenario(golpe); c.usar()
    expect(c.enemy.poke.hp).toBeLessThan(100_000)
  })
  it('Substitute cobra HP e absorve o próximo golpe sem excedente', () => {
    const c = cenario('substitute'), hp = c.player.poke.hp
    c.usar()
    const custo = Math.floor(c.player.poke.stats.hp / 4)
    expect(c.player.poke.hp).toBe(hp - custo)
    expect(c.player.substitutoHp).toBe(custo)
    c.world.pendingHits = [{ id: 'contra', timer: 0, attackerId: c.enemy.id, targetId: c.player.id, ability: getAbility('tackle')! }]
    c.usar()
    expect(c.player.substitutoHp).toBeLessThan(custo)
    expect(c.player.poke.hp).toBe(hp - custo)
  })
  it('Sleep Talk só causa dano durante sono e mantém o status', () => {
    const c = cenario('sleep_talk'); c.player.poke.activeAbilities = ['sleep_talk', 'tackle']
    c.usar(); expect(c.enemy.poke.hp).toBe(100_000)
    c.player.poke.status = { tipo: 'sleep', turnosRestantes: 2 }
    c.world.pendingHits = [{ id: 'sono', timer: 0, attackerId: c.player.id, targetId: c.enemy.id, ability: getAbility('sleep_talk')! }]
    c.usar()
    expect(c.enemy.poke.hp).toBeLessThan(100_000)
    expect(c.player.poke.status?.tipo).toBe('sleep')
  })
  it('Roar afasta sem abate ou dano', () => {
    const c = cenario('roar'), x = c.enemy.x; c.usar()
    expect(c.enemy.x).toBeGreaterThan(x)
    expect(c.enemy.poke.hp).toBe(100_000)
  })
  it('Attract e Embargo aplicam duração limitada', () => {
    const a = cenario('attract'); a.usar(); expect(a.enemy.atracaoRestante).toBeGreaterThan(0)
    const e = cenario('embargo'); e.usar(); expect(e.enemy.embargoRestante).toBeGreaterThan(0)
  })
  it('Quash adia um hit simultâneo mais lento', () => {
    const c = cenario('quash'), hp = c.player.poke.hp
    c.world.pendingHits.push({ id: 'contra', timer: 0, attackerId: c.enemy.id, targetId: c.player.id, ability: getAbility('tackle')! })
    c.usar()
    expect(c.player.poke.hp).toBe(hp)
    expect(c.world.pendingHits.some(hit => hit.id === 'contra' && hit.timer > 0)).toBe(true)
  })
  it('Overheat causa dano e reduz o ataque especial de quem usou', () => {
    const c = cenario('overheat'); c.usar()
    expect(c.enemy.poke.hp).toBeLessThan(100_000)
    expect(c.player.estagios.atkEsp).toBe(-2)
    expect(c.enemy.estagios.atkEsp ?? 0).toBe(0)
  })
  it('Confide reduz o ataque especial do alvo', () => {
    const c = cenario('confide'); c.usar()
    expect(c.enemy.estagios.atkEsp).toBe(-1)
  })
  it('Aurora Veil exige clima e liga as duas proteções', () => {
    const seco = cenario('aurora_veil'); seco.world.clima = null; seco.usar()
    expect(seco.player.escudos?.reflect ?? 0).toBe(0)
    const c = cenario('aurora_veil'); c.world.clima = { tipo: 'granizo', turnosRestantes: 5, origem: 'golpe' }; c.usar()
    expect(c.player.escudos?.reflect).toBeGreaterThan(0)
    expect(c.player.escudos?.lightScreen).toBeGreaterThan(0)
  })
  it('Trick Room liga e desliga sem infligir dano', () => {
    const c = cenario('trick_room'); c.usar()
    expect(c.world.trickRoomRestante).toBeGreaterThan(0)
    expect(c.enemy.poke.hp).toBe(100_000)
    c.world.pendingHits = [{ id: 'hit-2', timer: 0, attackerId: c.player.id, targetId: c.enemy.id, ability: getAbility('trick_room')! }]
    c.usar()
    expect(c.world.trickRoomRestante).toBe(0)
  })
  it('Volt Switch causa dano e afasta o usuário do alvo', () => {
    const c = cenario('volt_switch'); const antes = c.player.x; c.usar()
    expect(c.enemy.poke.hp).toBeLessThan(100_000)
    expect(c.player.x).toBeLessThan(antes)
  })
  it('Smart Strike não erra mesmo com precisão mínima e evasão máxima', () => {
    const c = cenario('smart_strike'); c.player.estagios.accuracy = -6; c.enemy.estagios.evasion = 6
    for (let i = 0; i < 100; i++) expect(golpeErrou(createRng(i), getAbility('smart_strike')!, c.player, c.enemy)).toBe(false)
  })
})
