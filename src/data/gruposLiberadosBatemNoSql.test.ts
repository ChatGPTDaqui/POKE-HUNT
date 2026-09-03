// A traducao de `unlocked_continents` existe DUAS VEZES, e nada obrigava as
// duas a concordarem (PH-447).
//
// Uma vive em TypeScript (`data/biomas.ts#traduzirGruposLiberados`) e roda a
// cada carga, nos dois caminhos (o `merge` do `persist` e o `playerMapper` do
// remoto). A outra vive em SQL (o par de migrations 20260902140000/140001) e
// roda uma vez, no backfill. As duas leem a mesma coluna legada e tem que
// produzir a MESMA lista.
//
// ESTE TESTE E FILHO DE UM INCIDENTE DE DIVERGENCIA, e nao de uma precaucao. A
// PH-434 renomeou `GRUPOS_INICIAIS` de ['faixa1','faixa2'] pra ['biomas'] no
// TypeScript e nao mexeu no banco. As duas metades passaram a discordar sobre
// o que "aberto" significa, e o gate de continente — que consulta a coluna —
// trancou o jogo inteiro: a Rota 46 inicial e o estagio 1 dos 12 biomas
// responderam "Derrote o Campeao Lance antes de acessar Mundo", com deploy
// verde e 2977 testes passando. O mesmo modo de falha que
// `traducaoDoProgressoBateNoSql.test.ts` guarda pro progresso de bioma, num
// campo que ninguem tinha guardado.
//
// Ele nao executa o SQL — tranca as LISTAS de que a traducao depende nos dois
// lados: quem entra sempre, quem e descartado, e o unico grupo legado que vira
// outra coisa em vez de sair. Concordar na formula nao basta; e a tabela que
// precisa ser a mesma.
import { describe, expect, it } from 'vitest'

import { GRUPOS_DO_LANCE, GRUPOS_INICIAIS, GRUPOS_LEGADOS, traduzirGruposLiberados } from './biomas'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const PAR = Object.entries(MIGRATIONS)
  .filter(([caminho]) => caminho.includes('grupos_liberados_biomas'))
  .map(([caminho, sql]) => [caminho.split('/').pop()!, sql] as const)
  .sort()

/** Os grupos que o SQL descarta, lidos da clausula `c not in (...)`. */
function descartadosNoSql(sql: string): string[] {
  const m = /where c not in \(([^)]*)\)/.exec(sql)
  if (!m) return []
  return [...m[1].matchAll(/'([^']+)'/g)].map((g) => g[1]).sort()
}

describe('a varredura achou o par de migration', () => {
  it('existem os DOIS arquivos, e nao um so', () => {
    // Guarda anti-vacuo (memoria do projeto: "zero medido pode ser fiacao da
    // bancada"). Com o glob quebrado ou o arquivo renomeado, todo teste abaixo
    // passaria medindo string vazia.
    expect(PAR.map(([nome]) => nome)).toEqual([
      '20260902140000_grupos_liberados_biomas_public.sql',
      '20260902140001_grupos_liberados_biomas_dev.sql',
    ])
  })

  it('cada metade mexe SO no proprio schema', () => {
    // Par apontando pro mesmo schema aplica duas vezes num lado, nenhuma no
    // outro, e nada estoura.
    for (const [nome, sql] of PAR) {
      const ehDev = nome.endsWith('_dev.sql')
      expect(sql.includes('dev.players'), nome).toBe(ehDev)
      expect(sql.includes('public.players'), nome).toBe(!ehDev)
    }
  })

  it('o par nao compartilha carimbo de tempo', () => {
    // Carimbo repetido faz o `db push` recusar o par inteiro.
    const carimbos = PAR.map(([nome]) => nome.slice(0, 14))
    expect(new Set(carimbos).size).toBe(2)
  })
})

describe('a tabela de traducao e a mesma nos dois lados', () => {
  it('o grupo que entra sempre no SQL e o GRUPOS_INICIAIS do TypeScript', () => {
    // Se alguem renomear `GRUPOS_INICIAIS` de novo sem tocar no SQL, este caso
    // reprova — que e exatamente o que faltou na PH-434.
    expect(GRUPOS_INICIAIS).toEqual(['biomas'])
    for (const [nome, sql] of PAR) {
      for (const grupo of GRUPOS_INICIAIS) {
        expect(sql.includes(`array['${grupo}']::text[]`), `${nome} tem que injetar '${grupo}'`).toBe(true)
      }
    }
  })

  it("o SQL traduz 'kanto' pro MESMO grupo que o TypeScript traduz", () => {
    // 'kanto' era o unico marcador da vitoria sobre o Lance no esquema mais
    // antigo. Descartar apagaria o premio; traduzir errado daria o premio
    // errado.
    expect(GRUPOS_DO_LANCE).toEqual(['nightmare'])
    const doTs = traduzirGruposLiberados(['kanto'])
    for (const grupo of GRUPOS_DO_LANCE) expect(doTs).toContain(grupo)
    for (const [nome, sql] of PAR) {
      expect(
        sql.includes(`case when c = 'kanto' then '${GRUPOS_DO_LANCE[0]}' else c end`),
        `${nome} tem que traduzir 'kanto' pra '${GRUPOS_DO_LANCE[0]}'`,
      ).toBe(true)
    }
  })

  it('o SQL descarta exatamente os legados que o TypeScript descarta', () => {
    // A lista do TypeScript e `GRUPOS_LEGADOS` menos 'kanto' (esse e
    // traduzido, nao descartado).
    const doTs = [...GRUPOS_LEGADOS].filter((g) => g !== 'kanto').sort()
    expect(doTs).toEqual(['faixa1', 'faixa2', 'faixa3', 'johto'])
    for (const [nome, sql] of PAR) {
      expect(descartadosNoSql(sql), nome).toEqual(doTs)
    }
  })

  it("'nightmare' NAO esta em nenhuma das duas listas de descarte", () => {
    // A invariante que o incidente de 2026-08-18 escreveu: o que o Lance
    // concede nao pode ser o que a carga descarta, senao o Pesadelo volta a
    // trancar sozinho a cada reload.
    for (const grupo of GRUPOS_DO_LANCE) {
      expect(GRUPOS_LEGADOS.has(grupo), `${grupo} e do Lance e nao pode ser legado`).toBe(false)
      for (const [nome, sql] of PAR) {
        expect(descartadosNoSql(sql), `${nome} nao pode descartar '${grupo}'`).not.toContain(grupo)
      }
    }
  })

  it('o filtro do UPDATE cobre todo grupo legado, senao a linha fica pela metade', () => {
    // O `where` decide QUEM e consertado. Um legado fora dele deixa a linha
    // com dado morto pra sempre — e, pior, sem 'biomas' se for o unico
    // problema dela.
    for (const [nome, sql] of PAR) {
      const filtro = /&& array\[([^\]]*)\]/.exec(sql)
      expect(filtro, `${nome} tem que ter o filtro de legados`).toBeTruthy()
      const noFiltro = [...filtro![1].matchAll(/'([^']+)'/g)].map((g) => g[1]).sort()
      expect(noFiltro).toEqual([...GRUPOS_LEGADOS].sort())
    }
  })
})
