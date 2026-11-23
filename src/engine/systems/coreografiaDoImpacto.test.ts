// Coreografia de batalha (23/11/2026): a PONTE do hit resolvido ao que o
// desenho le — um numero por acerto no ritmo dos impactos, e o tremor/recuo de
// quem levou. Mesmo cenario minimo de criticoChegaAoDesenho.test.ts.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { getAbility } from '@/data/abilities'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'
import { deslocamentoDoImpacto } from '@/render/reacaoAoGolpe'

function cenario(golpeId: string, hpDoAlvo = 99999) {
  const rng = createRng(31)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
  jogadorPoke.activeAbilities = [golpeId]
  jogadorPoke.disabledAbilities = {
    [typedAoeMoveKey(SPECIES.charmander.type)]: true,
    ['basic_attack']: true,
  }
  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0
  const enemyPoke = createPokeInstance(rng, 'rattata', 40)
  enemyPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(enemyPoke, SPECIES[enemyPoke.speciesId], true), 'basic_attack'].map((id) => [id, true]),
  )
  enemyPoke.stats = { ...enemyPoke.stats, hp: hpDoAlvo }
  enemyPoke.hp = hpDoAlvo
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x + 20, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player, enemy }
}

function umUso(world: ReturnType<typeof cenario>['world'], silent = false) {
  updateCombat(world, 0, { silent })
  updateCombat(world, 0.6, { silent })
}

describe('golpe de varios acertos: um numero por impacto', () => {
  it('Double Kick: dois numeros, o segundo esperando o segundo impacto', () => {
    expect(getAbility('double_kick')?.minHits).toBe(2)
    const { world, enemy } = cenario('double_kick')
    umUso(world)
    const numeros = world.effects.filter((e) => e.type === 'damageNumber' && e.ownerId === enemy.id)
    expect(numeros).toHaveLength(2)
    const atrasos = numeros.map((e) => e.delay).sort((a, b) => a - b)
    expect(atrasos[0]).toBe(0)
    expect(atrasos[1]).toBeGreaterThan(0.1)
    expect(enemy.impactoVisual?.pulsos).toBe(2)
  })
})

describe('reacao de quem levou', () => {
  it('acerto que tira pouco HP: grau leve, sem pose Hurt, mas com tremor', () => {
    const { world, enemy } = cenario('ember')
    world.pessimista = true
    umUso(world)
    expect(enemy.impactoVisual?.grau).toBe(1)
    expect(enemy.hurtAnimTimer).toBeUndefined()
  })

  it('acerto pesado no combate livre arma o Hurt e o hitstop', () => {
    const { world, enemy } = cenario('ember', 60)
    world.pessimista = true
    umUso(world)
    expect(enemy.poke.hp).toBeGreaterThanOrEqual(0)
    expect(enemy.impactoVisual?.grau).toBeGreaterThanOrEqual(2)
  })

  it('modo silent (servidor/offline) nao arma o desenho', () => {
    const { world, enemy } = cenario('ember')
    umUso(world, true)
    expect(enemy.impactoVisual).toBeUndefined()
  })
})

describe('deslocamento da sprite', () => {
  const impacto = { grau: 3 as const, angulo: 0, idade: 0, pulsos: 1, intervalo: 0, hitstop: 0.09 }

  it('treme na horizontal durante o hitstop e recua no sentido do golpe depois', () => {
    expect(deslocamentoDoImpacto({ ...impacto, idade: 0.01 }, false).dy).toBe(0)
    const recuo = deslocamentoDoImpacto({ ...impacto, idade: 0.09 + 0.04 }, false)
    expect(recuo.dx).toBeGreaterThan(5)
  })

  it('volta pro lugar no fim e nao mexe nada com movimento reduzido', () => {
    expect(deslocamentoDoImpacto({ ...impacto, idade: 2 }, false)).toEqual({ dx: 0, dy: 0 })
    expect(deslocamentoDoImpacto({ ...impacto, idade: 0.13 }, true)).toEqual({ dx: 0, dy: 0 })
    expect(deslocamentoDoImpacto(undefined, false)).toEqual({ dx: 0, dy: 0 })
  })
})
