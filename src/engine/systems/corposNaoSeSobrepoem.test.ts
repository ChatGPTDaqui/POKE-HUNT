// PH-384: nenhum corpo vivo ocupa o espaco de outro.
//
// Antes disto nada no motor olhava a posicao de uma entidade em relacao a OUTRA.
// A grade de colisao e a arte (parede), e `engageRangeFor` so decide a que
// distancia o combate comeca. Com `maxEnemies: 6`, os seis perseguem o MESMO
// ponto — o jogador — e quem chega depois entra dentro de quem chegou antes.
//
// As cinco coisas que este arquivo tranca sao as cinco que, quebradas, custam
// mais que o defeito visual que a feature conserta:
//
// 1. A separacao TEM que caber dentro do alcance de combate. Empurrar mais que
//    `radius + radius` tira os dois da distancia em que lutam e o combate para —
//    um jogo que nao bate e pior que sprites encostadas.
// 2. Empurrao nao atravessa parede pintada. A colisao da arte e mais forte que
//    a separacao de corpos, sempre.
// 3. Nao consome `world.rng`. A sequencia de sorteio e comparada entre a
//    predicao do cliente e o resim da autoridade; um numero gasto aqui
//    deslocaria todo sorteio seguinte.
// 4. Corpo morto nao entra na conta. Ele fica em campo por `deathRemovalTimer`
//    (e pra sempre na arena do Lance, `keepCorpses`) e viraria obstaculo.
// 5. Dois corpos no MESMO pixel se separam. Sem direcao de desempate a normal
//    seria 0/0 e eles ficariam colados pra sempre — e esse e justamente o caso
//    do relato.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { isCellBlocked } from '@/data/maps'
import { createEnemyEntity } from '../entity'
import { buildMapWorld } from '../simulation'
import { engageRangeFor } from './combatSystem'
import { updateMovement } from './movementSystem'

const HUNT = 'route_46'

/**
 * TOLERANCIA DO CAMPO CHEIO, e ela tem uma razao geometrica — nao e folga
 * arbitraria pra o teste passar.
 *
 * Seis inimigos em volta do jogador, todos no alcance de combate, formam um
 * anel. Pra que os seis fiquem a 30 (raio+raio de inimigo) um do outro, o anel
 * precisa de raio >= 30; e o jogador no centro exige >= 29 de cada um. As duas
 * condicoes juntas so se satisfazem no hexagono PERFEITO — uma configuracao de
 * medida zero, que nenhum solver iterativo alcanca exatamente. Medido com 4
 * passadas: a distancia minima estabiliza em 28,98 e para de melhorar.
 *
 * Ou seja: com o campo cheio o correto e "praticamente encostados, nunca
 * dentro", e nao a separacao exata. Com 1 ou 2 corpos (o caso comum) a
 * separacao fecha inteira, e os testes de par cobram isso sem tolerancia.
 */
const TOLERANCIA_DE_CAMPO_CHEIO = 1.5

function cenario() {
  const rng = createRng(3)
  const counters = { entity: 1, effect: 1, pendingHit: 1 }
  const world = buildMapWorld(HUNT, createPokeInstance(rng, 'typhlosion', 30), { seed: 0, rng, counters })
  world.enemies = []
  return world
}

function porInimigoEm(world: ReturnType<typeof cenario>, x: number, y: number, hp?: number) {
  const enemy = createEnemyEntity(world.counters, {
    poke: createPokeInstance(world.rng, 'rattata', 10),
    x, y,
    encounterId: 'route_46_rattata',
  })
  if (hp != null) enemy.poke.hp = hp
  world.enemies.push(enemy)
  return enemy
}

function rodar(world: ReturnType<typeof cenario>, segundos: number) {
  for (let i = 0; i < Math.round(segundos / 0.1); i++) updateMovement(world, 0.1)
}

function distancia(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

describe('corpos vivos nao se sobrepoem (PH-384)', () => {
  it('dois inimigos no MESMO ponto se separam', () => {
    const world = cenario()
    const player = world.player!
    // O ponto de nascimento do jogador e garantidamente andavel (o mapa o
    // define), e e nele que os dois inimigos entram — sobrepostos. O JOGADOR e
    // que sai de perto: com ele por cima, o par viraria o caso do campo cheio,
    // e o que se mede aqui e um par sozinho.
    const x = player.x, y = player.y
    player.x = x + 600
    const a = porInimigoEm(world, x, y)
    const b = porInimigoEm(world, x, y)

    rodar(world, 2)

    expect(distancia(a, b), 'os dois continuaram colados').toBeGreaterThanOrEqual(a.radius + b.radius)
  })

  it('o jogador e o inimigo se separam sem sair do alcance de combate', () => {
    const world = cenario()
    const player = world.player!
    const enemy = porInimigoEm(world, player.x, player.y)

    rodar(world, 2)

    const dist = distancia(player, enemy)
    expect(dist, 'os corpos continuaram sobrepostos').toBeGreaterThanOrEqual(player.radius + enemy.radius - 0.01)
    // O ponto da feature inteira: separar sem tirar ninguem do combate.
    expect(dist, 'a separacao expulsou os dois do alcance de combate').toBeLessThanOrEqual(
      engageRangeFor(player, enemy),
    )
    expect(enemy.state, 'o inimigo saiu do combate').toBe('engaged')
  })

  it('a fila de seis inimigos em cima do jogador se desempilha', () => {
    const world = cenario()
    const player = world.player!
    for (let i = 0; i < 6; i++) porInimigoEm(world, player.x, player.y)

    rodar(world, 3)

    const corpos = [player, ...world.enemies]
    for (let i = 0; i < corpos.length; i++) {
      for (let j = i + 1; j < corpos.length; j++) {
        const minima = corpos[i].radius + corpos[j].radius
        expect(distancia(corpos[i], corpos[j]), `par ${i}-${j} sobreposto`)
          .toBeGreaterThanOrEqual(minima - TOLERANCIA_DE_CAMPO_CHEIO)
      }
    }
  })

  it('nenhum corpo termina dentro de parede pintada', () => {
    const world = cenario()
    const mapDef = world.mapDef!
    expect(mapDef.collisionGrid, 'a hunt do teste precisa ter grade de colisao').toBeTruthy()

    const player = world.player!
    for (let i = 0; i < 6; i++) porInimigoEm(world, player.x, player.y)

    rodar(world, 3)

    for (const corpo of [player, ...world.enemies]) {
      expect(
        isCellBlocked(mapDef, corpo.x, corpo.y),
        `corpo em (${Math.round(corpo.x)},${Math.round(corpo.y)}) caiu em celula bloqueada`,
      ).toBe(false)
    }
  })

  it('separar nao consome sorteio', () => {
    const world = cenario()
    const player = world.player!
    // Sobrepostos e DENTRO do alcance de combate: os dois ficam 'engaged',
    // entao nao ha wander nem perseguicao — o unico movimento possivel neste
    // tick e a separacao.
    const enemy = porInimigoEm(world, player.x + 1, player.y)
    const antes = world.rng.draws

    updateMovement(world, 0.1)

    expect(player.state).toBe('engaged')
    expect(enemy.state).toBe('engaged')
    expect(world.rng.draws, 'a separacao gastou numero da sequencia de sorteio').toBe(antes)
    // E mesmo assim ela agiu: os corpos nao estao mais colados.
    expect(distancia(player, enemy)).toBeGreaterThan(1)
  })

  it('corpo morto nao empurra nem e empurrado', () => {
    const world = cenario()
    const player = world.player!
    // Adormecidos pra tirar wander e perseguicao da conta: o unico deslocamento
    // possivel no tick e o da separacao. (Adormecido AINDA e empurrado — ver o
    // caso seguinte; imobilizacao e sobre nao poder AGIR, nao sobre virar
    // poste.)
    const x = player.x, y = player.y
    player.x = x + 600
    const morto = porInimigoEm(world, x, y, 0)
    const vivo = porInimigoEm(world, x, y)
    vivo.poke.status = { tipo: 'sleep', turnosRestantes: null }
    const antes = { x: morto.x, y: morto.y }

    updateMovement(world, 0.1)

    expect(morto.x, 'o cadaver foi empurrado').toBe(antes.x)
    expect(morto.y, 'o cadaver foi empurrado').toBe(antes.y)
    expect(distancia(morto, vivo), 'o cadaver empurrou o vivo').toBe(0)
  })

  it('POKE imobilizado e empurrado — imobilizado nao e intransponivel', () => {
    const world = cenario()
    const player = world.player!
    const x = player.x, y = player.y
    player.x = x + 600
    const a = porInimigoEm(world, x, y)
    const b = porInimigoEm(world, x, y)
    a.poke.status = { tipo: 'sleep', turnosRestantes: null }
    b.poke.status = { tipo: 'sleep', turnosRestantes: null }

    updateMovement(world, 0.1)

    // Sem isso, um dos lados teria que absorver o dobro do deslocamento — e
    // dois adormecidos no mesmo ponto nao se separariam nunca.
    expect(distancia(a, b)).toBeGreaterThan(0)
  })
})
