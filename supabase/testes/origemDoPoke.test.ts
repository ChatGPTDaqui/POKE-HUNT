// Origem do POKE (14/10/2026): a base da regra de MERITO PROPRIO das conquistas.
// POKE comprado ou trocado nunca pode contar como capturado pelo jogador.
//
// Duas coisas sustentam isso e as duas sao faceis de perder sem erro nenhum:
//  1. o trigger `origem_do_poke` (origem imutavel; troca de dono vira
//     `transferido`);
//  2. a configuracao `jogo.origem_poke` nas RPCs que criam POKE. Um
//     `create or replace function` posterior APAGA essa configuracao em
//     silencio — o inicial passaria a nascer `desconhecida`.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DIR = join(__dirname, '..', 'migrations')
const ARQUIVOS = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
const SQL = ARQUIVOS.map((f) => [f, readFileSync(join(DIR, f), 'utf8').replace(/--[^\n]*/g, '')] as const)

const ORIGEM = SQL.find(([f]) => f.endsWith('_origem_do_poke.sql'))?.[1] ?? ''

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

  // Para cada RPC que cria POKE: depois da ULTIMA vez que ela foi (re)criada,
  // alguem precisa ter declarado a origem — no proprio create (`set
  // jogo.origem_poke`) ou num `alter function ... set jogo.origem_poke`.
  for (const [schema, funcao, origem] of [
    ['public', 'escolher_starter', 'inicial'],
    ['dev', 'escolher_starter', 'inicial'],
    ['public', 'coletar_anexo_correio', 'recompensa'],
    ['dev', 'coletar_anexo_correio', 'recompensa'],
  ] as const) {
    it(`${schema}.${funcao} declara origem ${origem} depois da ultima redefinicao`, () => {
      const criar = new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+${schema}\\.${funcao}\\s*\\(`, 'i')
      const declarar = new RegExp(
        `(alter\\s+function\\s+${schema}\\.${funcao}\\s*\\([^)]*\\)\\s+set\\s+jogo\\.origem_poke\\s*=\\s*'${origem}')`,
        'i',
      )
      let ultimaCriacao = -1
      let ultimaDeclaracao = -1
      SQL.forEach(([, sql], i) => {
        if (criar.test(sql)) ultimaCriacao = i
        if (declarar.test(sql) || (criar.test(sql) && new RegExp(`set\\s+jogo\\.origem_poke\\s*=\\s*'${origem}'`, 'i').test(sql))) {
          ultimaDeclaracao = i
        }
      })
      expect(ultimaCriacao, `nao achei nenhuma definicao de ${schema}.${funcao}`).toBeGreaterThanOrEqual(0)
      expect(
        ultimaDeclaracao,
        `${schema}.${funcao} foi redefinida (${ARQUIVOS[ultimaCriacao]}) sem repetir set jogo.origem_poke = '${origem}'`,
      ).toBeGreaterThanOrEqual(ultimaCriacao)
    })
  }
})
