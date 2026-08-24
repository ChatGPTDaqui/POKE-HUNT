// PH-132 — quem o jogador esta enfrentando tem que ser LEGIVEL fora do motor.
//
// O buff do inimigo nao aparecia em lugar nenhum: `estagios` existe em toda
// entidade, mas o HUD lia so `s.player`, e o canvas nao desenha estagio pra
// ninguem. A assimetria era o pior caso — Rosnado NO jogador acendia selo,
// Danca das Espadas NO inimigo nao acendia nada, o que ensina o jogador que
// "selo = tudo que esta ativo" e o deixa confiando numa lista incompleta.
//
// Pra mostrar os efeitos do alvo, a tela precisa saber QUEM e o alvo. O motor ja
// escolhia esse inimigo todo tick (`engagedEnemies[0]`, o `primaryTarget` de
// `executePlayerAction`) e jogava a informacao fora. A alternativa era o HUD
// recalcular a regra de proximidade e engajamento por conta propria — duas
// fontes de verdade pra mesma pergunta, e a do HUD desatualizando em silencio na
// primeira mudanca do motor.
//
// Este teste tranca o contrato: `player.targetId` aponta pro inimigo engajado, e
// volta a null quando nao ha nenhum.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateCombat } from './combatSystem'

function cenario() {
  const rng = createRng(77)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', 40)
  const world = buildMapWorld('route_46', jogadorPoke, { rng, counters })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 0

  const enemyPoke = createPokeInstance(rng, 'rattata', 40)
  const enemySpecies = SPECIES[enemyPoke.speciesId]
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

describe('alvo do jogador publicado no estado (PH-132)', () => {
  it('aponta pro inimigo engajado', () => {
    const { world, player, enemy } = cenario()
    // Nasce sem alvo: `buildMapWorld`/`simulation` zeram o campo.
    expect(player.targetId).toBeNull()

    updateCombat(world, 0)

    expect(
      player.targetId,
      'sem isto a tela nao tem como saber de quem sao os efeitos do alvo',
    ).toBe(enemy.id)
  })

  it('volta a null quando nao ha inimigo engajado', () => {
    const { world, player } = cenario()
    updateCombat(world, 0)
    expect(player.targetId).not.toBeNull()

    // Inimigo desengaja (saiu de alcance, ou trocou de alvo).
    world.enemies[0]!.state = 'wander'
    world.enemies[0]!.targetId = null
    updateCombat(world, 0)

    expect(
      player.targetId,
      'alvo grudado depois de desengajar deixaria a tela mostrando efeito de quem saiu da luta',
    ).toBeNull()
  })

  it('nao aponta pra inimigo morto', () => {
    const { world, player } = cenario()
    updateCombat(world, 0)
    expect(player.targetId).not.toBeNull()

    world.enemies[0]!.poke.hp = 0
    updateCombat(world, 0)

    expect(player.targetId).toBeNull()
  })
})
