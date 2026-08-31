// PH-331 — o protetor da sala (Guardian/Lord) ganha a mesma prioridade de alvo
// que o shiny, e ela vale nos DOIS lugares que decidem alvo.
//
// Sao dois de propósito, e o defeito estava exatamente na diferenca entre eles:
//
//  - `updateMovement` decide pra ONDE o jogador anda. Aqui o shiny ja era
//    excecao; o protetor nao era.
//  - `updateCombat` decide em QUEM o jogador bate (`engagedEnemies[0]`). Aqui
//    nao havia prioridade nenhuma — a ordem era a de `world.enemies`, isto e, a
//    ordem de SPAWN.
//
// Com os dois divergindo, o caso "protetor e mob comum engajados ao mesmo tempo"
// produzia um jogador andando ate o protetor e batendo no mob. Nada nisso
// levanta erro: a hunt simplesmente fica parada em 30/30 mais tempo.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { buildMapWorld } from '../simulation'
import { criarInimigoDeTeste } from '../testes/inimigoDeTeste'
import { updateMovement } from './movementSystem'
import { updateCombat } from './combatSystem'

import type { EnemyEntity, WorldState } from '../types'

const HUNT = 'mata_faixa1'

function mundo(semente = 11): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld(HUNT, poke, {
    seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
  world.enemies = []
  return world
}

/**
 * Poe um inimigo a `dy` unidades do jogador, no eixo Y.
 *
 * `dy` NEGATIVO poe do lado oposto, e e assim que os casos de prioridade sao
 * montados: com os dois candidatos pro mesmo lado, "andou na direcao do alvo
 * certo" e indistinguivel de "andou na direcao do alvo errado". O SINAL do
 * deslocamento e o unico sinal que nao depende de quanto tempo passou.
 *
 * `aggroRadius`/`leashRadius` zerados: por padrao o mob persegue o jogador
 * (175 unidades de aggro), entao ele chega perto sozinho e a distancia final
 * deixa de medir escolha de alvo. Aqui os inimigos ficam parados de propósito —
 * quem se move e so o jogador, que e o que esta sob teste.
 */
function inimigoA(world: WorldState, dy: number, opts: { shiny?: boolean; protetor?: boolean } = {}): EnemyEntity {
  const player = world.player!
  const enemy = criarInimigoDeTeste(world, 'sentret', 20, { x: player.x, y: player.y + dy })
  if (opts.shiny) enemy.poke.isShiny = true
  if (opts.protetor) enemy.isProtetor = true
  enemy.aggroRadius = 0
  enemy.leashRadius = 0
  enemy.moveSpeed = 0
  world.enemies.push(enemy)
  return enemy
}

/** Pra que lado o jogador andou depois de um passo de movimento. */
function ladoQueOJogadorAndou(world: WorldState): number {
  const player = world.player!
  const antes = player.y
  updateMovement(world, 0.5)
  return Math.sign(player.y - antes)
}

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
})

describe('movimento: o protetor sobrepoe o mob mais proximo (PH-331)', () => {
  it('o jogador anda pro protetor LONGE em vez do mob comum PERTO', () => {
    const world = mundo()
    inimigoA(world, +200)                        // mob comum, perto, pra baixo
    inimigoA(world, -600, { protetor: true })    // protetor, longe, pra cima

    expect(ladoQueOJogadorAndou(world), 'andou pro mob comum').toBe(-1)
    expect(world.player!.state).toBe('chase')
  })

  it('sem protetor e sem shiny, continua sendo o mais proximo', () => {
    const world = mundo()
    inimigoA(world, +200)
    inimigoA(world, -600)

    expect(ladoQueOJogadorAndou(world)).toBe(+1)
  })

  it('shiny continua prioritario — a regra antiga nao foi perdida', () => {
    const world = mundo()
    inimigoA(world, +200)
    inimigoA(world, -600, { shiny: true })

    expect(ladoQueOJogadorAndou(world)).toBe(-1)
  })

  it('protetor e shiny estao no MESMO nivel: desempata por distancia', () => {
    // Nao ha desempate por categoria de propósito (ver ehAlvoPrioritario). Este
    // caso trava a decisao: quem tentar empilhar "protetor acima de shiny" faz
    // ele reprovar, o que forca a discussao em vez da mudanca silenciosa.
    const world = mundo()
    inimigoA(world, -600, { protetor: true })
    inimigoA(world, +250, { shiny: true })

    expect(ladoQueOJogadorAndou(world), 'o shiny estava mais perto').toBe(+1)
  })
})

describe('combate: o golpe vai no protetor, nao em quem nasceu primeiro (PH-331)', () => {
  /** Poe os dois engajados no jogador, na ordem de spawn dada. */
  function doisEngajados(world: WorldState, ordem: 'mob-primeiro' | 'protetor-primeiro') {
    const player = world.player!
    const primeiro = inimigoA(world, 12, ordem === 'mob-primeiro' ? {} : { protetor: true })
    const segundo = inimigoA(world, 14, ordem === 'mob-primeiro' ? { protetor: true } : {})
    for (const e of [primeiro, segundo]) {
      e.state = 'engaged'
      e.targetId = player.id
    }
    return { primeiro, segundo }
  }

  it.each(['mob-primeiro', 'protetor-primeiro'] as const)(
    'com ordem de spawn "%s", o alvo publicado e o protetor',
    (ordem) => {
      const world = mundo()
      doisEngajados(world, ordem)

      updateCombat(world, 0, { silent: true })

      const protetor = world.enemies.find((e) => e.isProtetor)!
      // `player.targetId` e o alvo que o motor de fato usa como `primaryTarget`
      // e que a tela publica (PH-132) — os dois saem do MESMO `engagedEnemies[0]`.
      expect(world.player!.targetId).toBe(protetor.id)
    },
  )

  it('sem protetor engajado, a ordem dos engajados nao e mexida', () => {
    // Guarda contra a correcao larga demais: quando nao ha alvo prioritario, o
    // caminho tem que ser o de antes, byte a byte — inclusive a ordem em que os
    // inimigos agem, que e a ordem em que consomem `world.rng`.
    const world = mundo()
    const { primeiro } = doisEngajados(world, 'mob-primeiro')
    // Desfaz o protetor do segundo: nenhum dos dois e prioritario agora.
    world.enemies[1].isProtetor = false

    updateCombat(world, 0, { silent: true })

    expect(world.player!.targetId).toBe(primeiro.id)
  })
})
