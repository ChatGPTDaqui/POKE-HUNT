// EFEITOS QUE O GERADOR DO CATALOGO PERDEU (PH-70).
//
// Tres familias, uma causa: `scripts/generate-catalog-usum.js` nao consegue
// expressar o efeito e grava o golpe vazio. Nenhuma delas quebrava nada de forma
// visivel — o golpe simplesmente nao fazia o que a descricao dizia.
//
//   1. Estagio de PRECISAO/EVASAO. O gerador nao emite nenhum dos dois. Cinco
//      golpes ja tinham sido remendados a mao; sete faltavam.
//   2. Tri Attack. Categoria PokeAPI `damage-ailment` com `status: null` — o
//      campo guarda UM status e o golpe tem tres, entao os tres se perderam.
//   3. Poder condicional ("dobra de forca contra X"). A condicao vive no texto
//      da PokeAPI e nao ha campo pra ela.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { BASIC_ATTACK, getAbility } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { typedAoeMoveKey } from '@/data/typedAoeMoves'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { MULTIPLICADOR_CONDICIONAL, STATUS_SORTEADO, updateCombat } from './combatSystem'

const PRECISAO_RECUPERADA = [
  'mud_slap', 'mud_bomb', 'mirror_shot', 'muddy_water', 'octazooka', 'leaf_tornado',
]

function cenario(golpeId: string, { nivel = 40 } = {}) {
  const rng = createRng(5)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const jogadorPoke = createPokeInstance(rng, 'charmander', nivel)
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

  const enemyPoke = createPokeInstance(rng, 'rattata', nivel)
  const enemySpecies = SPECIES[enemyPoke.speciesId]
  enemyPoke.disabledAbilities = Object.fromEntries(
    [...golpesUtilizaveis(enemyPoke, enemySpecies, true), BASIC_ATTACK.id].map((id) => [id, true]),
  )
  // HP alto pro alvo sobreviver aos varios usos que alguns testes precisam.
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

function usar(mundo: ReturnType<typeof cenario>, vezes = 1) {
  for (let i = 0; i < vezes; i++) {
    updateCombat(mundo.world, 0)
    updateCombat(mundo.world, 0.6)
    // Zera cooldown pro proximo uso sem avancar o relogio de status (que
    // mexeria em veneno/queimadura e sujaria as medicoes).
    mundo.player.cooldowns = {}
    mundo.player.globalCooldown = 0
  }
}

describe('estagio de precisao/evasao que o gerador nao emite', () => {
  it('os 6 golpes de dano com queda de precisao chegam com o efeito no dado', () => {
    for (const id of PRECISAO_RECUPERADA) {
      const ability = getAbility(id)
      expect(ability?.statChanges, id).toEqual([{ stat: 'accuracy', estagios: -1 }])
      expect(ability?.statChance, id).toBeGreaterThan(0)
      expect(ability?.power, id).toBeGreaterThan(0) // continuam golpes de dano
    }
  })

  it('sweet_scent deixou de ser inerte e derruba a evasao do alvo', () => {
    const ability = getAbility('sweet_scent')
    expect(ability?.statChanges).toEqual([{ stat: 'evasion', estagios: -2 }])
    expect(ability?.statChance).toBe(100)
  })

  it('mud_slap baixa a precisao do alvo de verdade em combate (chance 100%)', () => {
    const mundo = cenario('mud_slap')
    expect(mundo.enemy.estagios.accuracy ?? 0).toBe(0)
    usar(mundo)
    expect(mundo.enemy.estagios.accuracy).toBeLessThan(0)
  })
})

describe('tri_attack', () => {
  it('sorteia entre queimar, congelar e paralisar', () => {
    expect(STATUS_SORTEADO.tri_attack).toEqual(['burn', 'freeze', 'paralysis'])
    // O dado do golpe precisa ter status pra ele entrar no pipeline de efeito
    // secundario (chance, Shield Dust, Serene Grace).
    expect(getAbility('tri_attack')?.statusChance).toBeGreaterThan(0)
  })

  it('aplica algum dos tres status ao longo de varios usos', () => {
    // Alvo NORMAL (rattata): nao e imune a nenhum dos tres. Chance de 20% por
    // uso, entao 60 usos com semente fixa — deterministico, nao flaky.
    const mundo = cenario('tri_attack')
    const vistos = new Set<string>()
    for (let i = 0; i < 60; i++) {
      usar(mundo)
      const tipo = mundo.enemy.poke.status?.tipo
      if (tipo) {
        vistos.add(tipo)
        mundo.enemy.poke.status = null // libera pro proximo sorteio
      }
    }
    expect(vistos.size).toBeGreaterThan(0)
    for (const tipo of vistos) {
      expect(['burn', 'freeze', 'paralysis']).toContain(tipo)
    }
  })
})

describe('poder condicional', () => {
  it('so os 5 com estado disponivel neste motor estao na tabela', () => {
    expect(Object.keys(MULTIPLICADOR_CONDICIONAL).sort()).toEqual(
      ['assurance', 'brine', 'hex', 'venoshock', 'wake_up_slap'],
    )
  })

  it('brine dobra contra alvo com metade do HP ou menos', () => {
    const cheio = cenario('brine')
    const hpAntesCheio = cheio.enemy.poke.hp
    usar(cheio)
    const danoCheio = hpAntesCheio - cheio.enemy.poke.hp

    const ferido = cenario('brine')
    ferido.enemy.poke.hp = Math.floor(ferido.enemy.poke.stats.hp / 2)
    const hpAntesFerido = ferido.enemy.poke.hp
    usar(ferido)
    const danoFerido = hpAntesFerido - ferido.enemy.poke.hp

    expect(danoFerido).toBeGreaterThan(danoCheio)
  })

  // Hex e GHOST e o alvo padrao do cenario e NORMAL — imunidade de tipo zera o
  // dano dos dois lados e a medicao em combate nao diria nada. Aqui a regra e
  // conferida direto na tabela, que e o unico ponto que o dano real e a
  // estimativa da IA leem.
  it('hex dobra contra alvo com QUALQUER status nao-volatil', () => {
    expect(MULTIPLICADOR_CONDICIONAL.hex({ poke: { status: { tipo: 'paralysis' } } } as never)).toBe(2)
    expect(MULTIPLICADOR_CONDICIONAL.hex({ poke: { status: null } } as never)).toBe(1)
  })

  it('wake_up_slap dobra so contra alvo dormindo', () => {
    expect(MULTIPLICADOR_CONDICIONAL.wake_up_slap({ poke: { status: { tipo: 'sleep' } } } as never)).toBe(2)
    expect(MULTIPLICADOR_CONDICIONAL.wake_up_slap({ poke: { status: { tipo: 'burn' } } } as never)).toBe(1)
  })

  it('venoshock so dobra contra alvo ENVENENADO, nao contra qualquer status', () => {
    expect(MULTIPLICADOR_CONDICIONAL.venoshock({
      poke: { status: { tipo: 'poison' } },
    } as never)).toBe(2)
    expect(MULTIPLICADOR_CONDICIONAL.venoshock({
      poke: { status: { tipo: 'burn' } },
    } as never)).toBe(1)
  })
})
