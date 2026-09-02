// PH-280 — o POKE parava e voltava a andar varias vezes por segundo com o Lure.
//
// O relato foi visual ("fica andando travando"), e a causa e um limiar unico: o
// lure zera o destino quando um selvagem ja reunido passa de 0,8x da coleira, e
// devolve o destino assim que ele volta pra dentro. Como o selvagem oscila em
// torno dessa linha enquanto persegue, cada cruzamento virava um solavanco.
//
// Medido em scripts/harness/lure-para-e-anda.mjs, 60s por corrida, 12 sementes:
//
//                        antes    depois
//   lure desligado         0,0       0,0
//   juntar 2              32,3       0,3
//   juntar 3              81,2       1,3
//   juntar 4             154,7       3,7   <- 2,6 solavancos por segundo
//
// Este arquivo tranca o MECANISMO que produziu esses numeros: dois limiares, e
// nao um. Sem ele, alguem "simplifica" a fracao de volta pra uma constante so e
// o travamento volta sem nada ficar vermelho.
import { describe, expect, it, beforeEach } from 'vitest'

import { atualizarLure } from './systems/lureSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import type { WorldState } from './types'

const COLEIRA = 400
const PASSO = 1 / 60

/**
 * Mundo minimo com UM selvagem ja reunido (em `chase`, mirando o jogador) e um
 * segundo ainda solto, pra sempre haver candidato — sem candidato a reuniao
 * termina por outra saida e o teste mediria outra coisa.
 */
function mundo(distanciaDoReunido: number): WorldState {
  const player = { id: 'p1', x: 0, y: 0, poke: { hp: 50 }, fainted: false }
  const reunido = {
    id: 'e1', x: distanciaDoReunido, y: 0, targetId: 'p1', state: 'chase',
    leashRadius: COLEIRA, poke: { hp: 10, isShiny: false },
  }
  const solto = {
    id: 'e2', x: 60, y: 0, targetId: null, state: 'wander',
    leashRadius: COLEIRA, poke: { hp: 10, isShiny: false },
  }
  return {
    player, enemies: [reunido, solto], mapDef: { id: 'mata_e1', passiveEnemies: false }, lure: null,
  } as unknown as WorldState
}

/** Move o selvagem reunido e roda um tick do lure, preservando `world.lure`. */
function tick(world: WorldState, distancia: number) {
  world.enemies[0].x = distancia
  atualizarLure(world, useGameStateStore.getState(), PASSO)
  return world.lure!
}

describe('histerese da espera do lure (PH-280)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useGameStateStore.setState({ lureConfig: { ligado: true, quantidade: 3 } } as never, false)
  })

  it('comeca a esperar ao passar de 0,8 da coleira', () => {
    const world = mundo(COLEIRA * 0.5)
    expect(tick(world, COLEIRA * 0.5).esperandoRetardatario).toBe(false)
    expect(tick(world, COLEIRA * 0.85).esperandoRetardatario).toBe(true)
  })

  it('JA ESPERANDO, nao volta a andar so por cruzar 0,8 de novo', () => {
    // Este e o caso que produzia o travamento: o selvagem oscila em torno da
    // linha de entrada enquanto corre atras do jogador.
    const world = mundo(COLEIRA * 0.85)
    expect(tick(world, COLEIRA * 0.85).esperandoRetardatario).toBe(true)
    expect(tick(world, COLEIRA * 0.78).esperandoRetardatario, 'voltou a andar cedo demais').toBe(true)
    expect(tick(world, COLEIRA * 0.7).esperandoRetardatario).toBe(true)
  })

  it('volta a andar quando o retardatario ENCOSTA de verdade', () => {
    const world = mundo(COLEIRA * 0.85)
    tick(world, COLEIRA * 0.85)
    const depois = tick(world, COLEIRA * 0.5)
    expect(depois.esperandoRetardatario).toBe(false)
    expect(depois.destino, 'sem destino, o jogador fica parado em vez de puxar').not.toBeNull()
  })

  it('oscilar em torno da linha de entrada nao produz nenhuma troca', () => {
    // O teste que representa o relato: 40 ticks cruzando 0,8 pra cima e pra
    // baixo. Com um limiar so, isto dava 40 trocas; com dois, uma.
    const world = mundo(COLEIRA * 0.85)
    let trocas = 0
    let anterior = tick(world, COLEIRA * 0.85).esperandoRetardatario
    for (let i = 0; i < 40; i++) {
      const atual = tick(world, COLEIRA * (i % 2 === 0 ? 0.78 : 0.82)).esperandoRetardatario
      if (atual !== anterior) trocas++
      anterior = atual
    }
    expect(trocas, 'o POKE voltou a parar e andar a cada tick').toBe(0)
  })
})
