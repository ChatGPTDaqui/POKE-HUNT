// PH-395: chegar numa sala nova ANUNCIA a sala nova.
//
// O que este arquivo tranca e o disparo, e ele tem duas metades que erram em
// silencio:
//
//  1. O anuncio sai do MESMO tick em que `aplicarTransicaoDeSala` roda. Se
//     alguem mover o push pra outro lugar (o gate da quota, a reconciliacao), ele
//     passa a anunciar sala que o jogador ainda nao esta vendo — ou nao anuncia.
//  2. `silent` NAO anuncia. O resim do servidor e o catch-up de aba oculta
//     atravessam varias salas de uma vez; sem o corte, voltar pra aba entregaria
//     uma fila de avisos de salas que o jogador nunca viu, e o ultimo (o unico
//     certo) apareceria por ultimo.
import { describe, expect, it, beforeEach } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { buildMapWorld, stepWorld } from './simulation'
import { novaSala, SALA_TRANSITION_COUNTDOWN } from './systems/salaSystem'
import { splashDeSalaStore } from '@/stores/splashDeSalaVanilla'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const HUNT = 'mata_e1'

function mundo(): WorldState {
  const rng = createRng(7)
  const poke = createPokeInstance(rng, 'charmander', 20)
  return buildMapWorld(HUNT, poke, {
    seed: 0,
    rng: createRng(7),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })
}

/**
 * Arma a transicao direto no world — o caminho de verdade (30 abates + protetor)
 * ja tem os proprios testes em `salas.test.ts`, e reproduzi-lo aqui faria este
 * arquivo depender do balanceamento de combate pra testar um aviso de tela.
 */
function armarTransicao(world: WorldState, indice: number, ciclos = 0) {
  world.salaPendente = novaSala(world.rng, HUNT, indice, ciclos)
  world.salaCountdownRemaining = SALA_TRANSITION_COUNTDOWN
}

/** Roda a contagem regressiva inteira, que e quando a transicao aplica. */
function passarATransicao(world: WorldState, opts: { silent: boolean }) {
  const gs = useGameStateStore.getState()
  for (let i = 0; i < Math.ceil(SALA_TRANSITION_COUNTDOWN / 0.1) + 2; i++) {
    stepWorld(world, 0.1, gs, opts)
    if (world.salaCountdownRemaining == null) break
  }
}

describe('splash de chegada em sala nova (PH-395)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    splashDeSalaStore.getState().limpar()
  })

  it('anuncia a sala em que o jogador ACABOU de entrar', () => {
    const world = mundo()
    armarTransicao(world, 3)
    const pendente = world.salaPendente!

    passarATransicao(world, { silent: false })

    const atual = splashDeSalaStore.getState().atual
    expect(atual, 'a chegada nao anunciou nada').not.toBeNull()
    expect(atual!.sala.indice).toBe(pendente.indice)
    expect(atual!.sala.chave).toBe(pendente.chave)
    // A sala anunciada e a que esta em campo — nao a pendente de antes.
    expect(world.sala!.chave).toBe(atual!.sala.chave)
    expect(atual!.fechouEstagio).toBe(false)
  })

  it('fechar ciclo vem marcado, pra a tela poder dizer outra coisa', () => {
    const world = mundo()
    // Indice 0 com ciclo 1 e o que o motor produz ao fechar as 10 salas.
    armarTransicao(world, 0, 1)

    passarATransicao(world, { silent: false })

    expect(splashDeSalaStore.getState().atual?.fechouEstagio).toBe(true)
  })

  it('simulacao silenciosa NAO anuncia', () => {
    const world = mundo()
    armarTransicao(world, 2)

    passarATransicao(world, { silent: true })

    // A sala trocou de verdade...
    expect(world.sala!.indice).toBe(2)
    // ...e ninguem foi avisado, porque ninguem estava olhando.
    expect(splashDeSalaStore.getState().atual).toBeNull()
  })

  it('sala nova por cima de um aviso ainda na tela SUBSTITUI o anterior', () => {
    const world = mundo()
    armarTransicao(world, 1)
    passarATransicao(world, { silent: false })
    const primeiro = splashDeSalaStore.getState().atual!

    armarTransicao(world, 2)
    passarATransicao(world, { silent: false })
    const segundo = splashDeSalaStore.getState().atual!

    // Id novo (o React precisa dele pra reiniciar a animacao) e conteudo novo:
    // mostrar a sala anterior enquanto o jogador esta na seguinte seria mentira.
    expect(segundo.id).not.toBe(primeiro.id)
    expect(segundo.sala.indice).toBe(2)
  })
})
