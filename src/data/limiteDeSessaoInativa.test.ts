// PH-277 — o limite de sessao abandonada existe DUAS vezes, e as duas tem que
// dizer o mesmo numero.
//
// Ele precisa existir dos dois lados porque os dois caminhos alcancam gente
// diferente:
//
//   TypeScript  `SESSAO_INATIVA_SEGUNDOS` (authority/src/appSessao.ts) fecha a
//               sessao de quem VOLTA, no proprio request.
//   SQL         `fechar_sessoes_inativas()` (migration 20260830010000) fecha a
//               de quem NUNCA volta, de hora em hora pelo pg_cron.
//
// Separar os dois nao quebra nada visivelmente: o jogo continua funcionando com
// o cliente expulsando em 30 minutos e o cron em 2 horas, e ninguem descobre até
// alguem tentar explicar por que a mesma sessao e tratada de dois jeitos. E o
// mesmo tipo de gemeo que `SPECIAL_EVOLUTION_STONE_COUNT` ja tem no servidor, e
// que ja custou uma tela dizendo "faltam N" com o servidor exigindo outro N.
//
// `?raw` via `import.meta.glob`: `src/` nao tem os types de node — mesmo padrao
// de src/data/carimboDeMigration.test.ts e vizinhos.
import { describe, expect, it } from 'vitest'
import fonteDoAppSessao from '/authority/src/appSessao.ts?raw'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * O valor de `SESSAO_INATIVA_SEGUNDOS`, lido do FONTE de authority.
 *
 * `?raw`, e nao `import { SESSAO_INATIVA_SEGUNDOS }`: importar de verdade puxa
 * `authority/src` pra dentro do projeto de `src/`, e os dois tem tsconfig
 * diferente — o `tsc -b` da raiz passa a compilar authority e reprova em
 * `erasableSyntaxOnly` no primeiro parametro-propriedade que encontrar (medido:
 * `db.ts:26`). Ler o texto compara exatamente o que se quer comparar — dois
 * numeros escritos a mao em arquivos diferentes — sem costurar os dois projetos.
 */
function limiteNoTypeScript(): number {
  const m = /SESSAO_INATIVA_SEGUNDOS\s*=\s*([\d\s*]+)/.exec(fonteDoAppSessao)
  expect(m, 'nao achei SESSAO_INATIVA_SEGUNDOS em authority/src/appSessao.ts').toBeTruthy()
  // A expressao e literal (`30 * 60`): so digitos, espaco e `*`, entao o produto
  // sai sem avaliar nada arbitrario.
  return m![1].split('*').map((x) => Number(x.trim())).reduce((a, b) => a * b, 1)
}

const PAR = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('fecha_sessao_abandonada'))
  .sort(([a], [b]) => a.localeCompare(b))

/** Segundos do `interval '...'` que a funcao usa como default. */
function limiteNoSql(sql: string): number {
  const m = /p_limite\s+interval\s+default\s+interval\s+'(\d+)\s+(minutes?|hours?|seconds?)'/i.exec(sql)
  expect(m, 'nao achei o default de `p_limite` na funcao').toBeTruthy()
  const n = Number(m![1])
  const unidade = m![2].toLowerCase()
  if (unidade.startsWith('hour')) return n * 3600
  if (unidade.startsWith('minute')) return n * 60
  return n
}

describe('limite de sessao inativa (PH-277)', () => {
  it('o limite do TypeScript foi lido, e e 30 minutos', () => {
    expect(limiteNoTypeScript()).toBe(30 * 60)
  })

  it('o par de migrations existe', () => {
    // Sem isto, apagar as migrations deixaria os casos abaixo passando no vazio.
    expect(PAR.map(([n]) => n.replace(/.*\//, ''))).toEqual([
      '20260830010000_fecha_sessao_abandonada_public.sql',
      '20260830010001_fecha_sessao_abandonada_dev.sql',
    ])
  })

  it.each(PAR)('%s usa o MESMO limite que o TypeScript', (nome, sql) => {
    expect(
      limiteNoSql(sql),
      `${nome}: o SQL fecha por um limite e o servidor por outro. Os dois caminhos `
      + 'tratam a MESMA sessao — um deles vai parecer arbitrario pra quem investigar.',
    ).toBe(limiteNoTypeScript())
  })

  it.each(PAR)('%s nao credita nada: so fecha e limpa o mapa', (nome, sql) => {
    // O criterio 2 da issue. Um `insert`/`update` de ouro, xp ou
    // `simulated_seconds` aqui pagaria o intervalo que ninguem simulou — e e
    // justamente o que este fechamento existe pra NAO fazer.
    expect(sql, `${nome}: mexeu em coluna de credito`).not.toMatch(/\b(gold|trainer_exp|simulated_seconds)\s*=/i)
  })

  it.each(PAR)('%s limpa current_map_id junto', (nome, sql) => {
    // Criterio 3: coluna apontando pra mapa sem sessao poe o jogador numa
    // cacada que nao credita nada — o mesmo cuidado de `sairDaHunt`.
    expect(sql, `${nome}: fechou a sessao e deixou o jogador dentro da hunt`)
      .toMatch(/set\s+current_map_id\s*=\s*null/i)
  })

  it.each(PAR)('%s so alcanca sessao ABERTA', (nome, sql) => {
    // Sem `closed_at is null` no filtro, o UPDATE reescreveria `closed_at` de
    // sessoes ja fechadas ha meses — barulho de escrita e `updated_at` mentindo.
    expect(sql, `${nome}: o UPDATE nao se restringe a sessao aberta`)
      .toMatch(/where\s+closed_at\s+is\s+null[\s\S]*last_flush_at\s*<\s*now\(\)\s*-\s*p_limite/i)
  })

  it('as duas migrations agendam jobs de NOME diferente', () => {
    // `cron.schedule` com o mesmo nome nos dois schemas: o segundo sobrescreve o
    // primeiro em silencio e um dos ambientes para de fechar sessao.
    const nomes = PAR.map(([, sql]) => /cron\.schedule\(\s*'([^']+)'/.exec(sql)?.[1])
    expect(nomes[0]).toBeTruthy()
    expect(nomes[0]).not.toBe(nomes[1])
  })

  it('as duas rodam em minutos diferentes dos purges que ja existem', () => {
    // pg_cron neste projeto compete por janela de conexao — os purges ja moram
    // em 11, 17, 23 (public) e 41, 47, 53 (dev).
    const minutos = PAR.map(([, sql]) => Number(/cron\.schedule\([^)]*?'(\d+) \* \* \* \*'/.exec(sql)?.[1]))
    for (const m of minutos) expect([11, 17, 23, 41, 47, 53]).not.toContain(m)
    expect(new Set(minutos).size, 'os dois jobs caem no mesmo minuto').toBe(2)
  })

  it('a migration faz o backfill chamando a PROPRIA funcao', () => {
    // Criterio 5. Um backfill escrito a mao seria uma segunda regra, livre pra
    // divergir da primeira — e a idempotencia sai de graca chamando a funcao (a
    // segunda chamada nao acha `closed_at is null` e devolve 0).
    for (const [nome, sql] of PAR) {
      expect(sql, `${nome}: sem backfill das linhas abertas hoje`)
        .toMatch(/select\s+(public|dev)\.fechar_sessoes_inativas\(\);/i)
    }
  })
})
