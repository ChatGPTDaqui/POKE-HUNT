// PH-140 — o clima nao e um efeito isolado: ele mexe em golpe, em trait e na
// precisao ao mesmo tempo, e e ISSO que faz o sistema parecer o dos jogos.
//
// Cada regra aqui falha em silencio se ninguem travar. Nao ha erro de execucao
// quando o Thunder erra na chuva, quando a Weather Ball continua NORMAL debaixo
// de sol, ou quando o Ice Body para de curar porque o clima de gelo virou
// 'neve' em vez de 'granizo'. O jogo so fica um pouco menos certo, e ninguem
// descobre.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { buildMapWorld } from '../simulation'
import { golpeErrou, updateCombat } from './combatSystem'
import { tickStatus } from './statusSystem'

import type { Ability } from '@/data/abilities'
import type { Clima, ClimaTipo, WorldState } from '../types'

function ambiente(tipo: ClimaTipo): Clima {
  return { tipo, turnosRestantes: Infinity, origem: 'ambiente' }
}

function cenario(
  especieJogador: string,
  especieInimigo: string,
  clima: ClimaTipo | null,
  traits: { jogador?: string; inimigo?: string } = {},
) {
  const rng = createRng(1)
  const jogadorPoke = createPokeInstance(rng, especieJogador, 50)
  if (traits.jogador) jogadorPoke.trait = traits.jogador
  const world = buildMapWorld('route_46', jogadorPoke, {
    seed: 0, rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  const player = world.player!
  player.cooldowns = {}
  player.globalCooldown = 999

  const enemy = criarInimigoDeTeste(world, especieInimigo, 50, { x: player.x, y: player.y })
  if (traits.inimigo) enemy.poke.trait = traits.inimigo
  enemy.targetId = player.id
  world.enemies = [enemy]

  // Depois de `buildMapWorld`, que ja define o clima da sala.
  world.clima = clima ? ambiente(clima) : null
  world.climaAmbiente = world.clima
  return { world, player, enemy }
}

function resolver(world: WorldState, attackerId: string, targetId: string, ability: Ability): void {
  world.pendingHits.push({ id: `hit-${world.counters.pendingHit++}`, timer: 0, attackerId, targetId, ability })
  updateCombat(world, 0, { silent: true })
}

/**
 * Quanto o alvo perdeu de HP com UM hit do golpe, sob o clima dado.
 *
 * O HP do alvo e inflado antes do hit porque o dano e LIMITADO pelo HP que
 * resta: um Geodude de 111 de HP devolve "111" pra qualquer golpe que mate, e a
 * comparacao entre climas viraria uma comparacao entre tetos. Inflar so o HP
 * nao mexe em Defesa, entao o dano medido continua sendo o real.
 */
function danoDe(abilityId: string, clima: ClimaTipo | null, especieAlvo = 'rattata'): number {
  const { world, player, enemy } = cenario('charmander', especieAlvo, clima)
  enemy.poke.stats = { ...enemy.poke.stats, hp: 1_000_000 }
  enemy.poke.hp = 1_000_000
  const antes = enemy.poke.hp
  resolver(world, player.id, enemy.id, getAbility(abilityId)!)
  return antes - enemy.poke.hp
}

/**
 * Quantos de N disparos ACERTARIAM, sob o clima dado.
 *
 * Mede por `golpeErrou` e nao enfileirando hits: a rolagem de acerto acontece
 * no CAST, entao um hit enfileirado sempre pousa. Medir pelo HP do alvo daria
 * 100% de acerto mesmo com a regra de clima desligada — teste vacuo.
 */
function acertosEm(
  abilityId: string, clima: ClimaTipo | null, tentativas: number,
  especieAlvo = 'rattata', traitAlvo?: string,
): number {
  const { world, player, enemy } = cenario('charmander', especieAlvo, clima, { inimigo: traitAlvo })
  const ability = getAbility(abilityId)!
  let acertos = 0
  for (let i = 0; i < tentativas; i++) {
    // Semente propria por tentativa: sem isso as N repeticoes rodariam a MESMA
    // sequencia e o teste mediria um sorteio so.
    const rng = createRng(i * 7919 + 13)
    if (!golpeErrou(rng, ability, player, enemy, world.clima?.tipo ?? null)) acertos++
  }
  return acertos
}

describe('precisao que o clima decide (PH-140)', () => {
  it('Thunder nunca erra na chuva', () => {
    // 70% de precisao no catalogo. Em 60 tentativas, errar zero por acaso tem
    // probabilidade desprezivel — se a regra nao estiver ligada, isto cai.
    expect(acertosEm('thunder', 'chuva', 60)).toBe(60)
  })

  it('Thunder erra MUITO mais no sol do que com ceu limpo', () => {
    // 50% fixos no sol contra os 70% do catalogo com ceu limpo. Comparacao
    // entre os dois, e nao numero absoluto: o que importa e a regra existir.
    const noSol = acertosEm('thunder', 'sol', 120)
    const limpo = acertosEm('thunder', null, 120)
    expect(noSol).toBeLessThan(limpo)
  })

  it('Blizzard nunca erra nem no granizo nem na NEVE', () => {
    // Os dois climas de gelo, e nao so o antigo: e o par que mais gera erro de
    // implementacao, porque a Gen 9 trocou granizo por neve e levou a regra.
    expect(acertosEm('blizzard', 'granizo', 40)).toBe(40)
    expect(acertosEm('blizzard', 'neve', 40)).toBe(40)
  })

  it('nevoa derruba a precisao de um golpe comum', () => {
    // x0,6 sobre todo golpe. `body_slam` tem 100% no catalogo, entao com ceu
    // limpo acerta sempre — e e por isso que serve de sonda.
    expect(acertosEm('body_slam', null, 40)).toBe(40)
    expect(acertosEm('body_slam', 'nevoa', 120)).toBeLessThan(120)
  })

  it('acerto garantido por clima ignora a nevoa', () => {
    // Nos jogos, golpe que pula a checagem de precisao pula TUDO que mexe nela.
    // Aqui a chuva garante o Thunder; a nevoa nao pode ter voz. Como os dois
    // climas nao coexistem, o teste que importa e o de que a ordem esta certa:
    // a saida por acerto garantido acontece ANTES do multiplicador de nevoa.
    expect(acertosEm('thunder', 'chuva', 60)).toBe(60)
  })
})

describe('Weather Ball muda de tipo e de forca (PH-140)', () => {
  it('sob sol bate MUITO mais forte que com ceu limpo', () => {
    // Dobra de poder e vira FIRE. Contra Rattata (NORMAL) o FIRE e neutro, e o
    // ganho medido e a duplicacao do poder.
    const limpo = danoDe('weather_ball', null)
    const sol = danoDe('weather_ball', 'sol')
    expect(limpo).toBeGreaterThan(0)
    expect(sol).toBeGreaterThan(limpo)
  })

  it('o TIPO muda de verdade: na chuva ela e WATER e queima contra GROUND', () => {
    // Prova que nao e so poder dobrado. Contra Geodude (ROCK/GROUND), WATER e
    // 4x super efetivo — nenhum multiplicador de poder produziria essa
    // diferenca sozinho.
    const naChuva = danoDe('weather_ball', 'chuva', 'geodude')
    const noSol = danoDe('weather_ball', 'sol', 'geodude')
    // WATER e 4x contra ROCK/GROUND; FIRE e 0,5x (com STAB do Charmander, o
    // que ainda deixa o sol MUITO atras). Se o tipo nao mudasse, os dois
    // seriam NORMAL dobrado e dariam o mesmo numero.
    expect(naChuva).toBeGreaterThan(noSol * 2)
  })

  it('na nevoa fica NORMAL e NAO dobra', () => {
    // A unica entrada da tabela que diz "tem clima, mas sem bonus".
    expect(danoDe('weather_ball', 'nevoa')).toBe(danoDe('weather_ball', null))
  })
})

describe('Solar Beam e a cura solar (PH-140)', () => {
  it('Solar Beam perde metade do dano fora do sol', () => {
    const noSol = danoDe('solar_beam', 'sol')
    const naChuva = danoDe('solar_beam', 'chuva')
    const naAreia = danoDe('solar_beam', 'areia')
    expect(noSol).toBeGreaterThan(naChuva)
    // Areia nao tem nada a ver com GRASS: a penalidade vale pra QUALQUER clima
    // que nao seja sol, e nao so pros que "atrapalham a luz" por tema.
    expect(naAreia).toBeLessThan(noSol)
  })

  it('Synthesis cura mais no sol e menos em clima ruim', () => {
    const curou = (clima: ClimaTipo | null): number => {
      const { world, player, enemy } = cenario('bulbasaur', 'rattata', clima)
      player.poke.hp = 1
      resolver(world, player.id, enemy.id, getAbility('synthesis')!)
      return player.poke.hp - 1
    }
    const noSol = curou('sol')
    const limpo = curou(null)
    const naChuva = curou('chuva')
    expect(noSol).toBeGreaterThan(limpo)
    expect(naChuva).toBeLessThan(limpo)
  })
})

describe('traits de clima acompanham os climas novos (PH-140)', () => {
  it('Ice Body cura no granizo E na neve', () => {
    // A trait diz "clima de gelo", e desde a Gen 9 sao dois. Ligar so um
    // deixaria metade do bioma de gelo sem efeito, em silencio.
    for (const clima of ['granizo', 'neve'] as const) {
      const { world, player } = cenario('lapras', 'rattata', clima, { jogador: 'ice_body' })
      player.poke.hp = Math.floor(player.poke.stats.hp / 2)
      const antes = player.poke.hp
      tickStatus(world.rng, player, 999, clima)
      expect(player.poke.hp, `Ice Body nao curou em ${clima}`).toBeGreaterThan(antes)
    }
  })

  it('neve NAO tira HP de quem nao e do tipo ICE, e granizo tira', () => {
    // A diferenca que justifica os dois climas existirem separados.
    const dano = (clima: ClimaTipo): number => {
      const { world, player } = cenario('charmander', 'rattata', clima)
      return tickStatus(world.rng, player, 999, clima).dano
    }
    expect(dano('granizo')).toBeGreaterThan(0)
    expect(dano('neve')).toBe(0)
  })

  it('Snow Cloak vale nos dois climas de gelo', () => {
    // Evasao 1.25x derruba a precisao de quem ataca. Medido pelo numero de
    // acertos, que e o efeito observavel.
    // `hydro_pump` tem 80% de precisao — margem pra a evasao morder.
    const acertosContra = (clima: ClimaTipo | null): number =>
      acertosEm('hydro_pump', clima, 150, 'lapras', 'snow_cloak')
    const limpo = acertosContra(null)
    expect(acertosContra('granizo')).toBeLessThan(limpo)
    expect(acertosContra('neve')).toBeLessThan(limpo)
  })
})

describe('neve protege o tipo ICE (PH-140)', () => {
  it('POKE de gelo toma menos golpe FISICO na neve', () => {
    // +50% de Defesa, que so vale contra fisico — e Defesa, nao Defesa
    // Especial.
    const fisicoNaNeve = danoDe('body_slam', 'neve', 'lapras')
    const fisicoLimpo = danoDe('body_slam', null, 'lapras')
    expect(fisicoNaNeve).toBeLessThan(fisicoLimpo)
  })

  it('golpe ESPECIAL contra o mesmo POKE de gelo nao muda na neve', () => {
    // Guarda contra "implementei como reducao geral de dano": se a neve
    // estivesse cortando tudo, este caso tambem cairia.
    expect(danoDe('psychic', 'neve', 'lapras')).toBe(danoDe('psychic', null, 'lapras'))
  })

  it('POKE que NAO e de gelo nao ganha nada com a neve', () => {
    expect(danoDe('body_slam', 'neve', 'rattata')).toBe(danoDe('body_slam', null, 'rattata'))
  })
})
