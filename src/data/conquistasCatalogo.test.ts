// Catalogo de conquistas: o autoral (src/data/conquistas.ts), o que a tela le
// (generated) e o que o banco avalia (migration) precisam ser a MESMA coisa.
//
// Toda falha aqui seria silenciosa em producao: regra que o SQL nao conhece
// devolve valor 0 e a conquista nunca fecha; especie com nome errado idem; e
// um lendario numa regra contraria a decisao do dono (lendarios vao virar
// eventos — spec 2026-10-14-conquistas-design).
import { describe, expect, it } from 'vitest'
import { CONQUISTAS, PONTOS_POR_NIVEL } from './conquistas'
import { CATALOGO_DE_CONQUISTAS } from './generated/conquistas.generated'
import { resolverCatalogo, sqlDoCatalogo, tsDoCatalogo, catalogoDaTela } from '../../scripts/conquistas/resolver'
import { SPECIES } from './pokes'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import fonteGerada from './generated/conquistas.generated.ts?raw'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function ultima(sufixo: string): string {
  const chaves = Object.keys(MIGRATIONS).filter((k) => k.endsWith(sufixo)).sort()
  if (!chaves.length) throw new Error(`nenhuma migration ${sufixo}`)
  return MIGRATIONS[chaves[chaves.length - 1]].replace(/\r\n/g, '\n')
}

const RESOLVIDO = resolverCatalogo()

/** Toda string de especie citada numa regra resolvida. */
function especiesCitadas(valor: unknown, saida: Set<string> = new Set()): Set<string> {
  if (Array.isArray(valor)) valor.forEach((v) => especiesCitadas(v, saida))
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) {
      if (k === 'especies' && Array.isArray(v)) v.forEach((s) => saida.add(String(s)))
      else especiesCitadas(v, saida)
    }
  } else if (typeof valor === 'string' && /^(captura|evolucao|ativo_seg):/.test(valor)) {
    saida.add(valor.split(':')[1])
  }
  return saida
}

describe('catalogo de conquistas', () => {
  it('o generated da tela esta em dia com o autoral (rode npm run conquistas:gerar)', () => {
    expect(fonteGerada.replace(/\r\n/g, '\n')).toBe(tsDoCatalogo())
    expect(CATALOGO_DE_CONQUISTAS).toEqual(catalogoDaTela())
  })

  it('a ultima migration do catalogo esta em dia com o autoral (gere uma nova com timestamp novo)', () => {
    expect(ultima('_catalogo_de_conquistas.sql')).toContain(sqlDoCatalogo())
  })

  it('ids unicos, em snake_case', () => {
    const ids = CONQUISTAS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/)
  })

  it('pontos seguem o nivel', () => {
    for (const c of RESOLVIDO) expect(c.pontos).toBe(PONTOS_POR_NIVEL[c.nivel])
  })

  it('existe exatamente uma platina', () => {
    expect(RESOLVIDO.filter((c) => c.nivel === 'platina')).toHaveLength(1)
  })

  it('toda especie citada existe no jogo', () => {
    const faltando = [...especiesCitadas(RESOLVIDO.map((c) => c.regra))].filter((s) => !SPECIES[s])
    expect(faltando).toEqual([])
  })

  it('nenhuma regra cita especie lendaria (lendarios serao eventos)', () => {
    const lendarios = new Set(LEGENDARY_SPECIES_IDS)
    const citados = [...especiesCitadas(RESOLVIDO.map((c) => c.regra))].filter((s) => lendarios.has(s))
    expect(citados).toEqual([])
  })

  it('equipe tem no maximo 6: regra de time/conjunto de equipe nao pede mais que isso', () => {
    for (const c of RESOLVIDO) {
      if (c.regra.t === 'time') expect(Number(c.regra.qtd), c.id).toBeLessThanOrEqual(6)
      if (c.regra.t === 'conjunto' && c.regra.time) expect((c.regra.especies as unknown[]).length, c.id).toBeLessThanOrEqual(6)
    }
  })

  it('o SQL conhece todo tipo de regra e toda metrica usada', () => {
    const fundacao = ultima('_conquistas_fundacao_public.sql')
    for (const c of RESOLVIDO) {
      expect(fundacao, `regra ${c.regra.t} (${c.id})`).toContain(`t = '${c.regra.t}'`)
      if (c.regra.t === 'metrica') expect(fundacao, `metrica ${c.regra.m} (${c.id})`).toContain(`m = '${c.regra.m}'`)
      if (c.regra.t === 'colecao') expect(fundacao, `colecao ${c.regra.de} (${c.id})`).toContain(`'${c.regra.de}'`)
      const filtro = (c.regra.f ?? {}) as Record<string, unknown>
      for (const chave of Object.keys(filtro)) expect(fundacao, `filtro ${chave} (${c.id})`).toContain(`'${chave}'`)
    }
  })

  it('platina conta as secretas e nao as impossiveis', () => {
    const fundacao = ultima('_conquistas_fundacao_public.sql')
    expect(fundacao).toMatch(/c\.nivel in \('bronze', 'prata', 'ouro'\)/)
    // O CHECK da coluna lista todos os niveis; aqui so interessam os filtros.
    expect(fundacao).not.toMatch(/(c\.nivel|where nivel) in \([^)]*impossivel/)
  })

  it('tem conquistas de todos os niveis', () => {
    const niveis = new Set(RESOLVIDO.map((c) => c.nivel))
    for (const n of ['bronze', 'prata', 'ouro', 'impossivel', 'platina']) expect(niveis.has(n as never), n).toBe(true)
  })
})
