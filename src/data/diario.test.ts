import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEMS } from './items'
import { DIAS_ESPECIAIS, METAS_DO_DIA, diaDeBrasilia, recompensaDaMeta, recompensaDoLogin } from './diario'

const MIGRATIONS = (['public', 'dev'] as const).map(s => ({
  schema: s,
  sql: readFileSync(`supabase/migrations/2026101018000${s === 'public' ? 0 : 1}_diario_${s}.sql`, 'utf8'),
}))

/** Lê do SQL a regra de um ramo: `v_ouro := greatest(PISO, v_base / DIV); v_itens := '[...]'`. */
function regraDoSql(sql: string, ramo: string) {
  const linha = sql.split('\n').find(l => l.includes(ramo) && l.includes('v_ouro :='))
  expect(linha, ramo).toBeTruthy()
  const [, piso, divisor] = linha!.match(/greatest\((\d+), v_base(?: \/ (\d+))?\)/)!
  const itens = JSON.parse(linha!.match(/v_itens := '(.*?)';/)![1])
  return (nivel: number) => {
    const base = 100 * nivel + 5 * nivel * nivel
    return { ouro: Math.max(Number(piso), Math.floor(base / Number(divisor ?? 1))), itens }
  }
}

const NIVEIS = [1, 5, 10, 37, 100, 331]

describe('Diário: cliente e RPC concordam', () => {
  for (const { schema, sql } of MIGRATIONS) {
    it(`login do mês (${schema})`, () => {
      for (const k of DIAS_ESPECIAIS) {
        const regra = regraDoSql(sql, `when ${k} then`)
        for (const n of NIVEIS) expect(recompensaDoLogin(k, n), `dia ${k}, Lv ${n}`).toEqual(regra(n))
      }
      const comum = regraDoSql(sql, 'else v_ouro := greatest(300')
      for (const k of [1, 2, 8, 29, 31]) for (const n of NIVEIS) expect(recompensaDoLogin(k, n)).toEqual(comum(n))
    })
    it(`metas do dia (${schema})`, () => {
      for (const m of METAS_DO_DIA) {
        const ramo = m.id === 'meta_1000' ? 'else v_ouro := greatest(2500' : `when '${m.id}' then v_ouro`
        const regra = regraDoSql(sql, ramo)
        for (const n of NIVEIS) expect(recompensaDaMeta(m.id, n), `${m.id}, Lv ${n}`).toEqual(regra(n))
      }
      expect(sql).toContain(`p_item not in ('login', ${METAS_DO_DIA.map(m => `'${m.id}'`).join(', ')})`)
    })
    it(`segurança (${schema}): sem escrita do cliente, dia de Brasília, toca players`, () => {
      expect(sql).not.toMatch(new RegExp(`grant [^;]*(insert|update)[^;]*${schema}\\.player_diario to authenticated`))
      expect(sql).toContain("now() at time zone 'America/Sao_Paulo'")
      expect(sql).toContain(`revoke execute on function ${schema}.coletar_diario(text) from anon;`)
      expect(sql).toContain(`update ${schema}.players set gold = gold + v_ouro where user_id = v_user_id;`)
    })
  }

  it('todo item de prêmio existe no catálogo', () => {
    const todos = [...[1, 7, 14, 21, 28].map(k => recompensaDoLogin(k, 10)), ...METAS_DO_DIA.map(m => recompensaDaMeta(m.id, 10))]
    for (const r of todos) for (const i of r.itens) expect(ITEMS[i.itemId], i.itemId).toBeTruthy()
  })

  it('valores aprovados pelo dono', () => {
    expect(recompensaDoLogin(1, 10).ouro).toBe(300)
    expect(recompensaDoLogin(28, 300).ouro).toBe(480000)
    expect(recompensaDaMeta('meta_1000', 100).ouro).toBe(30000)
    expect(recompensaDaMeta('meta_100', 10).ouro).toBe(500)
  })

  it('o dia vira à meia-noite de Brasília, não de UTC', () => {
    expect(diaDeBrasilia(new Date('2026-10-11T02:30:00Z'))).toBe('2026-10-10')
    expect(diaDeBrasilia(new Date('2026-10-11T03:30:00Z'))).toBe('2026-10-11')
  })
})
