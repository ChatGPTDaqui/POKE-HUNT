// PH-290 — o gate de migration orfa reprova NOMEANDO a causa quando o CLI
// responde qualquer coisa que nao seja `{ migrations: [...] }`.
//
// O QUE ACONTECEU
// -----------------------------------------------------------------------------
// Em 30/08, no `Supabase check` do push em `dev` (run 33307943123):
//
//     Initialising login role...
//     Connecting to remote database...
//     jq: error (at <stdin>:1): Cannot iterate over null (null)
//     ##[error]Process completed with exit code 5.
//
// O CLI saiu com 0 e imprimiu JSON valido SEM a chave `migrations`. A guarda que
// existia so cobria saida VAZIA, entao o `jq` da linha seguinte iterou sobre
// null e matou o step. Era flake — `gh run rerun --failed` no MESMO commit
// passou, sem nenhuma mudanca de codigo.
//
// O CUSTO NAO E O FLAKE, E A MENSAGEM. Quem abrisse aquele log leria um erro de
// `jq` e iria procurar bug de sintaxe no gate; a causa estava a duas linhas
// acima, no CLI. E a mesma familia do flake que o proprio step ja documenta
// ("'migration list --linked' flanca a conexao ocasionalmente").
//
// POR QUE ESTE TESTE E EM JS, e nao um `jq` de verdade
// -----------------------------------------------------------------------------
// O runner tem `jq`; a maquina de desenvolvimento nao (conferido: `which jq` nao
// acha nada no Git Bash deste projeto). Um teste que so rodasse no CI nao seria
// executado por quem esta editando o gate — que e exatamente a hora em que ele
// precisa falar.
//
// Entao o teste faz duas coisas separadas:
//
//   1. le o FONTE do workflow e confere que o predicado esta la, escrito do
//      jeito que se espera (e que o `-e` nao sumiu — sem ele o `jq` sai 0 e a
//      guarda vira decoracao);
//   2. reimplementa o MESMO predicado em JS e roda contra as formas de resposta
//      que ja apareceram ou podem aparecer.
//
// A parte (2) nao prova que o `jq` do runner concorda — nada aqui prova isso.
// Ela prova que a REGRA esta certa, e a (1) prova que a regra escrita no gate e
// esta. As duas juntas pegam o erro que importa: alguem afrouxar a condicao.
import { describe, expect, it } from 'vitest'

import fonteDoCheck from '/.github/workflows/supabase-check.yml?raw'

/**
 * `has("migrations") and (.migrations | type == "array")`, em JS.
 *
 * `and` do jq e curto-circuito, entao a segunda metade nunca roda sem a chave —
 * o mesmo que o `&&` daqui faz.
 */
function respostaUtil(bruto: string): boolean {
  let valor: unknown
  try {
    valor = JSON.parse(bruto)
  } catch {
    // Saida nao-JSON: no gate o proprio `jq` sai !=0 e cai no mesmo `if`.
    return false
  }
  // `has(...)` no jq exige objeto — em array ou escalar ele ERRA, e o erro
  // tambem e exit !=0. Aqui isso vira `false`, que leva ao mesmo lugar.
  if (typeof valor !== 'object' || valor == null || Array.isArray(valor)) return false
  if (!('migrations' in valor)) return false
  return Array.isArray((valor as { migrations: unknown }).migrations)
}

describe('o predicado do gate aceita so a resposta que ele sabe ler (PH-290)', () => {
  it('a resposta normal passa', () => {
    expect(respostaUtil('{"migrations":[{"local":"20260830010000","remote":"20260830010000"}]}')).toBe(true)
  })

  it('lista vazia passa — banco sem migration nao e erro de formato', () => {
    // Este caso importa: tratar `[]` como falha reprovaria um projeto novo, e o
    // gate diria "CLI instavel" pra um estado perfeitamente normal.
    expect(respostaUtil('{"migrations":[]}')).toBe(true)
  })

  it('JSON valido SEM a chave reprova — o caso de 30/08', () => {
    expect(respostaUtil('{"erro":"connection refused"}')).toBe(false)
  })

  it('`migrations` nula reprova — era ela que fazia o jq iterar sobre null', () => {
    expect(respostaUtil('{"migrations":null}')).toBe(false)
  })

  it('`migrations` como objeto reprova', () => {
    expect(respostaUtil('{"migrations":{"20260830":"x"}}')).toBe(false)
  })

  it('array no topo reprova', () => {
    expect(respostaUtil('[{"local":"1"}]')).toBe(false)
  })

  it('saida que nem e JSON reprova', () => {
    expect(respostaUtil('Connecting to remote database...')).toBe(false)
  })
})

describe('o gate escrito no workflow e esse mesmo (PH-290)', () => {
  it('o fonte do workflow foi lido', () => {
    // Guarda anti-vacuo: com o import quebrado os casos abaixo passariam
    // medindo string vazia.
    expect(fonteDoCheck.length).toBeGreaterThan(2000)
    expect(fonteDoCheck).toContain('migration list --linked')
  })

  it('o predicado esta no gate, com o `-e`', () => {
    // Sem `-e` o `jq` sai 0 mesmo com o teste dando falso, e o `if !` nunca
    // dispara — a guarda existiria sem guardar nada.
    expect(fonteDoCheck).toContain(
      `jq -e 'has("migrations") and (.migrations | type == "array")'`,
    )
  })

  it('a mensagem nomeia a causa e nao se confunde com o gate reprovando', () => {
    const linha = fonteDoCheck.split('\n').find((l) => l.includes("respondeu sem '.migrations'"))
    expect(linha).toBeTruthy()
    // "NAO e o gate reprovando" e a parte que evita a caca ao bug errado.
    expect(linha).toContain('NAO e o gate de migration orfa')
  })

  it('a saida crua vai pro log, limitada', () => {
    // Sem a saida crua, "formato mudou" nao da pra investigar; sem o limite, um
    // erro de conexao despeja a lista inteira de migrations no log.
    expect(fonteDoCheck).toContain('head -c 2000')
  })

  it('a guarda de saida VAZIA continua existindo, antes desta', () => {
    // As duas cobrem falhas diferentes do CLI e nenhuma substitui a outra.
    expect(fonteDoCheck).toContain('falhou em todas as tentativas')
    expect(fonteDoCheck.indexOf('falhou em todas as tentativas'))
      .toBeLessThan(fonteDoCheck.indexOf("respondeu sem '.migrations'"))
  })
})
