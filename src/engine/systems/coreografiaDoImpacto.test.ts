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
import { desiredAnimName, hpEmCena } from './animationSystem'
import { deslocamentoDaEsquiva, deslocamentoDoImpacto } from '@/render/reacaoAoGolpe'

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

  it('a barra (hpEmCena) cai um acerto por vez, no ritmo dos numeros', () => {
    const { world, enemy } = cenario('double_kick')
    updateCombat(world, 0)
    // Avanca ate o 1o impacto pousar, sem chegar no 2o.
    for (let t = 0; t < 2 && !enemy.impactoVisual; t += 1 / 60) updateCombat(world, 1 / 60)
    const iv = enemy.impactoVisual!
    expect(iv.danos).toHaveLength(2)
    expect(hpEmCena(enemy)).toBe(enemy.poke.hp + iv.danos![1])
    iv.idade = iv.intervalo + 0.001
    expect(hpEmCena(enemy)).toBe(enemy.poke.hp)
  })

  it('derrota no meio da sequencia: o desmaio espera o ultimo acerto aparecer', () => {
    const { enemy } = cenario('double_kick')
    enemy.poke.hp = 0
    enemy.impactoVisual = { grau: 3, angulo: 0, idade: 0.05, pulsos: 2, intervalo: 0.19, hitstop: 0.15, danos: [40, 30] }
    expect(desiredAnimName(enemy)).toBe('Hurt')
    enemy.impactoVisual.idade = 0.2
    expect(desiredAnimName(enemy)).toBe('Faint')
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

// Golpe que erra (23/11/2026, opcao A do brainstorm): so a cena muda.
describe('golpe que erra na tela', () => {
  function umErro() {
    // Evasao +6 no alvo e Zap Cannon (50%): a precisao efetiva fica ~17%. Varre
    // sementes ate achar um erro — o sorteio e deterministico por semente.
    for (let semente = 0; semente < 40; semente++) {
      const c = cenario('zap_cannon')
      c.world.rng = createRng(semente)
      c.enemy.estagios = { ...c.enemy.estagios, evasion: 6 }
      updateCombat(c.world, 0)
      if (!c.world.pendingHits.length) return c
    }
    throw new Error('nenhuma semente errou')
  }

  it('Errou! sai no instante do impacto, em cima do alvo', () => {
    const { world, enemy } = umErro()
    const aviso = world.effects.find((e) => e.type === 'abilityName' && e.text === 'Errou!')
    expect(aviso?.ownerId).toBe(enemy.id)
    expect(aviso!.delay).toBeGreaterThan(0)
  })

  it('o golpe sai e passa raspando, sem grudar no alvo; o alvo esquiva; quem atacou fica parado', () => {
    const { world, enemy, player } = umErro()
    const golpe = world.effects.find((e) => e.type === 'abilityEffect' && e.abilityId === 'zap_cannon')
    expect(golpe).toBeDefined()
    expect(golpe!.seguirId).toBeUndefined()
    expect(Math.hypot(golpe!.x - enemy.x, golpe!.y - enemy.y)).toBeGreaterThan(15)
    expect(enemy.esquivaVisual?.espera).toBeGreaterThan(0)
    expect(player.travaDoGolpe ?? 0).toBeGreaterThan(0)
    expect(world.effects.some((e) => e.type === 'damageNumber')).toBe(false)
  })

  it('a esquiva toca Hop e desloca a sprite pro lado no impacto', () => {
    const { enemy } = umErro()
    const v = enemy.esquivaVisual!
    expect(deslocamentoDaEsquiva(v, false)).toEqual({ dx: 0, dy: 0 })
    v.idade = v.espera + 0.2
    const d = deslocamentoDaEsquiva(v, false)
    expect(Math.hypot(d.dx, d.dy)).toBeGreaterThan(8)
    expect(desiredAnimName(enemy)).toBe('Hop')
    expect(deslocamentoDaEsquiva(v, true)).toEqual({ dx: 0, dy: 0 })
  })
})
