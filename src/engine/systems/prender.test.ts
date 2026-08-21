// PRENDER O ALVO (PH-72).
//
// 7 golpes descrevem prender e o motor nao tinha o conceito: eles chegam do
// catalogo como `damage-ailment` com `status: null` — a parte de prender foi
// descartada na geracao e sobrou so o dano.
//
// "Preso" aqui, por definicao do usuario: o POKE preso nao pode ser trocado por
// outro da equipe. Mais 1/8 do HP maximo por turno, que e o que faz o golpe valer
// nos dois sentidos — o bloqueio de troca so morde quando o SELVAGEM prende o
// jogador, porque selvagem nao tem equipe pra trocar.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK, TURNO_SEGUNDOS } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { ABILITIES_DATA } from '@/data/generated/abilities.generated'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { GOLPES_QUE_PRENDEM, updateCombat } from './combatSystem'
import { limparEstadoVolatil } from './statusSystem'

function cenario(golpeId: string) {
  const rng = createRng(13)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  jogadorPoke.unlockedAbilities = [...jogadorPoke.unlockedAbilities, golpeId]
  jogadorPoke.activeAbilities = [golpeId]
  jogadorPoke.disabledAbilities = {
    [typedAoeMoveKey(SPECIES.charmander.type)]: true,
    [BASIC_ATTACK.id]: true,
  }
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', 40)
  const enemySpecies = SPECIES[enemyPoke.speciesId]
  enemyPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(enemyPoke, enemySpecies, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  // HP alto: o alvo precisa sobreviver ao golpe E a varios turnos de dano de
  // preso, senao a medicao acaba no primeiro tique.
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

function umUso(mundo: ReturnType<typeof cenario>) {
  updateCombat(mundo.world, 0)
  updateCombat(mundo.world, 0.6)
}

describe('prender o alvo', () => {
  it('os 7 golpes existem no catalogo e sao golpes de DANO', () => {
    expect(GOLPES_QUE_PRENDEM.size).toBe(7)
    for (const id of GOLPES_QUE_PRENDEM) {
      expect(ABILITIES_DATA[id], id).toBeDefined()
      expect(ABILITIES_DATA[id].power, id).toBeGreaterThan(0)
    }
  })

  it('o golpe prende o alvo por 4 ou 5 turnos', () => {
    for (const id of GOLPES_QUE_PRENDEM) {
      const mundo = cenario(id)
      expect(mundo.enemy.presoAte ?? 0, id).toBe(0)
      umUso(mundo)
      const restante = mundo.enemy.presoAte ?? 0
      expect(restante, id).toBeGreaterThan(0)
      expect(restante, id).toBeLessThanOrEqual(TURNO_SEGUNDOS * 5)
    }
  })

  it('preso perde HP por turno mesmo sem levar golpe nenhum', () => {
    const mundo = cenario('fire_spin')
    umUso(mundo)
    expect(mundo.enemy.presoAte ?? 0).toBeGreaterThan(0)

    // Ninguem mais ataca: o jogador fica sem golpe disponivel e o inimigo esta
    // calado. Todo HP que sair daqui pra frente e do dano de preso.
    mundo.player.poke.disabledAbilities = { ...mundo.player.poke.disabledAbilities, fire_spin: true }
    const hpAntes = mundo.enemy.poke.hp
    updateCombat(mundo.world, TURNO_SEGUNDOS)
    expect(mundo.enemy.poke.hp).toBeLessThan(hpAntes)
  })

  it('nao reaplica em alvo ja preso (senao o timer nunca acabaria)', () => {
    const mundo = cenario('fire_spin')
    umUso(mundo)
    const primeiro = mundo.enemy.presoAte ?? 0

    // Segundo uso, com o alvo ainda preso: o timer tem que ter ANDADO, nao
    // voltado ao maximo.
    mundo.player.cooldowns = {}
    mundo.player.globalCooldown = 0
    umUso(mundo)
    expect(mundo.enemy.presoAte ?? 0).toBeLessThan(primeiro)
  })

  it('o timer expira sozinho e solta o alvo', () => {
    const mundo = cenario('fire_spin')
    umUso(mundo)
    expect(mundo.enemy.presoAte ?? 0).toBeGreaterThan(0)
    // Mais que os 5 turnos maximos.
    updateCombat(mundo.world, TURNO_SEGUNDOS * 6)
    expect(mundo.enemy.presoAte ?? 0).toBe(0)
  })

  // Sem isto o jogador ficaria com a troca de equipe travada FORA de combate,
  // sem nada na tela explicando — o pior jeito de um estado volatil vazar.
  it('fim de luta solta o POKE', () => {
    const mundo = cenario('fire_spin')
    umUso(mundo)
    expect(mundo.enemy.presoAte ?? 0).toBeGreaterThan(0)
    limparEstadoVolatil(mundo.enemy)
    expect(mundo.enemy.presoAte).toBeUndefined()
  })
})
