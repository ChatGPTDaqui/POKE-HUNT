// PH-246 — os guardas que faltavam em "Especialidades".
//
// A suite original (PH-198) media o custo contra ele mesmo. Nenhum destes dois
// defeitos era visivel por ela, e os dois estavam em producao:
//
//   1. A Pedra FLYING nao caia de lugar nenhum. `awardKillLoot` dropava a
//      Stone do tipo PRIMARIO da vitima, e nenhuma das 245 especies do
//      catalogo tem FLYING como primario — FLYING so existe como type2. Os 10
//      niveis de FLYING apareciam na tela com preco e eram incompraveis, e o
//      maximo de `progressoGlobal` (180) era inatingivel, o que matava tambem
//      o titulo "Lendario".
//   2. O custo era um array unico pros 18 tipos, mas a oferta de Stone nao e
//      uniforme. Fechar as duas trilhas ia de 18.800 abates a 162.933 — nove
//      vezes de diferenca decidida so por quantas especies o tipo tem.
import { describe, expect, it } from 'vitest'

import { ESPECIALIDADE_TYPES, custosDoTipo } from './especialidades'
import { ESPECIALIDADE_STONE_POR_NIVEL, ESPECIALIDADE_GOLD_POR_NIVEL } from './generated/custoEspecialidade.generated'
// A MESMA funcao que o gerador usa pra decidir o custo. Reimplementar a
// medicao aqui pra "conferir por outro caminho" foi tentado e deu errado: as
// duas contas divergiram (1,01x contra 39,7x) e a que mandava no preco era a
// errada. Uma fonte, e o teste julgando o RESULTADO dela.
import { ofertaDeStonePorTipo } from './ofertaDeStone'
import { SPECIES } from './pokes'
import type { ElementType } from './generated/types'

const MIGRATIONS = import.meta.glob('/supabase/migrations/*.sql', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const OFERTA = ofertaDeStonePorTipo()

describe('a bancada mede alguma coisa', () => {
  it('os pools de hunt foram varridos e as migrations foram lidas', () => {
    // Sem isto, um glob quebrado ou um `MAPS` vazio deixariam todo o resto
    // passando contra o nada.
    expect(Object.values(OFERTA).filter((c) => c > 0).length).toBeGreaterThan(10)
    expect(Object.keys(MIGRATIONS).length).toBeGreaterThan(10)
  })
})

describe('todo tipo tem fonte de Stone', () => {
  it('nenhum dos 18 tipos fica sem NENHUMA especie que solte a Stone dele', () => {
    // Era exatamente isto que deixava FLYING incompravel enquanto a tela
    // anunciava o preco dos 10 niveis.
    const semFonte = (ESPECIALIDADE_TYPES as ElementType[]).filter((t) => !(OFERTA[t]))
    expect(semFonte, 'tipo com especialidade a venda e sem fonte de Stone').toEqual([])
  })

  it('FLYING tem fonte, e ela vem de especie que tem FLYING como tipo SECUNDARIO', () => {
    // Guarda contra "consertaram inventando uma especie FLYING primaria":
    // o que a correcao fez foi o drop passar a olhar o type2.
    expect(OFERTA.FLYING).toBeGreaterThan(0)
    expect(Object.values(SPECIES).some((s) => s.type === 'FLYING')).toBe(false)
    expect(Object.values(SPECIES).filter((s) => s.type2 === 'FLYING').length).toBeGreaterThan(10)
  })
})

describe('o esforco pra maxar e comparavel entre os tipos', () => {
  it('o tipo mais caro nao passa de 2x o mais barato em abates', () => {
    // Antes: 9,0x (18.800 em FIRE/WATER contra 162.933 em STEEL). O gerador
    // mira 20.000 abates pra fechar as duas trilhas de qualquer tipo — o
    // patamar que os tipos comuns ja tinham, pra a correcao nao encarecer quem
    // nao tinha o problema.
    const abates = (ESPECIALIDADE_TYPES as ElementType[]).map((tipo) => {
      const stones = custosDoTipo(tipo).reduce((s, c) => s + c.stoneQtd, 0) * 2
      return { tipo, abates: stones / (OFERTA[tipo] || Number.EPSILON) }
    })
    const min = Math.min(...abates.map((a) => a.abates))
    const max = Math.max(...abates.map((a) => a.abates))
    expect(max / min, abates.map((a) => `${a.tipo}=${Math.round(a.abates)}`).join(' ')).toBeLessThan(2)
  })
})

describe('cliente e RPC cobram o MESMO custo (PH-246)', () => {
  const [, sqlPublic] = Object.entries(MIGRATIONS).find(([k]) => k.endsWith('_custo_especialidade_public.sql')) ?? []
  const [, sqlDev] = Object.entries(MIGRATIONS).find(([k]) => k.endsWith('_custo_especialidade_dev.sql')) ?? []

  /** Os `when '<TIPO>' then array[...]` do `case` que a RPC usa. */
  function custosDoSql(sql: string): Record<string, number[]> {
    const out: Record<string, number[]> = {}
    for (const m of sql.matchAll(/when '([A-Z]+)' then array\[([0-9, ]+)\]/g)) {
      out[m[1]] = m[2].split(',').map((n) => Number(n.trim()))
    }
    return out
  }

  it('o par de migrations existe', () => {
    expect(sqlPublic, 'faltou a migration public do custo').toBeTruthy()
    expect(sqlDev, 'faltou o gemeo dev').toBeTruthy()
  })

  it('o SQL cobra exatamente o que o modulo gerado anuncia, nos 18 tipos', () => {
    const doSql = custosDoSql(sqlPublic!)
    expect(Object.keys(doSql)).toHaveLength(18)
    for (const tipo of ESPECIALIDADE_TYPES as ElementType[]) {
      expect(doSql[tipo], tipo).toEqual([...ESPECIALIDADE_STONE_POR_NIVEL[tipo]])
    }
  })

  it('o gemeo dev cobra o mesmo que o public', () => {
    expect(custosDoSql(sqlDev!)).toEqual(custosDoSql(sqlPublic!))
  })

  it('o ouro por nivel do SQL bate com o do modulo', () => {
    const m = /v_gold_por_nivel bigint\[\] := array\[([0-9, ]+)\]/.exec(sqlPublic!)
    expect(m, 'array de ouro sumiu da RPC').toBeTruthy()
    expect(m![1].split(',').map((n) => Number(n.trim()))).toEqual([...ESPECIALIDADE_GOLD_POR_NIVEL])
  })

  it('a RPC nao carrega mais o array unico antigo', () => {
    // 15/35/70/130/220 era o custo igual pros 18 tipos. Se voltar, o
    // escalonamento por oferta foi desfeito.
    expect(sqlPublic!.includes('array[15, 35, 70, 130, 220]')).toBe(false)
  })
})
