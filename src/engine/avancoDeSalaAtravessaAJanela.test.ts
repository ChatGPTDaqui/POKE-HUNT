// PH-331 — o guardiao caiu, e a sala tem que trocar NESSE MOMENTO. O que ela
// nao pode fazer e trocar 3 segundos depois numa janela que ja fechou.
//
// ---------------------------------------------------------------------------
// O DEFEITO, medido antes da correcao
// ---------------------------------------------------------------------------
// `salaPendente` e `salaCountdownRemaining` sao EFEMEROS: nao atravessam a
// reconstrucao de mundo que o servidor faz a cada janela de flush. O overlay
// "Entrando em nova area" dura `SALA_TRANSITION_COUNTDOWN` = 3s. Junte os dois e
// existe uma janela de ambiguidade de 3 segundos no fim de cada flush:
//
//   janela  [.....................  mata o protetor  ..|  fim da janela
//                                   contagem armada ---^  contagem PERDIDA
//
// O que o flush grava nesse caso e a sala ANTIGA (`sala_abates = 30`) com a
// linha de `sala_protetor` deletada. A janela seguinte reconstroi, le "esta sala
// pede protetor e nao ha protetor" — `protetorResolvido` tambem e efemero e nao
// tem coluna — e sorteia um protetor NOVO, com HP cheio. O jogador mata o
// guardiao e ganha outro guardiao, na mesma sala, sem nada na tela explicando.
//
// Sonda de 2026-08-31 (Entei Lv102, `campo_aberto_e1`, sala 9):
//
//   janela 1: protetor morre em 3,63s, contagem armada, janela cortada 1s depois
//             -> grava sala indice 8, abates 30
//   janela 2: protetor NOVO nasce e morre em 7,37s -> ainda sala indice 8
//
// A correcao e `if (silent) encurtarTransicaoDeSala(world)` em `stepWorld`: quem
// nao tem plateia nao espera animacao, e matar + trocar de sala passam a
// acontecer no mesmo tick. A janela de ambiguidade cai de 3s pra um tick.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { ABATES_POR_SALA } from '@/data/biomas'
import { buildMapWorld, stepWorld, handleEnemyDefeated } from './simulation'
import { SALA_TRANSITION_COUNTDOWN } from './systems/salaSystem'

import type { WorldState } from './types'

const HUNT = 'mata_e1'
const PASSO = 0.1

function mundoComQuotaFechada(semente: number): WorldState {
  const rng = createRng(semente)
  const poke = createPokeInstance(rng, 'charmander', 30)
  const world = buildMapWorld(
    HUNT, poke,
    { seed: 0, rng: createRng(semente), counters: { entity: 1, effect: 1, pendingHit: 1 } },
    // PH-427: sala 1 de 3 (o estagio 1 tem 3 salas). Era o indice 2, que virou
    // a ULTIMA do estagio — e a ultima fecha o estagio e volta pro indice 0,
    // entao o `indiceAntes + 1` que este teste afirma deixaria de valer. O caso
    // aqui e a transicao atravessar a janela do flush, e Guardian serve igual.
    { sala: { indice: 0, chave: 'volcano', abates: ABATES_POR_SALA, ciclos: 0 } },
  )
  world.respawnTimer = 999
  return world
}

/** Faz o protetor nascer e o mata pelo caminho de abate real. */
function nascerEMatarOProtetor(world: WorldState, silent: boolean): void {
  const gameState = useGameStateStore.getState()
  stepWorld(world, PASSO, gameState, { silent })
  const protetor = world.enemies.find((e) => e.isProtetor)
  expect(protetor, 'o protetor nao nasceu — o cenario nao e o que o teste supoe').toBeDefined()
  protetor!.poke.hp = 0
  handleEnemyDefeated(world, protetor!, gameState, { silent })
}

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
})

describe('simulacao silenciosa troca de sala no mesmo tick (PH-331)', () => {
  it('um tick depois do abate do protetor, a sala JA e outra', () => {
    const world = mundoComQuotaFechada(70)
    const indiceAntes = world.sala!.indice
    nascerEMatarOProtetor(world, true)

    // Um unico passo. Sem o corte de `encurtarTransicaoDeSala`, aqui ainda
    // faltariam ~2,9s de contagem.
    stepWorld(world, PASSO, useGameStateStore.getState(), { silent: true })

    expect(world.sala!.indice, 'a sala nao trocou dentro da janela').toBe(indiceAntes + 1)
    expect(world.sala!.abates).toBe(0)
    expect(world.salaPendente).toBeNull()
    expect(world.salaCountdownRemaining).toBeNull()
    expect(world.protetorPendente).toBeNull()
  })

  it('a janela que fecha logo depois do abate NAO deixa um segundo protetor pra tras', () => {
    // Este e o caso do jogador: matou o guardiao, o flush fechou, e a janela
    // seguinte tem que continuar na sala NOVA — nao dar outro guardiao.
    const world = mundoComQuotaFechada(71)
    const indiceAntes = world.sala!.indice
    nascerEMatarOProtetor(world, true)
    stepWorld(world, PASSO, useGameStateStore.getState(), { silent: true })

    // O que o flush persiste e le de volta: a sala e o protetor pendente.
    const salaGravada = { ...world.sala! }
    const protetorGravado = world.protetorPendente

    const rng = createRng(71)
    const poke = createPokeInstance(rng, 'charmander', 30)
    const janelaSeguinte = buildMapWorld(
      HUNT, poke,
      { seed: 0, rng: createRng(72), counters: { entity: 1, effect: 1, pendingHit: 1 } },
      { sala: salaGravada, protetorPendente: protetorGravado },
    )

    expect(salaGravada.indice, 'a sala gravada ainda era a antiga').toBe(indiceAntes + 1)
    expect(
      janelaSeguinte.enemies.some((e) => e.isProtetor),
      'a janela seguinte nasceu com um protetor novo — o abate anterior nao valeu',
    ).toBe(false)
    expect(janelaSeguinte.protetorPendente).toBeNull()
    expect(janelaSeguinte.enemies.length).toBeGreaterThan(0)
  })
})

describe('o jogo AO VIVO continua mostrando a contagem de nova area (PH-331)', () => {
  it('sem `silent`, a transicao espera SALA_TRANSITION_COUNTDOWN', () => {
    // Guarda contra a correcao larga demais. O overlay existe pra o jogador ler
    // o nome do sub-bioma novo; encurtar tambem ao vivo tiraria a unica pista de
    // que a sala mudou.
    const world = mundoComQuotaFechada(73)
    const indiceAntes = world.sala!.indice
    nascerEMatarOProtetor(world, false)

    expect(world.salaCountdownRemaining).toBeCloseTo(SALA_TRANSITION_COUNTDOWN, 5)

    stepWorld(world, PASSO, useGameStateStore.getState(), { silent: false })
    expect(world.sala!.indice, 'a sala trocou antes da contagem terminar').toBe(indiceAntes)
    expect(world.salaCountdownRemaining).toBeGreaterThan(0)

    // Passado o prazo, ela troca como sempre.
    const ticks = Math.ceil(SALA_TRANSITION_COUNTDOWN / PASSO) + 2
    for (let i = 0; i < ticks; i++) stepWorld(world, PASSO, useGameStateStore.getState(), { silent: false })
    expect(world.sala!.indice).toBe(indiceAntes + 1)
  })
})
