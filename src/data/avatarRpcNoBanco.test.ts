// PH-548: a migration do avatar — par public/dev, coluna com CHECK de formato,
// RPC que so valida FORMATO (a lista vive no cliente), view expondo `avatar`
// e cada bot com o proprio retrato.
import { describe, expect, it } from 'vitest'
import { FORMATO_DE_AVATAR } from './avatares'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const sql = Object.entries(MIGRATIONS)
  .filter(([nome]) => nome.includes('avatar_do_treinador'))
  .sort(([a], [b]) => a.localeCompare(b))

function arquivo(schema: 'public' | 'dev'): string {
  return sql.find(([nome]) => nome.endsWith(`_${schema}.sql`))![1]
}

describe('migration do avatar do treinador (PH-548)', () => {
  it('o par public/dev existe', () => {
    expect(sql.map(([nome]) => nome.replace(/.*_(public|dev)\.sql$/, '$1'))).toEqual(['public', 'dev'])
  })

  it.each(['public', 'dev'] as const)('em %s: coluna, CHECK, view e RPC no schema certo', (schema) => {
    const s = arquivo(schema)
    expect(s).toContain(`alter table ${schema}.players add column if not exists avatar text`)
    expect(s).toContain(`create or replace view ${schema}.treinadores_publico`)
    expect(s).toMatch(new RegExp(`from ${schema}\.players p;`))
    expect(s).toContain(`create or replace function ${schema}.definir_avatar(p_avatar text)`)
    expect(s).toContain(`grant execute on function ${schema}.definir_avatar(text) to authenticated`)
    expect(s).toContain("raise exception 'nao autenticado'")
    // A regex do SQL e a mesma do cliente — uma unica fonte de formato.
    const regexNoSql = s.match(/avatar !~ '([^']+)'/)?.[1]
    expect(regexNoSql).toBe(FORMATO_DE_AVATAR.source)
    expect(s).toMatch(/pg_advisory_xact_lock\(hashtext\(v_user_id::text\)\)/)
    // Bots ganham o retrato do slug do proprio e-mail, sem sobrescrever escolha.
    expect(s).toContain(`substring(u.email from '^bot-([a-z0-9-]+)@')`)
    expect(s).toContain('and p.avatar is null')
  })

  it('a RPC nao carrega lista de ids (o catalogo e do cliente)', () => {
    for (const [, s] of sql) {
      expect(s).not.toMatch(/in \('red'|'lance', 'ash'/)
    }
  })
})
