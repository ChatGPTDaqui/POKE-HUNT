// PH-89 — a tabela de naturezas do SQL tem que ser a MESMA do motor TS.
//
// POR QUE ESTE TESTE EXISTE
//
// O calculo de stats esta implementado duas vezes: `computeStatsAtLevel`
// (data/pokes.ts) e `_calcular_stats` (SQL, usada por `evoluir_poke`). Duas
// implementacoes da mesma regra divergem com o tempo — e ja divergiram: o SQL
// nao conhecia natureza nenhuma, entao evoluir apagava o efeito dela dos stats
// e ninguem percebia, porque todo teste exercitava o lado TS.
//
// O ideal seria rodar as duas e comparar os numeros. Nao da: o SQL vive no
// banco e o CI nao tem credencial. O que da pra travar sem banco e a PARIDADE
// ESTRUTURAL — as 25 naturezas, na mesma ordem, com os mesmos 5 atributos. Se
// alguem reordenar `NATURE_STATS` ou renomear uma natureza no TS, o SQL passa a
// dizer outra coisa e este teste falha.
//
// O que ele NAO cobre, e vale saber: a aritmetica em si (1.1 / 0.9, ordem dos
// multiplicadores, arredondamento). Isso so um teste de integracao pega.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NATURES, NATURE_STATS, NATURE_BONUS, NATURE_PENALTY } from '../../src/data/natures'

const DIR = join(__dirname, '..', 'migrations')

/** Corpo vigente de `<schema>.<nome>` (ultima definicao ganha). */
function corpoVigente(schema: string, nome: string): string {
  let achado = ''
  for (const arquivo of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(DIR, arquivo), 'utf8').replace(/\r\n/g, '\n').toLowerCase()
    for (const abre of [`create function ${schema}.${nome}(`, `create or replace function ${schema}.${nome}(`]) {
      const i = sql.indexOf(abre)
      if (i === -1) continue
      const da = sql.slice(i)
      // As funcoes novas usam `$fn$` como delimitador; as antigas, `$$`.
      const fim = Math.min(...[da.indexOf('$fn$;'), da.indexOf('$$;')].filter((n) => n !== -1))
      achado = Number.isFinite(fim) ? da.slice(0, fim) : da
    }
  }
  return achado
}

/** Os literais de um `array[...]` nomeado dentro do corpo. */
function arrayDeclarado(corpo: string, variavel: string): string[] {
  const i = corpo.indexOf(`${variavel} text[] := array[`)
  if (i === -1) return []
  const abre = corpo.indexOf('[', corpo.indexOf(':=', i))
  const fecha = corpo.indexOf(']', abre)
  return corpo.slice(abre + 1, fecha)
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean)
}

/** `atkFis` (TS) -> `atk_fis` (coluna). */
function paraColuna(stat: string): string {
  return stat.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
}

describe.each(['public', 'dev'])('natureza no calculo do servidor — schema %s', (schema) => {
  it('define _mult_natureza', () => {
    expect(corpoVigente(schema, '_mult_natureza')).not.toBe('')
  })

  it('lista as MESMAS 25 naturezas do motor, na mesma ordem', () => {
    const noSql = arrayDeclarado(corpoVigente(schema, '_mult_natureza'), 'v_nomes')
    // A ordem importa: o indice e que decide quem sobe e quem desce (o SQL
    // deriva linha/coluna de `array_position`). Comparar como conjunto deixaria
    // passar uma permutacao, que troca o efeito de 20 das 25.
    expect(noSql).toEqual(Object.keys(NATURES))
    expect(noSql).toHaveLength(25)
  })

  it('usa os mesmos 5 atributos, na mesma ordem, e nunca HP', () => {
    const noSql = arrayDeclarado(corpoVigente(schema, '_mult_natureza'), 'v_stats')
    expect(noSql).toEqual(NATURE_STATS.map(paraColuna))
    expect(noSql).not.toContain('hp')
  })

  it('usa os mesmos fatores de bonus e penalidade', () => {
    const corpo = corpoVigente(schema, '_mult_natureza')
    expect(corpo).toContain(`return ${NATURE_BONUS}`)
    expect(corpo).toContain(`return ${NATURE_PENALTY}`)
  })

  it('_calcular_stats aplica o fator de natureza em todos os stats menos HP', () => {
    const corpo = corpoVigente(schema, '_calcular_stats')
    for (const stat of NATURE_STATS.map(paraColuna)) {
      expect(corpo, `faltou natureza no stat ${stat}`).toContain(`_mult_natureza(p_nature, '${stat}')`)
    }
    // HP tambem passa pela funcao, que devolve 1 pra ele — mais barato que
    // manter uma excecao no call site, e a garantia fica num lugar so.
    expect(corpo).toContain("_mult_natureza(p_nature, 'hp')")
  })

  it('evoluir_poke passa a natureza do POKE adiante', () => {
    const corpo = corpoVigente(schema, 'evoluir_poke')
    expect(corpo).toContain('v_poke.nature')
  })
})
