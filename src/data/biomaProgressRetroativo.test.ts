// A ordem canonica dos biomas COPIADA na migration de backfill (PH-284) e a
// mesma de `ORDEM_LEGADA_DOS_BIOMAS`.
//
// Ela e copiada porque nao existe tabela de biomas no banco — o SQL nao tem de
// onde derivar. Copia sem trava e onde o "uma fonte" morre: o dia em que um
// bioma entrar, sair ou trocar de lugar em biomas.ts, a migration ja aplicada
// continua a mesma e passa a creditar o bioma ERRADO pra quem rodar o backfill
// depois (o gate de PH-227 le a lista do TS, o backfill le a do SQL).
//
// Este teste nao impede a divergencia — impede que ela passe despercebida: ele
// fica vermelho no CI e obriga a decisao consciente (nova migration de backfill
// com a ordem nova, ou congelar esta como historica e excluir do teste).
import { describe, expect, it } from 'vitest'
import { ORDEM_LEGADA_DOS_BIOMAS } from './progressoDeBioma'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const BACKFILL = Object.entries(MIGRATIONS).filter(([nome]) => nome.includes('bioma_progress_retroativo'))

/** Le o literal `v_ordem constant text[] := array[...]` de uma migration. */
function ordemNoSql(sql: string): string[] {
  const bloco = sql.match(/v_ordem\s+constant\s+text\[\]\s*:=\s*array\[([\s\S]*?)\]/i)
  expect(bloco, 'nao achei o literal `v_ordem` na migration').toBeTruthy()
  return [...bloco![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
}

describe('backfill de bioma_progress (PH-284)', () => {
  it('as duas migrations do par existem', () => {
    // Sem isto, apagar as migrations deixaria os casos abaixo passando no vazio.
    expect(BACKFILL.map(([n]) => n.replace(/.*\//, '')).sort()).toEqual([
      '20260829130000_bioma_progress_retroativo_public.sql',
      '20260829130001_bioma_progress_retroativo_dev.sql',
    ])
  })

  it.each(BACKFILL)('%s usa exatamente ORDEM_LEGADA_DOS_BIOMAS', (nome, sql) => {
    expect(
      ordemNoSql(sql),
      `${nome}: a ordem do SQL divergiu de ORDEM_LEGADA_DOS_BIOMAS (src/data/biomas.ts). `
      + 'O backfill creditaria bioma diferente do que o gate exige.',
    ).toEqual([...ORDEM_LEGADA_DOS_BIOMAS])
  })

  it.each(BACKFILL)('%s so SOBE o indice — nunca zera nem regride', (nome, sql) => {
    // A idempotencia depende disto: o unico caminho que escreve o indice e o
    // `while` que incrementa a partir do valor atual. Um `:= 0` ou um `- 1`
    // aqui transformaria "rodar de novo" em "apagar progresso".
    expect(sql, `${nome}: apareceu decremento no backfill`).not.toMatch(/v_indice\s*:=\s*v_indice\s*-/)
    expect(sql, `${nome}: o indice deve partir do valor ja gravado`)
      .toMatch(/v_indice\s*:=\s*coalesce\(\(v_novo->>v_faixa\)::int,\s*0\)/)
    expect(sql, `${nome}: o unico avanco deve ser +1 dentro do laco`)
      .toMatch(/v_indice\s*:=\s*v_indice\s*\+\s*1/)
  })
})
