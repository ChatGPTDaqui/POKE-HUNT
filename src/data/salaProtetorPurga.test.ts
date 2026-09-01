// PH-334 — a limpeza de `sala_protetor` e POR IDADE, e nao no fechamento da
// sessao. Este arquivo existe pra travar o motivo, que nao e obvio e ja foi
// escrito errado uma vez (na propria issue).
//
// A issue pedia um trigger em `closed_at`, com a justificativa de que "linha de
// sessao fechada nunca e lida". Ela E lida: `salaHerdada`
// (authority/src/appSessao.ts) busca a ultima sessao do jogador NAQUELE mapa com
// `select=*,sala_protetor(*)` e SEM filtro de `closed_at`, justamente pra o
// protetor pendente atravessar a reentrada (PH-266). Dar F5 no meio da luta
// contra um Guardian fecha a sessao e abre outra; se o fechamento apagasse a
// linha, o F5 viraria um jeito de se livrar do bicho.
//
// Por isso a limpeza espera a janela de heranca passar. Os dois numeros sao
// gemeos e precisam continuar concordando — o do SQL tem que ser MAIOR que o do
// TypeScript, ou o purge come a linha que a reentrada ainda ia ler.
//
// `?raw` via `import.meta.glob`: `src/` nao tem os types de node — mesmo padrao
// de src/data/limiteDeSessaoInativa.test.ts e vizinhos.
import { describe, expect, it } from 'vitest'
import fonteDoAppSessao from '/authority/src/appSessao.ts?raw'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const PAR = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('sala_protetor_purga'))
  .sort(([a], [b]) => a.localeCompare(b))

/** A janela de heranca de sala, em segundos, lida do FONTE de authority. */
function janelaDeHerancaEmSegundos(): number {
  const m = /JANELA_DE_HERANCA_DE_SALA_MS\s*=\s*([\d\s*]+)/.exec(fonteDoAppSessao)
  expect(m, 'nao achei JANELA_DE_HERANCA_DE_SALA_MS em authority/src/appSessao.ts').toBeTruthy()
  // A expressao e literal (`5 * 60 * 1000`): so digitos, espaco e `*`, entao o
  // produto sai sem avaliar nada arbitrario.
  const ms = m![1].split('*').map((x) => Number(x.trim())).reduce((a, b) => a * b, 1)
  return ms / 1000
}

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

describe('purga de sala_protetor (PH-334)', () => {
  it('a janela de heranca do TypeScript foi lida, e e 5 minutos', () => {
    expect(janelaDeHerancaEmSegundos()).toBe(5 * 60)
  })

  it('o par de migrations existe', () => {
    // Sem isto, apagar as migrations deixaria os casos abaixo passando no vazio.
    expect(PAR.map(([n]) => n.replace(/.*\//, ''))).toEqual([
      '20260901100000_sala_protetor_purga_public.sql',
      '20260901100001_sala_protetor_purga_dev.sql',
    ])
  })

  it.each(PAR)('%s espera MAIS que a janela de heranca de sala', (nome, sql) => {
    expect(
      limiteNoSql(sql),
      `${nome}: o purge apaga a linha antes de a reentrada (PH-266) poder le-la. `
      + 'Dar F5 no meio da luta contra um Guardian passaria a APAGAR o protetor.',
    ).toBeGreaterThan(janelaDeHerancaEmSegundos())
  })

  it.each(PAR)('%s so alcanca linha de sessao fechada HA MAIS que o limite', (nome, sql) => {
    // O filtro e positivo de proposito: o delete precisa provar que existe uma
    // sessao viva pra poupar a linha, em vez de provar que existe uma morta pra
    // apaga-la. Um caminho novo que grave `closed_at` de um jeito inesperado
    // erra pro lado seguro.
    expect(sql, `${nome}: o delete nao se restringe a sessao fechada e velha`)
      .toMatch(/not\s+exists[\s\S]{0,400}closed_at\s+is\s+null\s+or\s+gs\.closed_at\s*>\s*now\(\)\s*-\s*p_limite/i)
  })

  it.each(PAR)('%s nao tem delete sem where em sala_protetor', (nome, sql) => {
    expect(sql, `${nome}: delete solto apagaria protetor de sessao viva`)
      .not.toMatch(/delete\s+from\s+\w+\.sala_protetor\s*(sp\s*)?;/i)
  })

  it.each(PAR)('%s faz o backfill chamando a PROPRIA funcao', (nome, sql) => {
    // A idempotencia sai de graca: a segunda chamada nao acha linha fora do
    // limite e devolve 0. Um backfill escrito a mao seria uma segunda regra,
    // livre pra divergir da primeira.
    expect(sql, `${nome}: sem backfill das orfas que ja existem`)
      .toMatch(/select\s+(public|dev)\.purgar_sala_protetor\(\);/i)
  })

  it.each(PAR)('%s revoga o execute das tres roles', (nome, sql) => {
    // `revoke ... from public` sozinho NAO alcanca o grant nomeado que
    // `alter default privileges` da a anon/authenticated neste projeto.
    expect(sql, `${nome}: qualquer jogador autenticado poderia rodar o purge`)
      .toMatch(/revoke\s+execute\s+on\s+function\s+\w+\.purgar_sala_protetor\(interval\)\s+from\s+public,\s*anon,\s*authenticated/i)
  })

  it('cada migration mexe SO no proprio schema', () => {
    const [[, pub], [, dev]] = PAR
    expect(pub).not.toMatch(/\bdev\.(sala_protetor|game_sessions|purgar_sala_protetor)\b/)
    expect(dev).not.toMatch(/\bpublic\.(sala_protetor|game_sessions|purgar_sala_protetor)\b/)
  })

  it('as duas migrations agendam jobs de NOME diferente', () => {
    // `cron.schedule` com o mesmo nome nos dois schemas: o segundo sobrescreve o
    // primeiro em silencio e um dos ambientes para de purgar.
    const nomes = PAR.map(([, sql]) => /cron\.schedule\(\s*'([^']+)'/.exec(sql)?.[1])
    expect(nomes[0]).toBeTruthy()
    expect(nomes[0]).not.toBe(nomes[1])
  })

  it('as duas rodam em minutos diferentes dos purges que ja existem', () => {
    // pg_cron neste projeto compete por janela de conexao — os purges de hora em
    // hora ja moram em 11, 17, 23, 29 (public) e 41, 47, 53, 59 (dev).
    const minutos = PAR.map(([, sql]) => Number(/cron\.schedule\([^)]*?'(\d+) \* \* \* \*'/.exec(sql)?.[1]))
    for (const m of minutos) expect([11, 17, 23, 29, 41, 47, 53, 59]).not.toContain(m)
    expect(new Set(minutos).size, 'os dois jobs caem no mesmo minuto').toBe(2)
  })

  it('nenhuma migration apaga o protetor no fechamento da sessao', () => {
    // A regressao que este arquivo inteiro existe pra impedir: um trigger
    // `after update of closed_at` que apague `sala_protetor` reintroduz o F5
    // que some com o Guardian.
    for (const [nome, sql] of Object.entries(MIGRATIONS)) {
      if (!/update\s+of\s+closed_at/i.test(sql)) continue
      expect(sql, `${nome}: trigger de closed_at mexendo em sala_protetor — ver PH-266`)
        .not.toMatch(/sala_protetor/i)
    }
  })
})
