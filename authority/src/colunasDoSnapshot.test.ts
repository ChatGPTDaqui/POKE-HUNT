// As colunas que o snapshot PEDE cobrem tudo que o diff e o mapper LEEM.
//
// Por que isto merece teste proprio (PH-185): `carregarEstado` deixou de usar
// `select=*` e passou a listar coluna por coluna, porque `player_pokedex` e
// relida inteira a cada flush e sozinha respondia por praticamente todo o
// egress de PostgREST do projeto. Lista explicita e mais barata, mas cria uma
// forma nova de errar — e as duas falhas possiveis sao SILENCIOSAS:
//
//  - Coluna de MENOS que `gameStateTo*Rows` produz: `linhaIgual` compara as
//    chaves da linha nova contra o baseline, nao acha a chave, conclui "mudou"
//    e o flush volta a gravar a tabela INTEIRA toda vez. Nao quebra nada, so
//    desfaz a PH-90 e aparece na fatura meses depois.
//  - Coluna de MENOS que `snapshotToGameState` le: o estado nasce com o campo
//    vazio. Foi o caso de `player_items.locked`, pego na revisao desta issue —
//    sem ele, item trancado voltaria a ser vendavel sem nenhum aviso.
//
// Nenhum destes testes toca o banco: eles comparam a lista de colunas contra as
// chaves que os proprios geradores de linha montam, entao acusam no CI, antes
// de qualquer deploy.
import { describe, expect, it } from 'vitest'
import {
  defaultGameStateData,
  gameStateToItemRows, gameStateToPokedexRows, gameStateToAutoCatchRuleRows,
  type GameStateData,
} from '#engine'
import { COLUNAS_ITENS, COLUNAS_POKEDEX, COLUNAS_AUTO_CATCH } from './progresso.js'

const USER = '00000000-0000-4000-8000-000000000001'

/** Estado com uma linha em cada tabela — o gerador so devolve chave se houver dado. */
function estadoComDado(): GameStateData {
  const s = defaultGameStateData()
  return {
    ...s,
    items: { ...s.items, poke_ball: 7 },
    lockedItems: { ...s.lockedItems, poke_ball: true },
    pokedexKills: { ...s.pokedexKills, pikachu: { normal: 3, shiny: 1 } },
    autoCatchRules: [{ speciesId: 'pikachu', ballItemId: 'poke_ball' }],
  } as GameStateData
}

function chavesDe(linhas: Record<string, unknown>[]): string[] {
  expect(linhas.length, 'gerador devolveu lista vazia — o teste rodaria no vacuo').toBeGreaterThan(0)
  return [...new Set(linhas.flatMap((l) => Object.keys(l)))]
}

describe('colunas do snapshot cobrem o que o flush le (PH-185)', () => {
  const casos: [string, string, (s: GameStateData) => Record<string, unknown>[]][] = [
    ['player_items', COLUNAS_ITENS, (s) => gameStateToItemRows(USER, s)],
    ['player_pokedex', COLUNAS_POKEDEX, (s) => gameStateToPokedexRows(USER, s)],
    ['player_auto_catch_rules', COLUNAS_AUTO_CATCH, (s) => gameStateToAutoCatchRuleRows(USER, s)],
  ]

  it.each(casos)('%s: toda coluna que o gerador monta e pedida na leitura', (tabela, colunas, gerar) => {
    const pedidas = new Set(colunas.split(','))
    for (const chave of chavesDe(gerar(estadoComDado()))) {
      expect(
        pedidas.has(chave),
        `${tabela}: \`gameStateTo*Rows\` monta "${chave}", mas a leitura nao pede essa coluna. `
        + '`linhaIgual` vai achar que toda linha mudou e o flush volta a gravar a tabela inteira.',
      ).toBe(true)
    }
  })

  it('player_items pede `locked`, que o mapper le e nenhum gerador monta', () => {
    // `locked` nao aparece no teste acima porque `gameStateToItemRows` nao a
    // produz — quem a consome e `snapshotToGameState`, montando `lockedItems`.
    // Sem esta linha, a unica prova de que ela e necessaria some.
    expect(
      COLUNAS_ITENS.split(','),
      'sem `locked` no snapshot, item trancado volta a ser vendavel em silencio',
    ).toContain('locked')
  })

  it('nenhuma lista pede `updated_at` ou `created_at`', () => {
    // Sao o grosso do que esta issue cortou: nenhum gerador os monta, entao
    // `linhaIgual` nunca os consulta. Se voltarem, o ganho volta atras.
    for (const [nome, colunas] of [
      ['COLUNAS_ITENS', COLUNAS_ITENS], ['COLUNAS_POKEDEX', COLUNAS_POKEDEX],
      ['COLUNAS_AUTO_CATCH', COLUNAS_AUTO_CATCH],
    ] as const) {
      expect(colunas, `${nome} voltou a pedir carimbo de tempo que ninguem le`).not.toMatch(/(updated|created)_at/)
    }
  })

  it('toda lista pede `user_id`', () => {
    // `gameStateTo*Rows` monta `user_id` em todas as linhas. O caso ja esta
    // coberto acima, mas fixar aqui deixa o motivo explicito: e a chave que
    // mais parece descartavel (constante, e ja no filtro) e a que mais custa
    // remover.
    for (const colunas of [COLUNAS_ITENS, COLUNAS_POKEDEX, COLUNAS_AUTO_CATCH]) {
      expect(colunas.split(',')).toContain('user_id')
    }
  })
})
