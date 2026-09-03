// PH-475: a ROTA repassa o que o motor resolveu.
//
// O MODO DE FALHA QUE ISTO PEGA JA ACONTECEU NESTE PROJETO, duas vezes, e ele
// e invisivel. `aplicarFlush` resolve um campo (`clima` na PH-140, `protetor`
// aqui), o objeto que a rota monta com `json({...})` **nao o inclui**, e:
//
//  - `tsc` nao reclama, porque o literal passado pro `json()` nao tem tipo
//    declarado — nada exige que ele cubra `ResultadoFlush`;
//  - o cliente le "campo ausente", que por contrato significa "servidor mais
//    velho que este cliente, mantenha o que voce tem" — ou seja, o caminho de
//    compatibilidade engole o defeito;
//  - a suite inteira passa, porque todo teste de motor chama `aplicarFlush`
//    direto e nunca a rota.
//
// O sintoma da PH-140 foi o jogador ficar sem clima pelo resto da hunt depois
// da primeira troca de sala. O sintoma daqui seria o cliente voltando a
// sortear o proprio chefe depois de 120s de "silencio" — exatamente o bug que
// a PH-475 existe pra fechar, de volta e sem rastro.
//
// LE O FONTE, e nao chama a rota, porque chamar exigiria mockar `db.js`, auth e
// o Postgres inteiro pra conferir a presenca de tres chaves num objeto. O que
// importa aqui e estrutural: o campo esta escrito na resposta ou nao esta.
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const FONTE = readFileSync(new URL('./appSessao.ts', import.meta.url), 'utf8')

/**
 * Os campos que a resposta de flush TEM que carregar, e o que cada um custa se
 * faltar. Todos sao decididos por `aplicarFlush` e nenhum e derivavel pelo
 * cliente — e por isso que a ausencia deles nao da erro, so mente.
 */
const OBRIGATORIOS = [
  ['sala', 'o cliente exibiria a sala que ele mesmo sorteou como predicao'],
  ['clima', 'o jogador levaria dano de areia sob um ceu limpo (PH-140)'],
  ['protetor', 'o cliente voltaria a sortear o proprio chefe (PH-475)'],
] as const

/** Corpo do `json({...})` da funcao nomeada. */
function respostaDaRota(nome: string): string {
  const inicio = FONTE.indexOf(`async function ${nome}(`)
  expect(inicio, `a funcao ${nome} nao existe mais em appSessao.ts`).toBeGreaterThan(-1)
  const doJson = FONTE.indexOf('return json({', inicio)
  expect(doJson, `${nome} nao devolve json({...})`).toBeGreaterThan(-1)
  // Ate o fim da funcao. `indexOf('\n}')` acha o fechamento no nivel zero
  // porque este arquivo indenta com dois espacos — nenhum `}` interno comeca
  // coluna zero.
  const fim = FONTE.indexOf('\n}', doJson)
  return FONTE.slice(doJson, fim)
}

describe('a rota de sessao repassa o que aplicarFlush resolveu (PH-475)', () => {
  it('a varredura achou o fonte de verdade', () => {
    // Guarda anti-vacuo: com o caminho errado, `FONTE` seria '' e todo caso
    // abaixo passaria procurando substring em nada. Ja aconteceu neste repo
    // (ver a guarda equivalente em fundoDoBioma.test.ts).
    expect(FONTE.length).toBeGreaterThan(1000)
    expect(FONTE).toContain('async function flush(')
  })

  for (const rota of ['flush', 'avancarSala'] as const) {
    for (const [campo, custo] of OBRIGATORIOS) {
      it(`${rota} devolve \`${campo}\``, () => {
        expect(respostaDaRota(rota), `sem \`${campo}\`: ${custo}`)
          .toContain(`${campo}: resultado.${campo}`)
      })
    }
  }

  it('o tipo do motor declara os tres campos — a rota nao inventa nenhum', () => {
    // O outro lado da regra: um campo repassado que `ResultadoFlush` nao tem
    // seria `undefined` na resposta, e o cliente o leria como "servidor
    // velho" — a mesma falha silenciosa, so pela ponta oposta.
    const doMotor = readFileSync(new URL('./progresso.ts', import.meta.url), 'utf8')
    const inicio = doMotor.indexOf('export interface ResultadoFlush {')
    expect(inicio).toBeGreaterThan(-1)
    const corpo = doMotor.slice(inicio, doMotor.indexOf('\n}', inicio))
    for (const [campo] of OBRIGATORIOS) {
      expect(corpo, `ResultadoFlush nao declara ${campo}`).toContain(`  ${campo}: `)
    }
  })
})
