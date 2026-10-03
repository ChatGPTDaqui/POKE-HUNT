// PH-131 — o critico tem que CHEGAR ao efeito visual.
//
// O defeito era uma omissao de fiação, e o teste de desenho
// (`render/leituraDoDanoNoCombate.test.ts`) nao pegaria: ele monta o
// `WorldEffect` a mao, entao passa mesmo que o motor nunca marque `isCrit`.
// Era exatamente esse o estado antes desta issue — `computeDamage` calculava
// `isCrit`, o campo viajava no `DamageResult`, e `spawnDamageNumber` o ignorava.
// O unico consumidor era a trait Anger Point.
//
// Por isso este arquivo existe separado: ele mede a PONTE, do hit resolvido ao
// efeito que o desenho le.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

/**
 * Cenario minimo: um golpe so na fila do jogador, um inimigo parado e gordo o
 * bastante pra sobreviver ao hit (senao o alvo morre e o efeito de dano
 * disputa espaco com o de recompensa).
 */
function cenario(golpeId: string) {
  const rng = createRng(31)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
  jogadorPoke.activeAbilities = [golpeId]
  jogadorPoke.disabledAbilities = {
    [typedAoeMoveKey(SPECIES.charmander.type)]: true,
    [BASIC_ATTACK.id]: true,
  }
  const world = buildMapWorld('route_46', jogadorPoke, { seed: 0, rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', 40)
  const enemySpecies = SPECIES[enemyPoke.speciesId]
  // Inimigo sem golpe nenhum: so o hit do jogador entra em cena, entao todo
  // `damageNumber` que aparecer e do golpe que este teste disparou.
  enemyPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(enemyPoke, enemySpecies, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  enemyPoke.stats = { ...enemyPoke.stats, hp: 99999 }
  enemyPoke.hp = 99999
  const enemy = createEnemyEntity(world.counters, {
    poke: enemyPoke, x: player.x, y: player.y, encounterId: 'route_46_rattata',
  })
  enemy.state = 'engaged'
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player, enemy }
}

/** Dispara um uso e espera o hit pousar (`HIT_LAND_DELAY`). */
function umUso(world: ReturnType<typeof cenario>['world']) {
  updateCombat(world, 0)
  updateCombat(world, 0.6)
  return world.effects.filter((e) => e.type === 'damageNumber')
}

const GOLPE = 'ember'

describe('o critico chega ao efeito de dano (PH-131)', () => {
  it('hit critico garantido marca `isCrit` no numero de dano', () => {
    const mundo = cenario(GOLPE)
    // Laser Focus: flag de uso unico que forca critico no proximo golpe de
    // dano. E o unico caminho DETERMINISTICO — o sorteio normal dependeria da
    // semente e o teste viraria loteria.
    mundo.player.proximoGolpeCriticoGarantido = true

    const numeros = umUso(mundo.world)

    expect(numeros.length, 'nenhum numero de dano saiu — o cenario nao bateu').toBeGreaterThan(0)
    expect(
      numeros.some((e) => e.isCrit === true),
      'o hit foi critico e o efeito nao carrega a marca: o desenho nao tem como saber',
    ).toBe(true)
  })

  it('hit sem critico nao marca — senao a marca nao significa nada', () => {
    const mundo = cenario(GOLPE)
    // `pessimista` zera o sorteio de critico (mesma flag que o farm offline
    // usa, ver PH-15): garante o lado negativo sem depender de semente.
    mundo.world.pessimista = true

    const numeros = umUso(mundo.world)

    expect(numeros.length, 'nenhum numero de dano saiu — o cenario nao bateu').toBeGreaterThan(0)
    expect(numeros.every((e) => !e.isCrit)).toBe(true)
  })
})

// 03/10: a PONTE tambem tem que chegar ao efeito do GOLPE, nao so ao numero. O
// spec de VFX (D7) diz que critico sobe um tier visual, e o numero de dano ja
// esperava o impacto do tier de cima (`atrasoDoNumeroDeDano`) — mas o
// `abilityEffect` nascia sem `isCrit`, entao o desenho nunca subia e o numero
// saia atrasado em relacao ao que estava na tela.
describe('o critico chega ao efeito do golpe (03/10)', () => {
  const efeitosDoGolpe = (world: ReturnType<typeof cenario>['world']) =>
    world.effects.filter((e) => e.type === 'abilityEffect')

  it('hit critico marca `isCrit` no efeito do golpe', () => {
    const mundo = cenario(GOLPE)
    mundo.player.proximoGolpeCriticoGarantido = true
    umUso(mundo.world)
    const golpes = efeitosDoGolpe(mundo.world)
    expect(golpes.length, 'nenhum efeito de golpe saiu — o cenario nao bateu').toBeGreaterThan(0)
    expect(golpes.some((e) => e.isCrit === true)).toBe(true)
  })

  it('hit sem critico nao marca o efeito do golpe', () => {
    const mundo = cenario(GOLPE)
    mundo.world.pessimista = true
    umUso(mundo.world)
    const golpes = efeitosDoGolpe(mundo.world)
    expect(golpes.length).toBeGreaterThan(0)
    expect(golpes.every((e) => !e.isCrit)).toBe(true)
  })
})
