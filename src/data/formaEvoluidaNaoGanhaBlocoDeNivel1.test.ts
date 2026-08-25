// PH-150 — o bloco de nivel 1 de uma FORMA EVOLUIDA e a lista do Recordador,
// e ela nao pode entrar no jogo como kit inicial.
//
// O gerador respondia "esta especie e estagio-base?" olhando o ELENCO: quem nao
// aparecia como destino de evolucao de ninguem passava por base, e base nunca
// perde golpe de nivel 1 (ali "nivel 1" e o kit inicial de verdade).
//
// Duas coisas escapavam desse criterio:
//
//  1. pai FORA do recorte de dex. Sudowoodo evolui de Bonsly (#438), que nao
//     entra — e ele aparecia selvagem no nivel 1 com `wood_hammer`, 120 de
//     poder, o golpe mais forte da faixa inteira.
//  2. pai com RAMO. `paiDe` era montado de `evolvesTo`, que aponta so pro
//     PRIMEIRO destino: Jolteon, Flareon, Espeon, Umbreon, Bellossom, Slowking,
//     Hitmonchan e Hitmontop tambem passavam por base, desde que PH-145 criou
//     os ramos.
//
// A resposta certa vem da CADEIA REAL, e `catalog.json#formasEvoluidas` e ela
// emitida — nao de `scripts/.cache/pokeapi/`, que e gitignored e faria este
// arquivo medir o vazio no CI.
import { describe, expect, it } from 'vitest'

import { SPECIES_DATA } from './generated/pokes.generated'
import { ABILITIES_DATA } from './generated/abilities.generated'
import CATALOGO from '../../scripts/usum/catalog.json'

const FORMAS_EVOLUIDAS: string[] = CATALOGO.formasEvoluidas as string[]

// O mesmo piso que o gerador usa pra decidir que um golpe restaurado NAO volta
// pro nivel 1 (`scripts/lib/pokeapi.js#PODER_QUE_NAO_VOLTA_PRO_NIVEL_1`).
const PODER_DEMAIS_NO_NIVEL_1 = 100

describe('forma evoluida nao entra com bloco de Recordador (PH-150)', () => {
  it('o catalogo traz a lista, e ela cobre o elenco de verdade', () => {
    // Guarda anti-vacuo em tres niveis: campo ausente, lista vazia, ou lista
    // que nao intersecta o elenco — nos tres o `it` de baixo passaria sem olhar
    // nada, que e o modo de falha mais caro possivel num teste-guarda.
    expect(FORMAS_EVOLUIDAS.length).toBeGreaterThan(100)
    const noElenco = FORMAS_EVOLUIDAS.filter((id) => SPECIES_DATA[id])
    expect(noElenco.length).toBeGreaterThan(50)
    // Estagio-base NAO pode estar na lista — senao ela nao esta separando nada.
    expect(FORMAS_EVOLUIDAS).not.toContain('charmander')
    expect(FORMAS_EVOLUIDAS).not.toContain('eevee')
  })

  it('Sudowoodo nao nasce com Wood Hammer', () => {
    // O caso nomeado da issue, e o mais caro: 120 de poder num POKE selvagem de
    // nivel 1 e ~3x o golpe de qualquer vizinho da faixa.
    const nivel1 = SPECIES_DATA.sudowoodo!.abilities.filter((a) => a.levelReq <= 1)
    expect(nivel1.map((a) => a.key)).not.toContain('wood_hammer')
  })

  it('os DOIS caminhos que escapavam estao cobertos', () => {
    // Um representante de cada causa, nomeado: sem isto, uma correcao que
    // resolvesse so o pai-fora-do-recorte passaria e os ramos voltariam a
    // entregar bloco de Recordador em silencio.
    expect(FORMAS_EVOLUIDAS, 'pai fora do recorte de dex').toContain('sudowoodo')
    expect(FORMAS_EVOLUIDAS, 'pai com ramo — segundo destino em diante').toContain('jolteon')
    expect(FORMAS_EVOLUIDAS, 'pai com ramo — Tyrogue tem tres').toContain('hitmontop')
  })

  it('nenhuma forma evoluida entrega golpe forte no nivel 1', () => {
    const fortes: string[] = []
    for (const id of FORMAS_EVOLUIDAS) {
      const especie = SPECIES_DATA[id]
      if (!especie) continue // fora do recorte deste jogo
      for (const a of especie.abilities) {
        if (a.levelReq > 1) continue
        const poder = ABILITIES_DATA[a.key]?.power ?? 0
        if (poder >= PODER_DEMAIS_NO_NIVEL_1) fortes.push(`${id}/${a.key} (${poder})`)
      }
    }
    expect(
      fortes,
      'forma evoluida com golpe forte no nivel 1. O bloco de nivel 1 dela e a lista do '
      + 'Recordador, e o sintoma aparece longe daqui: um selvagem de nivel baixo batendo como '
      + 'um POKE de fim de jogo.',
    ).toEqual([])
  })
})
