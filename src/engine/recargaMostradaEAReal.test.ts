// PH-493: o tempo de recarga que a tela mostra é o tempo que o combate cobra.
//
// A QUEIXA, palavras do dono do projeto: "analisar o tempo de coldown dos
// golpes, pois na pratica o tempo de recarga é um e na teoria (quando passamos a
// seta em cima do golpe) é outra."
//
// ERAM DOIS DESVIOS SOMADOS, e nenhum dos dois aparecia na tela:
//
//   1. VELOCIDADE. A ficha escrevia `ability.cooldown`, que é a recarga NOMINAL
//      derivada do PP (`abilities.ts#cooldownFromPp`). O combate divide isso
//      pela Velocidade sobre a referência de 100 (`scaledCooldown`) — POKE
//      rápido recarrega antes, POKE lento depois, e o número escrito não se
//      mexia.
//   2. O TURNO. Toda ação passa por `globalCooldown = MIN_ACTION_GAP`, o turno
//      de 3s (PH-376). Nenhum golpe sai antes disso, então todo golpe cuja
//      recarga própria fique abaixo do turno saía A CADA 3s enquanto exibia
//      "1.4s" — mais que o dobro do prometido.
//
// O QUE ESTE ARQUIVO TRANCA é a função que a tela passou a usar. A ligação com
// as duas telas (`AbilityHud` e `AbilityTooltip`) não dá para medir aqui sem
// montar HUD; o que dá, e é o que importa, é garantir que a função não volte a
// devolver o número cru do catálogo.
import { describe, expect, it } from 'vitest'

import { TURNO_SEGUNDOS, type Ability } from '@/data/abilities'
import { recargaEfetivaDoGolpe, VELOCIDADE_DE_REFERENCIA } from './systems/combatSystem'

/** Um golpe de recarga nominal LONGA — bem acima do turno, para a Velocidade ter o que mover. */
function golpeLento(cooldown: number): Ability {
  return {
    id: 'teste_lento', name: 'Teste Lento', type: 'NORMAL', category: 'physical',
    power: 90, accuracy: 100, pp: 5, cooldown, target: 'single',
  } as unknown as Ability
}

describe('a recarga mostrada e a recarga real (PH-493)', () => {
  it('na Velocidade de referencia ela e a recarga nominal do catalogo', () => {
    // A âncora: sem este caso, uma função que devolvesse qualquer coisa maior
    // que o turno passaria nos dois casos abaixo.
    const ability = golpeLento(12)
    expect(recargaEfetivaDoGolpe(ability, VELOCIDADE_DE_REFERENCIA)).toBeCloseTo(12, 5)
  })

  it('Velocidade DOBRADA corta a recarga pela metade', () => {
    const ability = golpeLento(12)
    expect(recargaEfetivaDoGolpe(ability, VELOCIDADE_DE_REFERENCIA * 2)).toBeCloseTo(6, 5)
  })

  it('Velocidade pela METADE dobra a recarga', () => {
    const ability = golpeLento(12)
    expect(recargaEfetivaDoGolpe(ability, VELOCIDADE_DE_REFERENCIA / 2)).toBeCloseTo(24, 5)
  })

  it('nenhum golpe desce abaixo do TURNO, por mais rapido que seja', () => {
    // O segundo desvio, e o mais visível: um golpe de recarga nominal 1,4s
    // exibia "1.4s" e saía de 3 em 3 segundos.
    const rapido = golpeLento(1.4)
    expect(recargaEfetivaDoGolpe(rapido, VELOCIDADE_DE_REFERENCIA)).toBe(TURNO_SEGUNDOS)
    // E nem com Velocidade absurda: o turno é de todos.
    expect(recargaEfetivaDoGolpe(rapido, VELOCIDADE_DE_REFERENCIA * 50)).toBe(TURNO_SEGUNDOS)
  })

  it('o piso do turno NAO achata golpe lento — senao a ficha viraria "3.0s" pra tudo', () => {
    // O contra-caso do piso. Um `Math.min` no lugar do `Math.max`, ou um piso
    // aplicado como valor fixo, passaria no caso acima e apagaria a diferença
    // entre os quatro slots — que é justamente o que a barra de recarga existe
    // para mostrar.
    const lento = golpeLento(12)
    expect(recargaEfetivaDoGolpe(lento, VELOCIDADE_DE_REFERENCIA)).toBeGreaterThan(TURNO_SEGUNDOS)
  })

  it('a recarga nominal do catalogo NAO e o que a tela mostra num POKE lento', () => {
    // O CASO QUE NOMEIA O BUG. Se alguém devolver `ability.cooldown` aqui, este
    // é o teste que fica vermelho.
    const ability = golpeLento(12)
    const deUmPokeLento = recargaEfetivaDoGolpe(ability, VELOCIDADE_DE_REFERENCIA / 4)
    expect(deUmPokeLento).not.toBeCloseTo(ability.cooldown!, 5)
    expect(deUmPokeLento).toBeCloseTo(48, 5)
  })
})
