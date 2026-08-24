// PH-104 — `record IS NOT NULL` nunca e verdade quando algum campo e nulo.
//
// POR QUE ESTE TESTE EXISTE
//
// O escrow do leilao (PH-101) nunca foi devolvido a quem era coberto. A causa
// nao foi lógica errada — foi uma sutileza do Postgres:
//
//   `record IS NULL`     -> verdadeiro so se TODOS os campos sao nulos
//   `record IS NOT NULL` -> verdadeiro so se TODOS os campos sao NAO-nulos
//
// Nao sao negacao um do outro. `if v_lider is not null then` com `resolved_at`
// nulo na oferta pendente e sempre falso, entao os dois blocos de devolucao
// eram codigo morto. Compila, passa em CI, revisa bem — e some com o dinheiro
// do jogador ate o encerramento do leilao.
//
// Um teste que so conferisse `dar_lance` nao serviria: o erro nao e daquela
// funcao, e do idioma. Este confere a PROPRIEDADE em toda funcao PL/pgSQL do
// projeto, presente e futura.
//
// Le o SQL em vez de chamar o banco pelo mesmo motivo de `advisoryLock.test.ts`
// e `anexoDeOuro.test.ts`: e propriedade do codigo que vai pro banco, e o CI
// nao tem credencial.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')

interface Funcao {
  chave: string
  corpo: string
  declaracoes: string
}

/** Corpo vigente de cada funcao (`<schema>.<nome>` -> corpo), ultima definicao ganha. */
function funcoesVigentes(): Map<string, Funcao> {
  const vigente = new Map<string, Funcao>()
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n')
    // Mesmo regex de advisoryLock.test.ts: `create` em minusculas e a convencao
    // do projeto, e `i` cobre quem escrever diferente.
    const re = /create\s+(?:or\s+replace\s+)?function\s+(public|dev)\.([a-z0-9_]+)\s*\(/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(sql)) !== null) {
      const daAbertura = sql.slice(m.index)
      const fim = daAbertura.indexOf('$$;')
      const corpo = fim === -1 ? daAbertura : daAbertura.slice(0, fim)
      // O bloco `declare` e onde o TIPO da variavel aparece. Sem ele nao da pra
      // distinguir `v_item_id uuid` (escalar, onde `is not null` esta certo) de
      // `v_lider dev.market_offers` (composto, onde nunca esta).
      const declare = corpo.search(/^\s*declare\s*$/im)
      const inicio = corpo.search(/^\s*begin\s*$/im)
      vigente.set(`${m[1].toLowerCase()}.${m[2].toLowerCase()}`, {
        chave: `${m[1].toLowerCase()}.${m[2].toLowerCase()}`,
        corpo,
        declaracoes: declare === -1 || inicio === -1 ? '' : corpo.slice(declare, inicio),
      })
    }
  }
  return vigente
}

/**
 * Variaveis de tipo COMPOSTO da funcao.
 *
 * Duas formas contam: `v_x <schema>.<tabela>` (row type de tabela, o caso do
 * PH-104) e `v_x record`. Escalar de qualquer tipo fica de fora — `is not null`
 * nele e correto e comum no projeto.
 */
function variaveisCompostas(declaracoes: string): string[] {
  const nomes: string[] = []
  const re = /^\s*(v_[a-z0-9_]+)\s+((?:public|dev)\.[a-z0-9_]+|record)\s*;/gim
  let m: RegExpExecArray | null
  while ((m = re.exec(declaracoes)) !== null) nomes.push(m[1].toLowerCase())
  return nomes
}

/** Usos de `<var> is not null` em que `<var>` e o registro inteiro, sem `.campo`. */
function usosProibidos(f: Funcao): string[] {
  const compostas = variaveisCompostas(f.declaracoes)
  if (!compostas.length) return []
  const corpoDepoisDoBegin = f.corpo.slice(Math.max(0, f.corpo.search(/^\s*begin\s*$/im)))
  // Tira comentario de linha: este arquivo e os cabecalhos das migrations
  // CITAM o idioma proibido pra explicar por que ele e proibido.
  const semComentario = corpoDepoisDoBegin.replace(/--[^\n]*/g, '')
  return compostas.filter((nome) => {
    const re = new RegExp(`\\b${nome}\\s+is\\s+not\\s+null\\b`, 'i')
    return re.test(semComentario)
  })
}

describe('record IS NOT NULL em PL/pgSQL (PH-104)', () => {
  const funcoes = [...funcoesVigentes().values()]

  it('encontra as funcoes e as variaveis compostas (guarda contra o parser vazio)', () => {
    // Sem isto, um regex quebrado faria os casos abaixo passarem por vacuidade —
    // o pior modo de falha possivel num teste de invariante.
    expect(funcoes.length).toBeGreaterThan(20)
    const comComposta = funcoes.filter((f) => variaveisCompostas(f.declaracoes).length > 0)
    expect(comComposta.length).toBeGreaterThan(5)
  })

  it('nenhuma funcao testa o registro inteiro com IS NOT NULL', () => {
    const infratoras = funcoes
      .flatMap((f) => usosProibidos(f).map((v) => `${f.chave}: ${v}`))
      .sort()
    expect(
      infratoras,
      'IS NOT NULL em valor composto e falso quando QUALQUER campo e nulo — use `v_x.id is not null` ou `if found`',
    ).toEqual([])
  })
})

describe('dar_lance devolve o escrow e nao vaza erro cru (PH-104)', () => {
  const funcoes = funcoesVigentes()

  for (const schema of ['public', 'dev'] as const) {
    const f = funcoes.get(`${schema}.dar_lance`)

    it(`${schema}.dar_lance existe`, () => {
      expect(f, `dar_lance nao encontrada em ${schema} — o resto deste describe seria vacuo`).toBeDefined()
    })

    it(`${schema}.dar_lance devolve o escrow do lider anterior e do proprio jogador`, () => {
      const corpo = f!.corpo.toLowerCase()
      // As duas devolucoes sao creditos em `players` a partir de uma oferta
      // guardada. Se alguem apagar um dos blocos, some o credito.
      expect(corpo).toContain(`gold = gold + v_lider.valor`)
      expect(corpo).toContain(`gold = gold + v_minha.valor`)
      // E os dois precisam estar sob uma guarda que de fato entra.
      expect(corpo).toContain('v_lider.id is not null')
      expect(corpo).toContain('v_minha.id is not null')
    })

    it(`${schema}.dar_lance traduz unique_violation em frase`, () => {
      // Sem isto o jogador recebe `23505 duplicate key value violates unique
      // constraint "market_offers_uma_pendente"`. Regra critica do projeto:
      // limite de negocio nao chega ao cliente como erro cru.
      expect(f!.corpo.toLowerCase()).toContain('exception when unique_violation')
    })
  }

  it('toda RPC que insere em market_offers trata unique_violation', () => {
    // `market_offers_uma_pendente` e um indice unico parcial, entao QUALQUER
    // insert ali pode bater nele. Generaliza o caso do PH-104 em vez de so
    // consertar a funcao onde ele apareceu.
    const semTratamento = [...funcoesVigentes().values()]
      .filter((f) => {
        const schema = f.chave.split('.')[0]
        return f.corpo.toLowerCase().includes(`insert into ${schema}.market_offers`)
      })
      .filter((f) => !/exception\s+when\s+unique_violation/i.test(f.corpo))
      .map((f) => f.chave)
      .sort()
    expect(semTratamento, 'insert em market_offers sem traduzir a violacao do indice unico').toEqual([])
  })
})
