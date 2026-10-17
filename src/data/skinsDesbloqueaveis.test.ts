// Skins desbloqueaveis (17/10/2026): o catalogo do cliente e a regra da RPC
// precisam dizer a MESMA coisa. Divergir nao da erro em lugar nenhum — a tela
// mostraria livre uma skin que o servidor recusa, ou o contrario.
import { describe, expect, it } from 'vitest'

import { CONQUISTAS } from './conquistas'
import { SKINS_DO_TREINADOR, skinDesbloqueada } from './skinsDoTreinador'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/** A migration de skins desbloqueaveis MAIS RECENTE do schema (a que vale no banco). */
function maisRecente(schema: 'public' | 'dev'): string {
  const [, sql] = Object.entries(MIGRATIONS)
    .filter(([nome]) => nome.endsWith(`_skins_desbloqueaveis_${schema}.sql`))
    .sort(([a], [b]) => a.localeCompare(b))
    .pop() ?? []
  if (!sql) throw new Error(`migration de skins desbloqueaveis (${schema}) nao encontrada`)
  return sql
}

/** Os `when '<skin>' then '<conquista>'` do CASE da RPC. */
function regrasDoSql(sql: string): Record<string, string> {
  const funcao = sql.slice(sql.indexOf('create or replace function'), sql.indexOf('$$;'))
  return Object.fromEntries([...funcao.matchAll(/when '([a-z0-9-]+)' then '([a-z0-9_]+)'/g)].map((m) => [m[1], m[2]]))
}

describe('skins desbloqueaveis', () => {
  it('as gratis sao as da franquia: Mochileiro e os protagonistas jogaveis', () => {
    const gratis = SKINS_DO_TREINADOR.filter((s) => s.desbloqueio.t === 'gratis').map((s) => s.id).sort()
    expect(gratis).toEqual(['dawn', 'may', 'mochila', 'red'])
  })

  it.each(['public', 'dev'] as const)('em %s, a RPC tranca exatamente as skins de merito, com a mesma conquista', (schema) => {
    const doCatalogo = Object.fromEntries(SKINS_DO_TREINADOR
      .filter((s) => s.desbloqueio.t === 'conquista')
      .map((s) => [s.id, s.desbloqueio.t === 'conquista' ? s.desbloqueio.id : '']))
    expect(regrasDoSql(maisRecente(schema))).toEqual(doCatalogo)
  })

  it('toda conquista usada existe no catalogo de conquistas', () => {
    const ids = new Set(CONQUISTAS.map((c) => c.id))
    for (const s of SKINS_DO_TREINADOR) {
      if (s.desbloqueio.t === 'conquista') expect(ids.has(s.desbloqueio.id), `${s.id}: ${s.desbloqueio.id}`).toBe(true)
    }
  })

  it('gratis sempre livre; de merito so com a conquista', () => {
    const lance = SKINS_DO_TREINADOR.find((s) => s.id === 'lance')!
    const red = SKINS_DO_TREINADOR.find((s) => s.id === 'red')!
    expect(skinDesbloqueada(red, {})).toBe(true)
    expect(skinDesbloqueada(lance, {})).toBe(false)
    expect(skinDesbloqueada(lance, { campeao: '2026-10-17' })).toBe(true)
  })

  it.each(['public', 'dev'] as const)('em %s, o reset devolve ao padrao so quem nao tem a conquista', (schema) => {
    const sql = maisRecente(schema)
    expect(sql).toContain(`update ${schema}.players p`)
    expect(sql).toContain('set skin_treinador = null')
    expect(sql).toContain(`select 1 from ${schema}.player_conquistas c`)
    // O bot de PvP veste a skin do personagem dele e nao conquista nada.
    expect(sql).toContain(`and not exists (select 1 from ${schema}.pvp_bots b where b.user_id = p.user_id)`)
  })
})
