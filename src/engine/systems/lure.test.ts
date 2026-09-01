// PH-235 — LURE: reunir de 1 a 4 selvagens antes de o POKE parar pra lutar.
//
// O que estes testes trancam nao e "a fase muda de nome": e que a fase de
// reuniao SEMPRE TERMINA. Ela tem quatro saidas (conta fechada, sem candidato,
// shiny em campo, tempo-limite) e cada uma cobre um jeito real de a mecanica
// travar — hunt de um inimigo so, candidato inalcancavel, retardatario que nao
// chega. Uma reuniao que nao termina e um POKE andando em circulos sem bater, e
// isso nao aparece como erro em lugar nenhum: aparece como farm que parou.
//
// O outro contrato aqui e o negativo: com o lure DESLIGADO, o movimento tem que
// ser exatamente o de sempre (andar no inimigo vivo mais proximo). O caminho
// normal do jogo passa por este `if`.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { STARTER_HUNT_ID } from '@/data/huntSpawnOverrides'
import type { GameStateStore } from '@/stores/gameStateStore'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import type { EnemyEntity, WorldState } from '../types'
import { atualizarLure, LURE_TEMPO_MAXIMO_DE_REUNIAO } from './lureSystem'
import { updateMovement } from './movementSystem'
import { updateCombat } from './combatSystem'

const PASSO = 1 / 60
const HUNT = 'mata_faixa1' // hunt normal: `maxEnemies` 6, entao reunir 3 ou 4 cabe

function cenario(
  { ligado = true, quantidade = 3, mapId = HUNT }:
  { ligado?: boolean; quantidade?: number; mapId?: string } = {},
) {
  const rng = createRng(11)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const poke = createPokeInstance(rng, 'charmander', 40)
  const world = buildMapWorld(mapId, poke, { seed: 0, rng, counters })
  // `buildMapWorld` ja nasce com os selvagens do mapa espalhados pelo cone de
  // spawn. Aqui cada teste monta a configuracao exata que quer exercitar.
  world.enemies = []
  // A grade de colisao nao esta sob teste: quem contorna parede e o
  // `movementSystem` (A*), e ele ja tem os proprios testes. Sem zerar, a
  // posicao que o teste escolhe pro selvagem poderia cair num body-block e o
  // resultado passaria a depender da arte do sub-bioma sorteado.
  world.mapDef = { ...world.mapDef!, collisionGrid: null }
  const gameState = { lureConfig: { ligado, quantidade } } as unknown as GameStateStore
  return { world, player: world.player!, gameState }
}

/**
 * Poe um selvagem em (x, y) relativo ao jogador. `reunido` liga o estado que o
 * `movementSystem` daria a quem esta perseguindo o jogador — e o que a conta do
 * lure enxerga.
 */
function selvagem(
  world: WorldState,
  { dx, dy, reunido = false, shiny = false, morto = false }:
  { dx: number; dy: number; reunido?: boolean; shiny?: boolean; morto?: boolean },
): EnemyEntity {
  const player = world.player!
  const poke = createPokeInstance(world.rng, 'rattata', 40)
  poke.isShiny = shiny
  if (morto) poke.hp = 0
  const enemy = createEnemyEntity(world.counters, {
    poke,
    x: player.x + dx,
    y: player.y + dy,
    encounterId: world.mapDef!.enemyPool[0],
  })
  if (reunido) {
    enemy.state = 'chase'
    enemy.targetId = player.id
  }
  world.enemies.push(enemy)
  return enemy
}

describe('lure: fase de reuniao', () => {
  it('manda o jogador pro selvagem SEM aggro mais proximo, nao pro mais proximo', () => {
    const { world, gameState } = cenario({ quantidade: 3 })
    // Ja atras do jogador e mais perto que todos: se o lure olhasse so
    // distancia, o destino sairia daqui.
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    const proximoLivre = selvagem(world, { dx: 200, dy: 0 })
    selvagem(world, { dx: 400, dy: 0 })

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.fase).toBe('reunindo')
    expect(world.lure?.reunidos).toBe(1)
    expect(world.lure?.alvo).toBe(3)
    expect(world.lure?.destino).toEqual({ x: proximoLivre.x, y: proximoLivre.y })
  })

  it('para de reunir quando a conta fecha', () => {
    const { world, gameState } = cenario({ quantidade: 2 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    selvagem(world, { dx: -100, dy: 0, reunido: true })
    selvagem(world, { dx: 300, dy: 0 }) // ainda haveria quem puxar

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.reunidos).toBe(2)
    expect(world.lure?.fase).toBe('lutando')
    expect(world.lure?.destino).toBeNull()
  })

  it('sem candidato, termina no MESMO tick (hunt de um inimigo so)', () => {
    const { world, gameState } = cenario({ quantidade: 4, mapId: STARTER_HUNT_ID })
    selvagem(world, { dx: 120, dy: 0, reunido: true })

    atualizarLure(world, gameState, PASSO)

    // A conta NAO fechou (1 de 4) e mesmo assim a fase acabou: nao ha mais
    // ninguem pra puxar, e insistir seria andar sem bater pra sempre.
    expect(world.lure?.reunidos).toBe(1)
    expect(world.lure?.fase).toBe('lutando')
  })

  it('desiste pelo tempo-limite quando a conta nao fecha', () => {
    const { world, gameState } = cenario({ quantidade: 4 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    // Candidato existe (entao a saida "sem candidato" nao dispara) mas o teste
    // nunca roda o movimento, entao ele nunca e puxado — e o cenario do
    // candidato inalcancavel, so sem depender de geometria de parede.
    selvagem(world, { dx: 300, dy: 0 })

    let decorrido = 0
    while (decorrido < LURE_TEMPO_MAXIMO_DE_REUNIAO - 1) {
      atualizarLure(world, gameState, 1)
      decorrido += 1
    }
    expect(world.lure?.fase).toBe('reunindo') // ainda dentro do teto

    atualizarLure(world, gameState, 1)
    atualizarLure(world, gameState, 1)
    expect(world.lure?.fase).toBe('lutando')
  })

  it('shiny em campo cancela a reuniao na hora', () => {
    const { world, gameState } = cenario({ quantidade: 4 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    selvagem(world, { dx: 250, dy: 0, shiny: true })

    atualizarLure(world, gameState, PASSO)

    // A prioridade de shiny do `movementSystem` e mais antiga que o lure; as
    // duas mandariam no mesmo `player` em direcoes diferentes.
    expect(world.lure?.fase).toBe('lutando')
  })

  // PH-394: o MESMO caso do shiny, com o protetor da sala — que virou alvo
  // prioritario no PH-331 e ficou fora desta saida.
  //
  // O QUE ISSO CUSTAVA NA TELA: com lure ligado, o POKE passava pelo Guardian
  // sem bater ate a reuniao fechar (`reunindoParaLure` suprime o golpe e a fase
  // `reunindo` sobrepoe a escolha de alvo). E como a sala so avanca quando o
  // protetor cai, a hunt ficava parada — a reuniao reinicia sozinha assim que
  // ninguem mais esta atras do jogador, entao isso se repetia.
  it('protetor em campo cancela a reuniao na hora, igual ao shiny', () => {
    const { world, gameState } = cenario({ quantidade: 4 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    const protetor = selvagem(world, { dx: 250, dy: 0 })
    protetor.isProtetor = true

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.fase, 'a reuniao continuou e o POKE nao vai bater no protetor').toBe('lutando')
  })

  // O contrapeso do caso acima: o protetor MORTO nao pode segurar a saida —
  // senao a sala que ja resolveu o protetor nunca mais reuniria.
  it('protetor MORTO nao cancela a reuniao', () => {
    const { world, gameState } = cenario({ quantidade: 4 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    const protetor = selvagem(world, { dx: 250, dy: 0, morto: true })
    protetor.isProtetor = true
    selvagem(world, { dx: 300, dy: 0 })

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.fase).toBe('reunindo')
  })

  it('segura a posicao enquanto um reunido esta perto de soltar o aggro', () => {
    const { world, player, gameState } = cenario({ quantidade: 3 })
    const retardatario = selvagem(world, { dx: 100, dy: 0, reunido: true })
    // Alem de 0,8 da coleira dele: mais um passo pra longe e ele desiste e volta
    // pro spawn, e a conta voltaria pro mesmo lugar de antes.
    retardatario.x = player.x + retardatario.leashRadius * 0.9
    selvagem(world, { dx: -250, dy: 0 }) // candidato no sentido OPOSTO ao retardatario

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.fase).toBe('reunindo')
    expect(world.lure?.esperandoRetardatario).toBe(true)
    expect(world.lure?.destino).toBeNull()
  })

  it('comeca um ciclo novo, com o relogio cheio, quando a luta acaba', () => {
    const { world, gameState } = cenario({ quantidade: 2 })
    const a = selvagem(world, { dx: 100, dy: 0, reunido: true })
    const b = selvagem(world, { dx: -100, dy: 0, reunido: true })
    atualizarLure(world, gameState, PASSO)
    expect(world.lure?.fase).toBe('lutando')

    // Os dois morreram: ninguem mais atras do jogador.
    a.poke.hp = 0
    b.poke.hp = 0
    selvagem(world, { dx: 320, dy: 0 })
    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.fase).toBe('reunindo')
    expect(world.lure?.reunidos).toBe(0)
    expect(world.lure?.tempoRestante).toBeGreaterThan(LURE_TEMPO_MAXIMO_DE_REUNIAO - 0.1)
  })

  it('nao conta selvagem morto nem quem perdeu o aggro', () => {
    const { world, gameState } = cenario({ quantidade: 3 })
    selvagem(world, { dx: 100, dy: 0, reunido: true })
    selvagem(world, { dx: 120, dy: 0, reunido: true, morto: true })
    // `wander` com targetId nulo e o estado de quem soltou o aggro pela coleira.
    selvagem(world, { dx: 140, dy: 0 })
    selvagem(world, { dx: 300, dy: 0 })

    atualizarLure(world, gameState, PASSO)

    expect(world.lure?.reunidos).toBe(1)
    expect(world.lure?.fase).toBe('reunindo')
  })
})

describe('lure: quando ele nao se aplica', () => {
  it('desligado na config: nenhum estado de lure', () => {
    const { world, gameState } = cenario({ ligado: false })
    selvagem(world, { dx: 200, dy: 0 })

    atualizarLure(world, gameState, PASSO)

    expect(world.lure).toBeNull()
  })

  it('jogador desmaiado: nenhum estado de lure', () => {
    const { world, player, gameState } = cenario()
    selvagem(world, { dx: 200, dy: 0 })
    player.fainted = true

    atualizarLure(world, gameState, PASSO)

    expect(world.lure).toBeNull()
  })

  it('clampa a quantidade na faixa 1..4', () => {
    const alto = cenario({ quantidade: 99 })
    selvagem(alto.world, { dx: 200, dy: 0 })
    atualizarLure(alto.world, alto.gameState, PASSO)
    expect(alto.world.lure?.alvo).toBe(4)

    const baixo = cenario({ quantidade: 0 })
    selvagem(baixo.world, { dx: 200, dy: 0 })
    atualizarLure(baixo.world, baixo.gameState, PASSO)
    expect(baixo.world.lure?.alvo).toBe(1)
  })
})

describe('lure: efeito no movimento do jogador', () => {
  // O mesmo cenario nos dois testes abaixo, de proposito: e o A/B que mostra que
  // o lure trocou o ALVO do movimento, e nada mais.
  function cenarioDeMovimento(ligado: boolean) {
    const c = cenario({ ligado, quantidade: 3 })
    const jaReunido = selvagem(c.world, { dx: 120, dy: 0, reunido: true })
    const livre = selvagem(c.world, { dx: 0, dy: 300 })
    return { ...c, jaReunido, livre }
  }

  function distancia(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  // As duas medidas sao contra a posicao INICIAL de cada selvagem, congelada
  // antes do laco, e nao contra a entidade viva. `updateMovement` move todo
  // mundo: o reunido persegue o jogador e o livre continua no wander dele, entao
  // uma distancia medida contra a entidade mistura o passo do jogador com o
  // passo do outro — foi o que fez a primeira versao deste teste falhar por
  // geometria, nao por comportamento errado.
  function pontoDe(e: { x: number; y: number }) {
    return { x: e.x, y: e.y }
  }

  it('reunindo: anda pro selvagem SEM aggro, se afastando do que ja esta atras dele', () => {
    const { world, player, gameState, jaReunido, livre } = cenarioDeMovimento(true)
    const alvoDoLure = pontoDe(livre)
    const jaAtras = pontoDe(jaReunido)
    const antesDoAlvo = distancia(player, alvoDoLure)
    const antesDoAtras = distancia(player, jaAtras)

    for (let i = 0; i < 30; i++) {
      atualizarLure(world, gameState, PASSO)
      updateMovement(world, PASSO)
    }

    expect(distancia(player, alvoDoLure)).toBeLessThan(antesDoAlvo)
    expect(distancia(player, jaAtras)).toBeGreaterThan(antesDoAtras)
    expect(player.state).toBe('chase')
  })

  it('desligado: anda no inimigo vivo mais proximo, como sempre foi', () => {
    const { world, player, gameState, jaReunido, livre } = cenarioDeMovimento(false)
    const alvoDoLure = pontoDe(livre)
    const jaAtras = pontoDe(jaReunido)
    const antesDoAlvo = distancia(player, alvoDoLure)
    const antesDoAtras = distancia(player, jaAtras)

    for (let i = 0; i < 30; i++) {
      atualizarLure(world, gameState, PASSO)
      updateMovement(world, PASSO)
    }

    // Sem lure, o mais PROXIMO vence — e o mais proximo aqui e justamente o que
    // o lure ignoraria.
    expect(distancia(player, jaAtras)).toBeLessThan(antesDoAtras)
    expect(distancia(player, alvoDoLure)).toBeGreaterThan(antesDoAlvo)
  })
})

describe('lure: o jogador so bate depois de fechar a conta (PH-264)', () => {
  // A/B do mesmo cenario. O que muda entre os dois casos e SO a fase do lure:
  // um selvagem colado e engajado no jogador, e o golpe do jogador saindo ou
  // nao. Sem o par, um teste que so olha "nao atacou" passaria tambem num motor
  // que nunca ataca ninguem.
  function cenarioDeCombate(reunidosEmCampo: number, quantidade: number) {
    const c = cenario({ quantidade })
    // O primeiro fica ENGAJADO e colado: e ele que poe o jogador em
    // `engagedEnemies` e faz `executePlayerAction` ser alcancavel.
    const colado = selvagem(c.world, { dx: 30, dy: 0, reunido: true })
    colado.state = 'engaged'
    for (let i = 1; i < reunidosEmCampo; i++) {
      selvagem(c.world, { dx: 60 + i * 20, dy: 0, reunido: true })
    }
    // Candidato solto: sem ele a saida "sem candidato" fecharia a reuniao e o
    // caso de reuniao nunca aconteceria.
    selvagem(c.world, { dx: 0, dy: 320 })
    return c
  }

  /** O golpe do jogador saiu neste tick? */
  function jogadorGolpeou(world: WorldState): boolean {
    const player = world.player!
    return world.pendingHits.some((h) => h.attackerId === player.id) || player.attackAnimTimer > 0
  }

  it('reunindo: o POKE nao golpeia mesmo com inimigo engajado colado nele', () => {
    // Pede 3, tem 1 atras: a reuniao continua, e ate PH-264 o POKE ja comecava
    // a bater neste selvagem — que e exatamente o "esta batendo antes de lurar
    // a quantidade solicitada" do relato.
    const { world, gameState } = cenarioDeCombate(1, 3)

    for (let i = 0; i < 60; i++) {
      atualizarLure(world, gameState, PASSO)
      updateCombat(world, PASSO, { silent: true })
      expect(world.lure?.fase).toBe('reunindo')
      expect(jogadorGolpeou(world)).toBe(false)
    }
  })

  it('conta fechada: o POKE volta a golpear normalmente', () => {
    const { world, gameState } = cenarioDeCombate(3, 3)

    let golpeou = false
    for (let i = 0; i < 60 && !golpeou; i++) {
      atualizarLure(world, gameState, PASSO)
      updateCombat(world, PASSO, { silent: true })
      golpeou = jogadorGolpeou(world)
    }

    expect(world.lure?.fase).toBe('lutando')
    expect(golpeou).toBe(true)
  })

  it('lure desligado: o POKE golpeia como sempre golpeou', () => {
    // O contrato negativo. A supressao nao pode vazar pra quem nunca ligou o
    // lure — a maioria das partidas.
    const c = cenario({ ligado: false, quantidade: 3 })
    const colado = selvagem(c.world, { dx: 30, dy: 0, reunido: true })
    colado.state = 'engaged'

    let golpeou = false
    for (let i = 0; i < 60 && !golpeou; i++) {
      atualizarLure(c.world, c.gameState, PASSO)
      updateCombat(c.world, PASSO, { silent: true })
      golpeou = jogadorGolpeou(c.world)
    }

    expect(c.world.lure).toBeNull()
    expect(golpeou).toBe(true)
  })

  it('os selvagens continuam agindo durante a reuniao — nao e invulnerabilidade', () => {
    const { world, gameState } = cenarioDeCombate(1, 3)
    const player = world.player!
    const hpInicial = player.poke.hp

    for (let i = 0; i < 600; i++) {
      atualizarLure(world, gameState, PASSO)
      updateCombat(world, PASSO, { silent: true })
    }

    expect(player.poke.hp).toBeLessThan(hpInicial)
  })
})
