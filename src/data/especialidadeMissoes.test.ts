// Especialidade como missao (17/10/2026): o catalogo do cliente e a tabela
// `especialidade_missao` que a RPC confere precisam ser a MESMA lista, na mesma
// ordem — a tela casa o texto do catalogo com o progresso do servidor pelo
// indice do requisito.
import { describe, expect, it } from 'vitest'

import { ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_TYPES } from './especialidades'
import { MISSOES_DE_ESPECIALIDADE, especiesCapturaveisDoTipo, missaoDoNivel } from './especialidadeMissoes'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function maisRecente(schema: 'public' | 'dev'): string {
  const [, sql] = Object.entries(MIGRATIONS)
    .filter(([nome]) => nome.endsWith(`_custo_especialidade_${schema}.sql`))
    .sort(([a], [b]) => a.localeCompare(b))
    .pop() ?? []
  return sql ?? ''
}

/** As linhas `('TIPO', 'trilha', N, '<json>'::jsonb)` do insert da tabela. */
function missoesDoSql(sql: string) {
  return [...sql.matchAll(/^ {2}\('([A-Z]+)'::text, '(dano|defesa)', (\d+), '(.*)'::jsonb\)/gm)].map((m) => ({
    tipo: m[1], trilha: m[2], nivel: Number(m[3]), requisitos: JSON.parse(m[4].replace(/''/g, "'")),
  }))
}

// Os tipos de regra que `conquista_valor` sabe avaliar e que o catalogo usa.
const REGRAS_CONHECIDAS = new Set(['abates', 'contador', 'colecao', 'posse', 'metrica'])

describe('missoes de especialidade', () => {
  it('cobre 18 tipos x 2 trilhas x 10 niveis', () => {
    expect(MISSOES_DE_ESPECIALIDADE.length).toBe(ESPECIALIDADE_TYPES.length * 2 * ESPECIALIDADE_NIVEL_MAX)
    for (const tipo of ESPECIALIDADE_TYPES) {
      for (const trilha of ['dano', 'defesa'] as const) {
        for (let n = 1; n <= ESPECIALIDADE_NIVEL_MAX; n++) {
          const m = missaoDoNivel(tipo, trilha, n)
          expect(m, `${tipo} ${trilha} ${n}`).not.toBeNull()
          expect(m!.requisitos.length, `${tipo} ${trilha} ${n}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it.each(['public', 'dev'] as const)('em %s, a tabela da RPC e o catalogo sao a mesma lista', (schema) => {
    const doSql = missoesDoSql(maisRecente(schema))
    expect(doSql).toEqual(MISSOES_DE_ESPECIALIDADE.map((m) => ({ ...m, requisitos: JSON.parse(JSON.stringify(m.requisitos)) })))
  })

  it.each(['public', 'dev'] as const)('em %s, a RPC confere a missao antes de cobrar', (schema) => {
    const sql = maisRecente(schema)
    const i = sql.indexOf(`create or replace function ${schema}.subir_nivel_especialidade`)
    const corpo = sql.slice(i)
    expect(corpo.indexOf(`${schema}.conquista_valor(v_user_id, v_req->'regra')`)).toBeGreaterThan(0)
    // A conferencia vem ANTES de tirar ouro e Pedra.
    expect(corpo.indexOf('conquista_valor')).toBeLessThan(corpo.indexOf('set gold = gold - v_gold'))
    expect(corpo).toContain(`if v_nivel_atual >= ${ESPECIALIDADE_NIVEL_MAX} then`)
    expect(sql).toContain(`check (dano_nivel between 0 and ${ESPECIALIDADE_NIVEL_MAX})`)
  })

  it('so usa regra que o avaliador das conquistas entende, com alvo positivo', () => {
    for (const m of MISSOES_DE_ESPECIALIDADE) {
      for (const r of m.requisitos) {
        expect(REGRAS_CONHECIDAS.has(r.regra.t), `${m.tipo} ${m.trilha} ${m.nivel}: ${r.regra.t}`).toBe(true)
        expect(r.regra.alvo, `${m.tipo} ${m.trilha} ${m.nivel}`).toBeGreaterThan(0)
        expect(r.texto.length).toBeGreaterThan(5)
      }
    }
  })

  it('nenhuma colecao pede mais especies do que o jogo tem pra capturar', () => {
    for (const m of MISSOES_DE_ESPECIALIDADE) {
      for (const r of m.requisitos) {
        if (r.regra.t !== 'colecao') continue
        expect(r.regra.alvo, `${m.tipo} ${m.trilha} ${m.nivel}`).toBeLessThanOrEqual(especiesCapturaveisDoTipo(m.tipo))
      }
    }
  })

  it('a missao fica mais dura a cada nivel (o requisito principal nunca encolhe)', () => {
    for (const tipo of ESPECIALIDADE_TYPES) {
      for (const trilha of ['dano', 'defesa'] as const) {
        let anterior = 0
        for (let n = 1; n <= ESPECIALIDADE_NIVEL_MAX; n++) {
          const principal = missaoDoNivel(tipo, trilha, n)!.requisitos[0].regra.alvo
          expect(principal, `${tipo} ${trilha} ${n}`).toBeGreaterThan(anterior)
          anterior = principal
        }
      }
    }
  })
})
