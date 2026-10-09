// 09/10: a migration da skin do treinador — par public/dev, coluna com CHECK
// de formato, RPC que so valida FORMATO (o catalogo vive no cliente), view
// expondo `skin_treinador` no fim e o bot Lance com a skin dele.
import { describe, expect, it } from 'vitest'
import { SKINS_DO_TREINADOR } from './skinsDoTreinador'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const sql = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('skin_do_treinador'))
  .sort(([a], [b]) => a.localeCompare(b))

function arquivo(schema: 'public' | 'dev'): string {
  return sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
}

describe('migration da skin do treinador (09/10)', () => {
  it('o par public/dev existe, com carimbos diferentes (N e N+1)', () => {
    expect(sql.map(([nome]) => nome.replace(/.*_(public|dev)\.sql$/, '$1'))).toEqual(['public', 'dev'])
    const [a, b] = sql.map(([nome]) => Number(nome.match(/(\d{14})_/)![1]))
    expect(b).toBe(a + 1)
  })

  it.each(['public', 'dev'] as const)('em %s: coluna, CHECK, view e RPC no schema certo', (schema) => {
    const s = arquivo(schema)
    expect(s).toContain(`alter table ${schema}.players add column if not exists skin_treinador text`)
    expect(s).toContain(`create or replace view ${schema}.treinadores_publico`)
    // Colunas antigas na MESMA ordem e a nova no fim (create or replace view exige).
    expect(s).toMatch(/p\.user_id, p\.trainer_name, p\.trainer_level, p\.trainer_exp,[\s\S]*as eh_bot,\s*p\.avatar,\s*p\.skin_treinador\s*from/)
    expect(s).toContain(`exists (select 1 from ${schema}.pvp_bots b`)
    expect(s).toContain(`create or replace function ${schema}.definir_skin_treinador(p_skin text)`)
    expect(s).toContain(`grant execute on function ${schema}.definir_skin_treinador(text) to authenticated`)
    expect(s).toContain("raise exception 'nao autenticado'")
    expect(s).toMatch(/pg_advisory_xact_lock\(hashtext\(v_user_id::text\)\)/)
    expect(s).toContain('and p.skin_treinador is null')
  })

  it('todo id do catalogo passa no formato que o banco aceita', () => {
    const formato = new RegExp(arquivo('public').match(/v_skin !~ '([^']+)'/)![1])
    for (const s of SKINS_DO_TREINADOR) expect(formato.test(s.id), s.id).toBe(true)
  })

  it('o bot com skin no banco e uma skin que existe no catalogo', () => {
    const lista = arquivo('public').match(/@'\) in \(([^)]*)\);/)![1]
    const ids = lista.split(',').map((x) => x.trim().replace(/'/g, ''))
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) expect(SKINS_DO_TREINADOR.some((s) => s.id === id), id).toBe(true)
  })
})
