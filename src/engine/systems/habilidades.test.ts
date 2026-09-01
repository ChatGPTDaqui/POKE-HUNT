// As habilidades passivas do Ultra Sun, uma a uma, no combate de verdade.
//
// TODAS falham em silencio. Uma habilidade que para de ser consultada nao lanca
// nada: o POKE simplesmente causa menos dano, ou perde uma imunidade, ou deixa
// de curar — e o jogo continua rodando. E o mesmo motivo pelo qual `traits.ts`
// ficou tres levas com Gengar carregando um Levitate que a Gen VII tirou dele.
//
// Duas coisas guardam a suite inteira:
//   1. cada caso passa a habilidade EXPLICITAMENTE (`poke.trait = ...`), porque
//      desde 2026-08-18 ela e sorteio por individuo entre os slots da especie —
//      confiar na especie mediria o sorteio, nao a mecanica;
//   2. onde o numero importa, o mundo roda em `pessimista` (sem critico, sem
//      variacao de dano), pra a comparacao com/sem habilidade ser exata.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { getAbility, type Ability, TURNO_SEGUNDOS } from '@/data/abilities'
import { buildMapWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateCombat, velocidadeEfetiva } from './combatSystem'
import { tickStatus, aplicarMudancasDeStat } from './statusSystem'
import type { WorldEntity, WorldState } from '../types'

const IV = { hp: 20, atkFis: 20, atkEsp: 20, def: 20, defEsp: 20, speed: 20 }

function cenario(
  especieJogador: string,
  especieInimigo: string,
  traits: { jogador?: string; inimigo?: string } = {},
  nivel = 50,
) {
  const rng = createRng(11)
  const poke = createPokeInstance(rng, especieJogador, nivel, { rarity: 'comum', ivs: IV, nature: 'hardy' })
  poke.trait = traits.jogador
  const world = buildMapWorld('route_46', poke, { seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 } })
  world.pessimista = true
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 999

  const enemy = criarInimigoDeTeste(world, especieInimigo, nivel, { x: player.x, y: player.y })
  enemy.poke.trait = traits.inimigo
  enemy.poke.ivs = { ...IV }
  enemy.targetId = player.id
  world.enemies = [enemy]
  return { world, player, enemy }
}

function bater(world: WorldState, atacanteId: string, alvoId: string, ability: Ability): void {
  world.pendingHits.push({
    id: `hit-${world.counters.pendingHit++}`,
    timer: 0, attackerId: atacanteId, targetId: alvoId, ability,
  })
  updateCombat(world, 0, { silent: true })
}

/** Dano que `golpe` causa no inimigo, com e sem a habilidade no atacante. */
function danoCom(traitDoJogador: string | undefined, golpe: string, especieJogador = 'rattata', especieInimigo = 'rattata'): number {
  const { world, player, enemy } = cenario(especieJogador, especieInimigo, { jogador: traitDoJogador })
  enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
  enemy.poke.hp = 99999
  bater(world, player.id, enemy.id, getAbility(golpe)!)
  return 99999 - enemy.poke.hp
}

/** Dano que o inimigo recebe, com e sem a habilidade NELE. */
function danoRecebidoCom(traitDoInimigo: string | undefined, golpe: string, especieInimigo = 'rattata'): number {
  const { world, player, enemy } = cenario('rattata', especieInimigo, { inimigo: traitDoInimigo })
  enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
  enemy.poke.hp = 99999
  bater(world, player.id, enemy.id, getAbility(golpe)!)
  return 99999 - enemy.poke.hp
}

describe('habilidades que mexem no PODER do golpe', () => {
  it('Technician: golpe de ate 60 de poder fica 50% mais forte, e o de 80 nao muda', () => {
    // Tackle tem 40 de poder (entra no corte), Body Slam tem 85 (nao entra).
    expect(danoCom('technician', 'tackle')).toBeGreaterThan(danoCom(undefined, 'tackle'))
    expect(danoCom('technician', 'body_slam')).toBe(danoCom(undefined, 'body_slam'))
  })

  it('Iron Fist: so golpe de SOCO', () => {
    expect(danoCom('iron_fist', 'mega_punch')).toBeGreaterThan(danoCom(undefined, 'mega_punch'))
    expect(danoCom('iron_fist', 'tackle')).toBe(danoCom(undefined, 'tackle'))
  })

  it('Reckless: so golpe de RECUO', () => {
    expect(danoCom('reckless', 'double_edge')).toBeGreaterThan(danoCom(undefined, 'double_edge'))
    expect(danoCom('reckless', 'tackle')).toBe(danoCom(undefined, 'tackle'))
  })

  it('Sheer Force: golpe COM efeito secundario fica mais forte E perde o efeito', () => {
    // Body Slam tem 30% de paralisar — o efeito que Sheer Force troca por dano.
    expect(danoCom('sheer_force', 'body_slam')).toBeGreaterThan(danoCom(undefined, 'body_slam'))
    expect(danoCom('sheer_force', 'tackle')).toBe(danoCom(undefined, 'tackle'))
  })

  it('Adaptability: dobra o STAB, e so onde ha STAB', () => {
    // Rattata e NORMAL: Tackle tem STAB, Ember (FIRE) nao.
    expect(danoCom('adaptability', 'tackle')).toBeGreaterThan(danoCom(undefined, 'tackle'))
    expect(danoCom('adaptability', 'ember')).toBe(danoCom(undefined, 'ember'))
  })
})

describe('habilidades que mexem no dano RECEBIDO', () => {
  it('Thick Fat: metade do dano de FOGO, nada nos outros tipos', () => {
    expect(danoRecebidoCom('thick_fat', 'ember')).toBeLessThan(danoRecebidoCom(undefined, 'ember'))
    expect(danoRecebidoCom('thick_fat', 'tackle')).toBe(danoRecebidoCom(undefined, 'tackle'))
  })

  it('Filter: corta 25% do super efetivo, e so dele', () => {
    // Ember (FIRE) contra Paras (BUG/GRASS) e 4x super efetivo.
    expect(danoRecebidoCom('filter', 'ember', 'paras')).toBeLessThan(danoRecebidoCom(undefined, 'ember', 'paras'))
    expect(danoRecebidoCom('filter', 'tackle', 'paras')).toBe(danoRecebidoCom(undefined, 'tackle', 'paras'))
  })

  it('Tinted Lens: dobra o dano do golpe POUCO efetivo do portador', () => {
    // Ember (FIRE) contra Squirtle (WATER) e 0.5x.
    const comLente = danoCom('tinted_lens', 'ember', 'rattata', 'squirtle')
    const semLente = danoCom(undefined, 'ember', 'rattata', 'squirtle')
    expect(comLente).toBeGreaterThan(semLente)
    // ...e nada muda num golpe neutro.
    expect(danoCom('tinted_lens', 'tackle')).toBe(danoCom(undefined, 'tackle'))
  })

  it('Dry Skin: absorve AGUA (cura) e toma mais de FOGO', () => {
    const { world, player, enemy } = cenario('squirtle', 'rattata', { inimigo: 'dry_skin' })
    enemy.poke.hp = Math.round(enemy.poke.stats.hp / 2)
    const antes = enemy.poke.hp
    bater(world, player.id, enemy.id, getAbility('water_gun')!)
    expect(enemy.poke.hp).toBeGreaterThan(antes)
    expect(danoRecebidoCom('dry_skin', 'ember')).toBeGreaterThan(danoRecebidoCom(undefined, 'ember'))
  })

  it('Shell Armor: nunca recebe critico, nem com o critico GARANTIDO do Laser Focus', () => {
    const { world, player, enemy } = cenario('rattata', 'rattata', { inimigo: 'shell_armor' })
    world.pessimista = false
    enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
    enemy.poke.hp = 99999
    player.proximoGolpeCriticoGarantido = true
    bater(world, player.id, enemy.id, getAbility('tackle')!)
    const comArmadura = 99999 - enemy.poke.hp

    const semArmadura = (() => {
      const c = cenario('rattata', 'rattata')
      c.world.pessimista = false
      c.enemy.poke.stats = { ...c.enemy.poke.stats, hp: 99999 }
      c.enemy.poke.hp = 99999
      c.player.proximoGolpeCriticoGarantido = true
      bater(c.world, c.player.id, c.enemy.id, getAbility('tackle')!)
      return 99999 - c.enemy.poke.hp
    })()
    expect(comArmadura).toBeLessThan(semArmadura)
  })
})

describe('habilidades de VELOCIDADE por clima', () => {
  it('Swift Swim dobra na chuva e nao faz nada no sol', () => {
    const { player } = cenario('poliwag', 'rattata', { jogador: 'swift_swim' })
    const seca = velocidadeEfetiva(player, null)
    expect(velocidadeEfetiva(player, 'chuva')).toBeCloseTo(seca * 2)
    expect(velocidadeEfetiva(player, 'sol')).toBeCloseTo(seca)
  })

  it('Chlorophyll dobra no sol; Sand Rush na areia', () => {
    const c1 = cenario('oddish', 'rattata', { jogador: 'chlorophyll' })
    expect(velocidadeEfetiva(c1.player, 'sol')).toBeCloseTo(velocidadeEfetiva(c1.player, null) * 2)
    const c2 = cenario('sandshrew', 'rattata', { jogador: 'sand_rush' })
    expect(velocidadeEfetiva(c2.player, 'areia')).toBeCloseTo(velocidadeEfetiva(c2.player, null) * 2)
  })
})

describe('habilidades de ESTAGIO de atributo', () => {
  function rosnarNo(traitDoAlvo: string | undefined): WorldEntity {
    const { world, player, enemy } = cenario('rattata', 'rattata', { inimigo: traitDoAlvo })
    // Growl: -1 de Ataque Fisico no alvo, 100% de chance.
    aplicarMudancasDeStat(world.rng, player, enemy, getAbility('growl')!)
    return enemy
  }

  it('Clear Body barra QUALQUER queda vinda do oponente', () => {
    expect(rosnarNo('clear_body').estagios.atkFis ?? 0).toBe(0)
    expect(rosnarNo(undefined).estagios.atkFis ?? 0).toBe(-1)
  })

  it('Hyper Cutter barra so o Ataque Fisico', () => {
    expect(rosnarNo('hyper_cutter').estagios.atkFis ?? 0).toBe(0)
    // Big Pecks protege Defesa, nao Ataque — a queda de Growl passa.
    expect(rosnarNo('big_pecks').estagios.atkFis ?? 0).toBe(-1)
  })

  it('Defiant: levar a queda vira +2 de Ataque (saldo positivo)', () => {
    const alvo = rosnarNo('defiant')
    expect(alvo.estagios.atkFis ?? 0).toBe(1) // -1 do Growl, +2 da habilidade
  })

  it('Competitive sobe Atk Esp, nao Atk Fis', () => {
    const alvo = rosnarNo('competitive')
    expect(alvo.estagios.atkFis ?? 0).toBe(-1)
    expect(alvo.estagios.atkEsp ?? 0).toBe(2)
  })

  it('Contrary inverte: o Rosnado do oponente vira BUFF', () => {
    expect(rosnarNo('contrary').estagios.atkFis ?? 0).toBe(1)
  })
})

describe('habilidades de fim de turno', () => {
  /** Roda turnos inteiros de status na entidade e devolve o dano agregado. */
  function turnos(entity: WorldEntity, quantos: number, clima: Parameters<typeof tickStatus>[3] = null): number {
    let dano = 0
    for (let i = 0; i < quantos; i++) {
      // Um passo de TURNO_SEGUNDOS fecha exatamente um turno. Escrito assim, e
      // nao com o numero, porque o turno mudou de 2 pra 3 na PH-376 e a
      // primeira versao deste teste quebrou justamente por ter o `2` na unha.
      dano += tickStatus(createRng(i + 1), entity, TURNO_SEGUNDOS, clima).dano
    }
    return dano
  }

  it('Rain Dish cura na chuva, e so nela', () => {
    const { enemy } = cenario('rattata', 'poliwag', { inimigo: 'rain_dish' })
    enemy.poke.hp = 10
    turnos(enemy, 3, 'chuva')
    expect(enemy.poke.hp).toBeGreaterThan(10)

    const seco = cenario('rattata', 'poliwag', { inimigo: 'rain_dish' })
    seco.enemy.poke.hp = 10
    turnos(seco.enemy, 3, null)
    expect(seco.enemy.poke.hp).toBe(10)
  })

  it('Magic Guard zera o dano de veneno', () => {
    const comGuarda = cenario('rattata', 'rattata', { inimigo: 'magic_guard' })
    comGuarda.enemy.poke.status = { tipo: 'poison', turnosRestantes: null }
    expect(turnos(comGuarda.enemy, 3)).toBe(0)

    const sem = cenario('rattata', 'rattata')
    sem.enemy.poke.status = { tipo: 'poison', turnosRestantes: null }
    expect(turnos(sem.enemy, 3)).toBeGreaterThan(0)
  })

  it('Speed Boost sobe a Velocidade a cada turno', () => {
    const { enemy } = cenario('rattata', 'rattata', { inimigo: 'speed_boost' })
    turnos(enemy, 3)
    expect(enemy.estagios.speed ?? 0).toBe(3)
  })

  it('Hydration cura o status na chuva; Shed Skin cura sem clima nenhum (por sorteio)', () => {
    const chuva = cenario('rattata', 'rattata', { inimigo: 'hydration' })
    chuva.enemy.poke.status = { tipo: 'burn', turnosRestantes: null }
    turnos(chuva.enemy, 1, 'chuva')
    expect(chuva.enemy.poke.status).toBeNull()

    const seco = cenario('rattata', 'rattata', { inimigo: 'shed_skin' })
    seco.enemy.poke.status = { tipo: 'burn', turnosRestantes: null }
    turnos(seco.enemy, 40) // 33% por turno: 40 turnos sem curar seria 1 em 10^7
    expect(seco.enemy.poke.status).toBeNull()
  })

  it('Sand Veil e Ice Body nao tomam dano do proprio clima', () => {
    const areia = cenario('rattata', 'rattata', { inimigo: 'sand_veil' })
    expect(turnos(areia.enemy, 3, 'areia')).toBe(0)
    const sem = cenario('rattata', 'rattata')
    expect(turnos(sem.enemy, 3, 'areia')).toBeGreaterThan(0)
  })
})

describe('habilidades que desligam outras habilidades', () => {
  it('Mold Breaker atravessa a imunidade de Levitate', () => {
    // Earthquake e GROUND; Gastly tem Levitate no slot real dele.
    const comQuebra = danoCom('mold_breaker', 'earthquake', 'rattata', 'gastly')
    const sem = danoCom(undefined, 'earthquake', 'rattata', 'gastly')
    expect(sem).toBe(0)
    expect(comQuebra).toBeGreaterThan(0)
  })

  it('Neutralizing Gas desliga a habilidade do outro lado', () => {
    const { world, player, enemy } = cenario('rattata', 'gastly', { jogador: 'neutralizing_gas', inimigo: 'levitate' })
    enemy.poke.stats = { ...enemy.poke.stats, hp: 99999 }
    enemy.poke.hp = 99999
    bater(world, player.id, enemy.id, getAbility('earthquake')!)
    expect(99999 - enemy.poke.hp).toBeGreaterThan(0)
  })
})

describe('habilidades de precisao e imunidade', () => {
  it('Soundproof cancela golpe de som por completo', () => {
    const { world, player, enemy } = cenario('rattata', 'rattata', { inimigo: 'soundproof' })
    aplicarMudancasDeStat(world.rng, player, enemy, getAbility('growl')!)
    // `aplicarMudancasDeStat` e chamada direta (sem passar por resolveHit), entao
    // o teste real do Soundproof e o hit inteiro:
    enemy.estagios = {}
    bater(world, player.id, enemy.id, getAbility('growl')!)
    expect(enemy.estagios.atkFis ?? 0).toBe(0)
  })

  it('Rock Head remove o recuo do proprio golpe', () => {
    const comCabecaDura = cenario('rattata', 'rattata', { jogador: 'rock_head' })
    comCabecaDura.enemy.poke.stats = { ...comCabecaDura.enemy.poke.stats, hp: 99999 }
    comCabecaDura.enemy.poke.hp = 99999
    const hpAntes = comCabecaDura.player.poke.hp
    bater(comCabecaDura.world, comCabecaDura.player.id, comCabecaDura.enemy.id, getAbility('double_edge')!)
    expect(comCabecaDura.player.poke.hp).toBe(hpAntes)

    const sem = cenario('rattata', 'rattata')
    sem.enemy.poke.stats = { ...sem.enemy.poke.stats, hp: 99999 }
    sem.enemy.poke.hp = 99999
    const hpAntesSem = sem.player.poke.hp
    bater(sem.world, sem.player.id, sem.enemy.id, getAbility('double_edge')!)
    expect(sem.player.poke.hp).toBeLessThan(hpAntesSem)
  })

  it('Liquid Ooze inverte o dreno: quem suga toma o dano', () => {
    const { world, player, enemy } = cenario('bulbasaur', 'rattata', { inimigo: 'liquid_ooze' })
    player.poke.hp = Math.round(player.poke.stats.hp / 2)
    const antes = player.poke.hp
    bater(world, player.id, enemy.id, getAbility('absorb')!)
    expect(player.poke.hp).toBeLessThan(antes)
  })

  it('Moxie sobe o Ataque a cada POKE derrubado', () => {
    const { world, player, enemy } = cenario('rattata', 'rattata', { jogador: 'moxie' })
    // DOIS inimigos de proposito: matar o unico em campo encerra a batalha, e
    // fim de batalha ZERA os estagios (limparEstadoVolatil) — o buff existiria
    // e sumiria no mesmo frame, e o teste mediria a limpeza, nao a habilidade.
    const sobrevivente = criarInimigoDeTeste(world, 'rattata', 50, { x: player.x, y: player.y })
    sobrevivente.targetId = player.id
    world.enemies = [enemy, sobrevivente]

    enemy.poke.hp = 1
    bater(world, player.id, enemy.id, getAbility('tackle')!)
    expect(enemy.poke.hp).toBe(0)
    expect(player.estagios.atkFis ?? 0).toBe(1)
  })

  it('Trace copia a habilidade do oponente e devolve a original no fim da batalha', () => {
    const { world, player } = cenario('rattata', 'gyarados', { jogador: 'trace', inimigo: 'intimidate' })
    // Um passo de combate dispara o hook de entrada dos dois lados.
    updateCombat(world, 0.1, { silent: true })
    expect(player.poke.trait).toBe('intimidate')
    expect(player.traitOriginal).toBe('trace')

    // Sem inimigo engajado, updateCombat trata como fim de batalha.
    world.enemies = []
    updateCombat(world, 0.1, { silent: true })
    expect(player.poke.trait).toBe('trace')
  })
})
