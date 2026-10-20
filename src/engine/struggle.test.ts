// Fim do Ataque Basico (19/10/2026): POKE sem golpe de dano usa o que tem ate
// acabar o PP contra o alvo e so entao parte pro Struggle, que custa 1/4 do HP
// maximo de quem usa.
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { getAbility, RECUO_DO_STRUGGLE, STRUGGLE } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { createEnemyEntity } from './entity'
import { buildMapWorld } from './simulation'
import { updateCombat } from './systems/combatSystem'

const growl = getAbility('growl')!

function cenario(ativos: string[]) {
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'slowpoke', 40)
  poke.unlockedAbilities = [...new Set([...poke.unlockedAbilities, ...ativos])]
  poke.activeAbilities = ativos
  const world = buildMapWorld('route_46', poke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  const player = world.player!
  // Inimigo parado: todos os golpes desligados, entao ele nunca ataca.
  const inimigo = createPokeInstance(rng, 'rattata', 40)
  inimigo.disabledAbilities = Object.fromEntries(golpesUtilizaveis(inimigo, SPECIES.rattata, true).map((id) => [id, true]))
  const enemy = createEnemyEntity(world.counters, { poke: inimigo, x: player.x, y: player.y, encounterId: 'route_46_rattata' })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player, enemy }
}

describe('Struggle', () => {
  it('existe fora do catalogo e cobra 1/4 do HP maximo', () => {
    expect(getAbility(STRUGGLE.id)).toBe(STRUGGLE)
    expect(STRUGGLE.power).toBeGreaterThan(0)
    expect(RECUO_DO_STRUGGLE).toBe(1 / 4)
  })

  it('so status: gasta o PP do golpe contra o alvo e depois usa Struggle com recuo', () => {
    expect(growl.power ?? 0).toBe(0)
    const { world, player, enemy } = cenario(['growl'])
    const max = player.poke.stats.hp
    let ticks = 0
    // Fase 1: o Growl sai ate o PP acabar, sem custo de HP.
    while ((player.usosDeCura?.growl ?? 0) < growl.pp && ticks < 60 * 60 * 30) {
      player.poke.hp = max
      updateCombat(world, 1 / 60, { silent: true })
      ticks++
    }
    expect(player.usosDeCura?.growl).toBe(growl.pp)
    // Fase 2: sem PP, vem o Struggle — o inimigo nao ataca, entao todo HP
    // perdido e recuo, e cada recuo e 1/4 do maximo.
    const hpInimigoAntes = enemy.poke.hp
    let perdeu = 0
    for (let i = 0; i < 60 * 30 && perdeu === 0; i++) {
      const antes = player.poke.hp
      updateCombat(world, 1 / 60, { silent: true })
      perdeu = antes - player.poke.hp
    }
    expect(perdeu).toBe(Math.max(1, Math.round(max * RECUO_DO_STRUGGLE)))
    expect(enemy.poke.hp).toBeLessThan(hpInimigoAntes)
    expect(player.usosDeCura?.growl).toBe(growl.pp)
  })

  it('quem tem golpe de dano nunca usa Struggle', () => {
    const { world, player } = cenario(['tackle'])
    const max = player.poke.stats.hp
    for (let i = 0; i < 60 * 120; i++) {
      player.poke.hp = max
      updateCombat(world, 1 / 60, { silent: true })
      expect(player.poke.hp).toBe(max)
      if (world.enemies[0].poke.hp <= 0) break
    }
  })

  it('tudo desligado de proposito: nao ataca (nem Struggle)', () => {
    const { world, player, enemy } = cenario([])
    player.poke.disabledAbilities = Object.fromEntries(
      golpesUtilizaveis(player.poke, SPECIES.slowpoke, false).map((id) => [id, true]),
    )
    const hp = enemy.poke.hp
    for (let i = 0; i < 60 * 30; i++) updateCombat(world, 1 / 60, { silent: true })
    expect(enemy.poke.hp).toBe(hp)
  })
})
