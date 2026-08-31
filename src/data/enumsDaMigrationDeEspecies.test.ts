// PH-336 — todo literal de ENUM na migration de espécies novas existe no enum.
//
// ---------------------------------------------------------------------------
// POR QUE ESTE ARQUIVO EXISTE, e ele é a resposta a um deploy vermelho
// ---------------------------------------------------------------------------
// O deploy da PH-332 reprovou na PRIMEIRA instrução da primeira migration:
//
//     ERROR: invalid input value for enum move_category: "status" (SQLSTATE 22P02)
//
// `move_category` no banco é `physical, special`. O catálogo de Ultra Sun tem
// TRÊS categorias, e o gerador escrevia a terceira direto no enum. Nada foi
// aplicado (a migration roda em transação e reverteu), mas o erro só apareceu no
// CI, depois do merge — e o custo foi o deploy da `dev` vermelho.
//
// O que falhou não foi o SQL: foi a conferência. Eu vi que a coluna era
// `USER-DEFINED move_category` e ASSUMI que os três valores caberiam. Um
// `select enumlabel from pg_enum` teria custado dez segundos, antes de gerar 407
// literais.
//
// Este teste é essa conferência, de graça e em toda rodada. Ele NÃO fala com o
// Postgres (a suíte não tem banco): compara o SQL gerado contra os valores de
// enum declarados nas migrations que os CRIARAM — que é a única fonte local do
// contrato, e a que o `db push` também vai usar.
//
// A alternativa (esperar o deploy dizer) é o que acabou de acontecer.
import { describe, expect, it } from 'vitest'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * Os valores de cada enum, lidos dos `create type ... as enum (...)` de todas as
 * migrations, mais o que `alter type ... add value` acrescentou depois.
 *
 * Ler as DUAS formas importa: um enum que ganhou valor por `alter` teria os
 * valores novos invisíveis se só o `create` fosse lido, e o teste passaria a
 * reprovar SQL correto — que é a pior falha possível num guarda.
 */
function valoresDosEnums(): Map<string, Set<string>> {
  const porEnum = new Map<string, Set<string>>()
  const juntar = (nome: string, valores: string[]) => {
    const atual = porEnum.get(nome) ?? new Set<string>()
    for (const v of valores) atual.add(v)
    porEnum.set(nome, atual)
  }

  for (const sql of Object.values(MIGRATIONS)) {
    // `create type <nome> as enum ('a', 'b')` — com ou sem schema na frente.
    for (const m of sql.matchAll(/create\s+type\s+(?:\w+\.)?(\w+)\s+as\s+enum\s*\(([^)]*)\)/gi)) {
      juntar(m[1], [...m[2].matchAll(/'([^']*)'/g)].map((x) => x[1]))
    }
    // `alter type <nome> add value 'c'`
    for (const m of sql.matchAll(/alter\s+type\s+(?:\w+\.)?(\w+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'([^']*)'/gi)) {
      juntar(m[1], [m[2]])
    }
  }
  return porEnum
}

const ENUMS = valoresDosEnums()

const ALVOS = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('_especies_novas_'))
  .sort(([a], [b]) => a.localeCompare(b))

describe('a bancada lê alguma coisa (PH-336)', () => {
  it('os enums foram achados nas migrations', () => {
    // Sem isto, um regex quebrado deixaria todo o resto passando contra um Map
    // vazio — e o teste diria "nenhum literal inválido" sobre nada.
    expect(ENUMS.get('move_category'), 'move_category não foi achado').toEqual(
      new Set(['physical', 'special']),
    )
    expect(ENUMS.get('move_target')).toEqual(new Set(['single', 'aoe']))
    expect(ENUMS.get('element_type')?.size, 'element_type devia ter os 18 tipos').toBe(18)
  })

  it('o par de migrations de espécies novas existe', () => {
    expect(ALVOS.map(([n]) => n.replace(/.*_(public|dev)\.sql$/, '$1'))).toEqual(['public', 'dev'])
  })
})

describe.each(ALVOS)('%s — todo literal de enum é válido', (_nome, sql) => {
  it('nenhum `\'valor\'::<enum>` está fora do enum', () => {
    // Casa QUALQUER cast de literal para enum no arquivo, sem lista branca: o
    // ponto é pegar o enum que ninguém lembrou de conferir, e uma lista branca
    // só protege os que alguém já pensou.
    const invalidos: string[] = []
    for (const m of sql.matchAll(/'([^']*)'::(?:\w+\.)?(\w+)/g)) {
      const [, valor, tipo] = m
      const permitidos = ENUMS.get(tipo)
      if (!permitidos) continue // não é enum (`::text`, `::uuid`, `::int`)
      if (!permitidos.has(valor)) invalidos.push(`'${valor}'::${tipo}`)
    }
    const unicos = [...new Set(invalidos)]
    expect(
      unicos,
      `literal fora do enum: ${unicos.join(', ')}. Ver PH-336 — foi assim que o deploy da PH-332 caiu.`,
    ).toEqual([])
  })

  it('golpe de status entra como `physical`, a convenção das 537 linhas antigas', () => {
    // Guarda do lado positivo: só provar que `'status'` não aparece deixaria
    // passar um gerador que simplesmente PARASSE de emitir os golpes de status.
    // Aqui se cobra que eles estão lá, na categoria que o banco aceita.
    expect(sql).not.toContain("'status'::public.move_category")
    expect(sql).toContain("'physical'::public.move_category")
    for (const golpeDeStatus of ['acupressure', 'attract', 'rain_dance', 'swords_dance']) {
      expect(sql, `${golpeDeStatus} sumiu da migration`).toContain(`('${golpeDeStatus}',`)
    }
  })

  it('o `spawn_tier` de toda espécie é uma das cinco chaves de spawn_tiers', () => {
    // `spawn_tier` é text com FK para `spawn_tiers.key`, então erro ali sai como
    // 23503 e não como 22P02 — outro código, mesmo estrago: deploy vermelho.
    const doBanco = new Set(['muito_comum', 'comum', 'incomum', 'raro', 'muito_raro'])
    const bloco = /insert into \w+\.species \([\s\S]*?on conflict \(id\) do nothing;/.exec(sql)
    expect(bloco, 'não achei o insert de species').toBeTruthy()
    const tiers = [...bloco![0].matchAll(/, '(muito_comum|comum|incomum|raro|muito_raro|[a-z_]+)', (?:true|false)\)/g)]
      .map(([, t]) => t)
    expect(tiers.length, 'nenhum spawn_tier lido — o regex do bloco mudou').toBeGreaterThan(100)
    expect([...new Set(tiers)].filter((t) => !doBanco.has(t))).toEqual([])
  })
})
