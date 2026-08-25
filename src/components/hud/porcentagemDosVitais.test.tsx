// @vitest-environment jsdom
// PH-157 — a porcentagem escrita no trilho nao pode mentir nas duas pontas.
//
// A barra e a porcentagem respondem perguntas diferentes. A barra diz "esta
// acabando" de relance e um arredondamento a mais ou a menos nao muda nada
// nela. O NUMERO, nao: ele e lido como valor exato, e `Math.round` erra
// justamente onde a decisao do jogador acontece.
//
//  - 4 de 900 de HP arredonda pra `0%`, num POKE que esta VIVO. O jogador le
//    "morreu" e o POKE ainda esta lutando.
//  - 897 de 900 arredonda pra `100%`, num POKE que ja levou dano. O jogador le
//    "cheio" e deixa de curar.
//
// Dai `floor` com piso de 1: `0%` fica reservado pro POKE caido de verdade.
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { StatusRail } from './StatusRail'

// Snorlax no nivel 100, e os dois sao de proposito: o efeito so existe com HP
// maximo acima de 200, onde `1` de HP fica abaixo de meio ponto percentual.
// Charmander no nivel 100 da 188 e NAO serve: la `Math.round` ja acerta, e o
// teste passaria sem medir nada. Conferido rodando.
const NIVEL = 100

/**
 * Poe um POKE em campo com o HP pedido e devolve o texto de porcentagem de HP.
 *
 * `hpDe` recebe o HP maximo real da instancia em vez de uma fracao: fracao
 * exigia arredondar aqui dentro, e foi assim que a primeira versao deste
 * arquivo se enganou sozinha — `Math.round(max * 0.9967)` devolvia o HP CHEIO,
 * entao o caso "levou dano" media um POKE intacto.
 *
 * Le do `gameStateStore` de proposito: sem `worldStore.player`, `usePokeAtivo`
 * cai no time, que e o caminho de fora da hunt — o que um teste sem motor monta
 * sem simular tick nenhum.
 */
function textoDeHp(hpDe: (max: number) => number): string {
  const poke = createPokeInstance(createRng(7), 'snorlax', NIVEL)
  // Guarda anti-vacuo: com HP maximo pequeno os dois casos de ponta deixam de
  // ser pontas e o arquivo inteiro passa a concordar com `Math.round`.
  expect(poke.stats.hp, 'HP maximo pequeno demais pra medir a ponta de baixo').toBeGreaterThan(200)
  poke.hp = hpDe(poke.stats.hp)
  useGameStateStore.setState({ team: [poke], activeIndex: 0 } as never, false)
  render(<StatusRail />)
  // Dois textos em `%` no trilho: HP em cima, EXP embaixo. A ordem no DOM e a
  // ordem visual.
  return screen.getAllByText(/^\d+%$/)[0]!.textContent!
}

describe('a porcentagem dos vitais (PH-157)', () => {
  beforeEach(() => {
    useGameStateStore.getState().resetToDefaults()
    useWorldStore.setState({ player: null } as never, false)
  })

  it('POKE VIVO com 1 de HP mostra 1%, e nunca 0%', () => {
    // `Math.round` daria `0%` aqui. `0%` e a leitura de POKE caido, e o jogador
    // que ve isso para de curar por achar que ja perdeu.
    expect(textoDeHp(() => 1)).toBe('1%')
  })

  it('POKE a 1 de HP do cheio nao mostra 100%', () => {
    // O par do caso acima, na ponta oposta: `Math.round` da `100`, e o jogador
    // le "cheio" com dano tomado.
    expect(textoDeHp((max) => max - 1)).toBe('99%')
  })

  it('POKE CAIDO mostra 0%', () => {
    // O unico caso em que `0%` e a informacao certa — e o que o piso de 1 nao
    // pode atrapalhar.
    expect(textoDeHp(() => 0)).toBe('0%')
  })

  it('POKE com HP cheio mostra 100%', () => {
    // Guarda contra "consertar" a ponta de cima com um teto de 99.
    expect(textoDeHp((max) => max)).toBe('100%')
  })
})
