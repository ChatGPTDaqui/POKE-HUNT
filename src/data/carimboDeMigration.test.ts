// PH-249 — nenhum par de migrations pode compartilhar carimbo.
//
// O CLI do Supabase usa o prefixo numerico do nome do arquivo como CHAVE
// PRIMARIA de `supabase_migrations.schema_migrations`. Dois arquivos com o
// mesmo prefixo sao a mesma versao pra ele: o `db push` aplica o SQL dos dois,
// registra a versao uma vez e estoura
//
//   ERROR: duplicate key value violates unique constraint "schema_migrations_pkey"
//   Key (version)=(20260828140000) already exists.
//
// na segunda. E o modo de falha mais caro que uma migration tem, porque ele
// nao para na PR que introduziu o problema: a partir dali TODO `db push`
// reprova — deploy de dev, deploy de main e a PR de promocao junto —, e o
// custo cai em quem nao fez a mudanca. Aconteceu em 28/08 com o par de PH-245,
// e o banco ficou num estado em que o SQL tinha rodado mas a versao nao
// constava, entao o CLI tentava reaplicar pra sempre.
//
// A convencao do repo e `_public` = N, `_dev` = N+1: o ULTIMO digito do
// carimbo separa o par. Este arquivo trava as duas metades disso.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const NOMES = Object.keys(MIGRATIONS).map((c) => c.split('/').pop()!).sort()

describe('a varredura enxergou as migrations', () => {
  it('o glob casou com o diretorio de verdade', () => {
    // Guarda anti-vacuo: com o glob quebrado, todo teste abaixo passa medindo
    // o nada — que e exatamente o que nao pode acontecer num arquivo-guarda.
    expect(NOMES.length).toBeGreaterThan(50)
    expect(NOMES.every((n) => /^\d{14}_/.test(n)), `nome fora do padrao: ${NOMES.find((n) => !/^\d{14}_/.test(n))}`).toBe(true)
  })
})

describe('carimbo de migration (PH-249)', () => {
  it('nenhum carimbo aparece em dois arquivos', () => {
    const porCarimbo = new Map<string, string[]>()
    for (const nome of NOMES) {
      const carimbo = nome.slice(0, 14)
      porCarimbo.set(carimbo, [...(porCarimbo.get(carimbo) ?? []), nome])
    }
    const repetidos = [...porCarimbo.entries()]
      .filter(([, arquivos]) => arquivos.length > 1)
      .map(([carimbo, arquivos]) => `${carimbo}: ${arquivos.join(' + ')}`)

    expect(
      repetidos,
      'dois arquivos com o mesmo carimbo sao a MESMA versao pro CLI do Supabase. '
      + 'O `db push` vai estourar duplicate key em schema_migrations e travar todo deploy '
      + 'seguinte, de dev e de main. Renomeie um dos dois — o ultimo digito separa o par.',
    ).toEqual([])
  })

  // NAO ha aqui um "todo _public tem gemeo _dev". Foi tentado e acusa
  // migrations antigas legitimas (ex.: `20260823000001_retencao_de_audit_logs_dev`,
  // que so faz sentido num schema). Quem cobre par faltando e o passo
  // "Par dev/public" de `supabase-check.yml`, que olha so o que a PR
  // introduziu — a regra certa depende do diff, e nao do diretorio inteiro.
})
