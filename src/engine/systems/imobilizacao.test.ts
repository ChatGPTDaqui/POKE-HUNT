// Sono e congelamento travam o POKE no lugar; sono ainda troca a animacao pra
// 'Sleep'. PARALISIA NAO TRAVA — e isso tambem esta trancado aqui, porque e o
// erro que da vontade de cometer: paralisia e permanente neste motor, e um
// jogador parado nunca mais encontra inimigo (aggro 175px contra spawn a
// 250px no minimo), ou seja, a hunt travaria de vez.
//
// As tres falhas que isto tranca sao silenciosas — nenhuma lanca excecao:
//
// 1. Movimento que continua. `updateMovement` tem cinco chamadas de
//    deslocamento (jogador perseguindo, jogador vagando, inimigo com jogador
//    caido, inimigo perseguindo, inimigo vagando/voltando pro spawn). Esquecer
//    UMA delas deixa o POKE andando so naquele caminho, que e o tipo de coisa
//    que nao aparece num teste feliz.
// 2. Pose errada. O estado continua 'chase'/'wander' de proposito (ver 3), e
//    sem o guard em `desiredAnimName` um POKE congelado desenha a animacao de
//    ANDAR sem sair do lugar.
// 3. Combate que para junto. `updateCombat` filtra inimigos por
//    `state === 'engaged'`. Se a imobilizacao tirasse o inimigo desse estado,
//    um selvagem adormecido deixaria de poder ser ATACADO — o jogador ficaria
//    parado ao lado dele pra sempre. E o erro mais caro dos tres, porque
//    parece "o jogo travou" e nao "a animacao esta errada".
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import type { StatusCondition } from '@/data/statusEffects'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { updateMovement } from './movementSystem'
import { desiredAnimName } from './animationSystem'

function cenario(status: StatusCondition | null, distanciaDoInimigo: number) {
  const rng = createRng(3)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const world = buildMapWorld('route_46', createPokeInstance(rng, 'typhlosion', 30), { rng, counters })
  const player = world.player!
  if (status) player.poke.status = { tipo: status, turnosRestantes: null }

  const enemy = createEnemyEntity(world.counters, {
    poke: createPokeInstance(rng, 'rattata', 10),
    x: player.x + distanciaDoInimigo, y: player.y,
    encounterId: 'route_46_rattata',
  })
  world.enemies = [enemy]
  return { world, player, enemy }
}

/** Roda 3 segundos de movimento e devolve o quanto a entidade andou. */
function andou(world: ReturnType<typeof cenario>['world'], alvo: { x: number; y: number }): number {
  const x0 = alvo.x, y0 = alvo.y
  for (let i = 0; i < 30; i++) updateMovement(world, 0.1)
  return Math.hypot(alvo.x - x0, alvo.y - y0)
}

describe('sono e congelamento travam o POKE no lugar', () => {
  // 600px esta muito alem do raio de aggro (175) e do alcance de engajamento,
  // entao os dois lados so podem estar perseguindo/vagando — o caso em que o
  // movimento realmente acontece.
  it.each(['sleep', 'freeze'] as const)('jogador com %s nao anda atras do inimigo', (status) => {
    const semStatus = cenario(null, 600)
    expect(andou(semStatus.world, semStatus.player)).toBeGreaterThan(0)

    const comStatus = cenario(status, 600)
    expect(andou(comStatus.world, comStatus.player)).toBe(0)
  })

  it.each(['sleep', 'freeze'] as const)('inimigo com %s nao vagueia nem persegue', (status) => {
    const { world, enemy } = cenario(null, 600)
    enemy.poke.status = { tipo: status, turnosRestantes: null }
    expect(andou(world, enemy)).toBe(0)
  })

  // Decisao explicita, e a mais facil de reverter sem querer. Paralisia so
  // corta velocidade e faz perder turno; ela NAO pode entrar em
  // STATUS_QUE_IMOBILIZAM, senao a hunt trava de vez.
  it('paralisia NAO trava — o POKE continua andando', () => {
    const { world, player } = cenario('paralysis', 600)
    expect(andou(world, player)).toBeGreaterThan(0)
    player.state = 'chase'
    expect(desiredAnimName(player)).toBe('Walk')
  })

  it('o inimigo imobilizado CONTINUA engajado — senao ele nao poderia ser atacado', () => {
    // Colado no jogador: sem status isso da 'engaged', e e esse estado que
    // updateCombat exige pra o jogador poder bater nele.
    const { world, enemy } = cenario(null, 20)
    enemy.poke.status = { tipo: 'sleep', turnosRestantes: 3 }
    updateMovement(world, 0.1)
    expect(enemy.state).toBe('engaged')
  })
})

describe('animacao de quem esta imobilizado', () => {
  it('dormindo usa a animacao Sleep, mesmo no meio de uma pose de ataque', () => {
    const { player } = cenario('sleep', 600)
    expect(desiredAnimName(player)).toBe('Sleep')

    player.attackAnim = 'Shoot'
    player.attackAnimTimer = 0.5
    expect(desiredAnimName(player)).toBe('Sleep')
  })

  it('congelado fica em Idle mesmo com o estado em chase', () => {
    const { player } = cenario('freeze', 600)
    player.state = 'chase'
    expect(desiredAnimName(player)).toBe('Idle')
  })

  it('sem status, o mesmo estado ainda desenha Walk', () => {
    const { player } = cenario(null, 600)
    player.state = 'chase'
    expect(desiredAnimName(player)).toBe('Walk')
  })
})
