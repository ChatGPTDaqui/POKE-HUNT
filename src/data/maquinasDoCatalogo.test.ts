// O DADO DAS MAQUINAS BATE COM O JOGO? (PH-512)
//
// O QUE ESTAS GUARDAS EXISTEM PRA IMPEDIR
// -----------------------------------------------------------------------------
// `scripts/usum/maquinas.json` e gerado por um script que fala com a PokeAPI e
// indexa por chave de especie. Ele NAO importa nada de `src/`, entao nada no
// build liga as duas pontas: uma matriz indexada por `mr_mime` contra um
// catalogo indexado por `mr__mime` compila, passa no `tsc`, sobe pra producao,
// e o unico efeito e que o Mr. Mime nunca aprende Maquina nenhuma. Ninguem
// olha, e nao ha erro pra olhar.
//
// Foi exatamente pra isso que `chaveDeEspecie` subiu pra `lib/pokeapi.js` em
// vez de ser duplicada no gerador. Este teste e a outra metade: a lib garante
// que os dois geradores usem a MESMA funcao, e isto aqui garante que a saida
// dela case com o catalogo que o jogo carrega de verdade.
//
// POR QUE A CONTAGEM DE GOLPES AUSENTES E UMA GUARDA, E NAO ESTATISTICA
// -----------------------------------------------------------------------------
// 17 golpes de Maquina nao existem em `abilities.generated.ts`. Enquanto for
// assim, a Maquina que os ensina nao pode ser fabricada — ela ensinaria um id
// que `getAbility` devolve `null`. A lista fica CONGELADA aqui: implementar um
// desses golpes tem que ser um ato deliberado que mexe neste arquivo, e nao um
// efeito colateral silencioso de um resync do catalogo.
import { describe, it, expect } from 'vitest'
import MAQUINAS from '../../scripts/usum/maquinas.json'
import { SPECIES_DATA } from './generated/pokes.generated'
import { ABILITIES_DATA } from './generated/abilities.generated'

/**
 * Os golpes de Maquina que o motor ainda NAO sabe executar.
 *
 * `surf` aparece nas duas listas (TM94 no Ultra Sun e HM3 na Gen III), entao
 * sao 17 golpes distintos e nao 18. Cada um destes bloqueia a Maquina que o
 * ensina ate alguem implementar o efeito.
 */
const GOLPES_QUE_O_MOTOR_NAO_TEM = [
  'aurora_veil', 'brutal_swing', 'confide', 'cut', 'dazzling_gleam', 'facade',
  'focus_blast', 'frustration', 'grass_knot', 'overheat', 'return', 'rock_smash',
  'scald', 'smart_strike', 'surf', 'trick_room', 'volt_switch',
].sort()

describe('o dado das Maquinas casa com o catalogo do jogo (PH-512)', () => {
  it('a fonte tem as 100 TMs e as 9 HMs', () => {
    expect(MAQUINAS.tms).toHaveLength(100)
    expect(MAQUINAS.hms).toHaveLength(9)
    // Numeracao densa e sem buraco nos dois lados: um `undefined` no meio
    // viraria uma Maquina sem golpe la na frente.
    expect(MAQUINAS.tms.map((t) => t.numero)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1))
    expect(MAQUINAS.hms.map((h) => h.numero)).toEqual(Array.from({ length: 9 }, (_, i) => i + 1))
  })

  it('cada Maquina ensina um golpe distinto — numero repetido seria duas fontes do mesmo poder', () => {
    const golpesTm = MAQUINAS.tms.map((t) => t.golpe)
    expect(new Set(golpesTm).size).toBe(golpesTm.length)
    const golpesHm = MAQUINAS.hms.map((h) => h.golpe)
    expect(new Set(golpesHm).size).toBe(golpesHm.length)
  })

  it('a matriz so tem, alem do elenco do cliente, as 6 especies que o bundle corta de proposito', () => {
    // A guarda principal, e o limite dela nao e "matriz == jogo".
    //
    // `docs/02-dados-e-catalogo.md`: o catalogo e o BANCO tem 386 especies; o
    // bundle do CLIENTE recebe 380, porque `syncSpeciesAndMoves` so emite as
    // alcancaveis (starter, lendaria, quem aparece em hunt, e a cadeia de
    // evolucao completa dessas). As 6 abaixo nao aparecem em hunt nenhuma nem
    // sao destino de evolucao de quem aparece.
    //
    // A matriz de Maquinas fica com as 386 de proposito: quem valida o ensino
    // e a RPC, contra o BANCO. Cortar pra 380 aqui deixaria a tabela do
    // servidor sem essas linhas, e a diferenca so apareceria no dia em que uma
    // delas virasse alcancavel.
    //
    // Congeladas, e nao filtradas: uma SETIMA especie sumindo do bundle e um
    // fato sobre o elenco do jogo que alguem precisa ver.
    const FORA_DO_BUNDLE_DE_PROPOSITO = ['blissey', 'chansey', 'mr__mime', 'ninetales', 'shuckle', 'vulpix']
    const soNaMatriz = Object.keys(MAQUINAS.especies).filter((chave) => !(chave in SPECIES_DATA)).sort()
    expect(soNaMatriz).toEqual(FORA_DO_BUNDLE_DE_PROPOSITO)
  })

  it('TODA especie do jogo aparece na matriz, mesmo as que nao aprendem nada', () => {
    // O outro sentido, e ele importa igual: uma especie ausente da matriz e
    // indistinguivel de uma especie com zero Maquinas na hora de consultar,
    // mas significa "o gerador nao a viu" — que e bug, nao dado.
    const ausentes = Object.keys(SPECIES_DATA).filter((chave) => !(chave in MAQUINAS.especies))
    expect(ausentes, `especies do jogo fora da matriz: ${ausentes.join(', ')}`).toEqual([])
  })

  it('todo numero citado por uma especie existe na lista de Maquinas', () => {
    const numerosTm = new Set(MAQUINAS.tms.map((t) => t.numero))
    const numerosHm = new Set(MAQUINAS.hms.map((h) => h.numero))
    const quebrados: string[] = []
    for (const [chave, entrada] of Object.entries(MAQUINAS.especies)) {
      for (const n of entrada.tm) if (!numerosTm.has(n)) quebrados.push(`${chave} -> TM${n}`)
      for (const n of entrada.hm) if (!numerosHm.has(n)) quebrados.push(`${chave} -> HM${n}`)
    }
    expect(quebrados).toEqual([])
  })

  it('a lista de golpes que o motor nao tem esta congelada — implementar um e ato deliberado', () => {
    const todos = [...MAQUINAS.tms.map((t) => t.golpe), ...MAQUINAS.hms.map((h) => h.golpe)]
    const ausentes = [...new Set(todos.filter((g) => !(g in ABILITIES_DATA)))].sort()
    expect(ausentes).toEqual(GOLPES_QUE_O_MOTOR_NAO_TEM)
  })

  it('a matriz nao esta vazia — a assercao acima passaria com zero pares', () => {
    // Sem isto, um gerador que escrevesse `especies: {}` deixaria as guardas de
    // orfas e de numeros quebrados verdes, porque nao ha o que conferir.
    const pares = Object.values(MAQUINAS.especies).reduce((s, e) => s + e.tm.length + e.hm.length, 0)
    expect(pares).toBeGreaterThan(10_000)
  })
})
