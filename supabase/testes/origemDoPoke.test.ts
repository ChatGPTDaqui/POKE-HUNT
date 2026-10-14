// Origem do POKE (14/10/2026): a base da regra de MERITO PROPRIO das conquistas.
// POKE comprado ou trocado nunca pode contar como capturado pelo jogador.
//
// Duas coisas sustentam isso e as duas sao faceis de perder sem erro nenhum:
//  1. o trigger `origem_do_poke` (origem imutavel; troca de dono vira
//     `transferido`);
//  2. o INSERT das RPCs que criam POKE declarando a origem. Uma redefinicao
//     futura que copie o corpo antigo faria o inicial nascer `desconhecida`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')
const ARQUIVOS = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const SQL = ARQUIVOS.map((f) => [f, readFileSync(join(DIR, f), 'utf8').replace(/--[^\n]*/g, '')] as const)

const ORIGEM = SQL.find(([f]) => f.endsWith('_origem_do_poke.sql'))?.[1] ?? ''

const INSERT_COM_ORIGEM = /insert into [a-z_.]*pokemon_instances \([^)]*\borigem\b/i
const FIM_DA_FUNCAO = /\$(function)?\$;/

describe('origem do POKE', () => {
  it('a migration existe e liga o trigger nos dois schemas', () => {
    expect(ORIGEM).not.toBe('')
    expect(ORIGEM).toMatch(/before insert or update on public\.pokemon_instances/)
    expect(ORIGEM).toMatch(/before insert or update on dev\.pokemon_instances/)
  })

  it('troca de dono vira transferido, e a origem nao muda em nenhum outro update', () => {
    expect(ORIGEM).toMatch(/new\.user_id is distinct from old\.user_id[\s\S]*?new\.origem := 'transferido'/)
    expect(ORIGEM).toMatch(/new\.origem := old\.origem/)
  })

  // Para cada RPC que cria POKE: a ULTIMA definicao dela precisa declarar a
  // origem no INSERT.
  for (const [schema, funcao, origem] of [
    ['public', 'escolher_starter', 'inicial'],
    ['dev', 'escolher_starter', 'inicial'],
    ['public', 'coletar_anexo_correio', 'recompensa'],
    ['dev', 'coletar_anexo_correio', 'recompensa'],
  ] as const) {
    it(`${schema}.${funcao} declara origem ${origem} na ultima definicao`, () => {
      const criar = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${schema}\\.${funcao}\\s*\\(`, 'i')
      let corpo = ''
      for (const [, sql] of SQL) {
        const m = criar.exec(sql)
        if (!m) continue
        const resto = sql.slice(m.index)
        const fim = resto.search(FIM_DA_FUNCAO)
        corpo = fim === -1 ? resto : resto.slice(0, fim)
      }
      expect(corpo, `nao achei definicao de ${schema}.${funcao}`).not.toBe('')
      expect(corpo, 'o INSERT nao lista a coluna origem').toMatch(INSERT_COM_ORIGEM)
      expect(corpo, `o INSERT nao declara '${origem}'`).toContain(`'${origem}'`)
    })
  }
})
