// Ginasios (23/10/2026): regras do cliente, equipe do lider NPC e o SQL
// concordando. Tambem GERA o catalogo da migration e o par `_dev`:
//
//   GERAR_GINASIOS=1 npx vitest run src/data/ginasios.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DESAFIOS_POR_DIA, FAIXAS_DE_GINASIO, MANDATO_EM_DIAS, MAXIMO_DA_MESMA_ESPECIE, REPASSE_DO_LIDER,
  TAMANHO_DA_EQUIPE_DE_GINASIO, TIPOS_DE_GINASIO, NOME_DO_LIDER_NPC, equipeNpc, idDoGinasio,
  motivoDeEquipeInvalida, pokeDoGinasio, partesDoGinasio, type PokeDeGinasio,
} from './ginasios'
import { SPECIES } from './pokes'

const PUBLIC = 'supabase/migrations/20261023140000_ginasios_public.sql'
const DEV = 'supabase/migrations/20261023140001_ginasios_dev.sql'
const INICIO = '-- CATALOGO:INICIO'
const FIM = '-- CATALOGO:FIM'
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`

function blocoDoCatalogo(): string {
  const ginasios: string[] = []
  const lideres: string[] = []
  for (const f of FAIXAS_DE_GINASIO) {
    for (const t of TIPOS_DE_GINASIO) {
      const id = idDoGinasio(t, f.nivel)
      ginasios.push(`  (${lit(id)}, ${lit(t)}::text, ${f.nivel}, ${f.taxa})`)
      lideres.push(`  (${lit(id)}, ${lit(NOME_DO_LIDER_NPC(t))}, ${lit(JSON.stringify(equipeNpc(t, f)))}::jsonb, now() + interval '${MANDATO_EM_DIAS} days')`)
    }
  }
  return [
    INICIO,
    'insert into public.ginasio (id, tipo, faixa, taxa) values',
    ginasios.join(',\n'),
    'on conflict (id) do update set taxa = excluded.taxa;',
    '-- Lider NPC so na PRIMEIRA vez: ginasio que ja tem lider (humano ou NPC) fica como esta.',
    'insert into public.ginasio_lider (ginasio_id, lider_nome, equipe, mandato_ate) values',
    lideres.join(',\n'),
    'on conflict (ginasio_id) do nothing;',
    FIM,
  ].join('\n')
}

function paraDev(sql: string): string {
  return '-- Espelho de 20261023140000_ginasios_public.sql no schema `dev`. GERADO por src/data/ginasios.test.ts.\n'
    + sql.replace(/public\./g, 'dev.').replace(/set search_path = public/g, 'set search_path = dev, public')
}

function sqlAtualizado(): string {
  const atual = readFileSync(PUBLIC, 'utf8')
  return atual.slice(0, atual.indexOf(INICIO)) + blocoDoCatalogo() + atual.slice(atual.indexOf(FIM) + FIM.length)
}

if (process.env.GERAR_GINASIOS === '1') {
  const novo = sqlAtualizado()
  writeFileSync(PUBLIC, novo, 'utf8')
  writeFileSync(DEV, paraDev(novo), 'utf8')
}
const SQL = readFileSync(PUBLIC, 'utf8')

describe('ginasios: catalogo e SQL', () => {
  it('o catalogo gravado e o que o jogo gera (rode GERAR_GINASIOS=1)', () => {
    expect(SQL).toBe(sqlAtualizado())
    expect(readFileSync(DEV, 'utf8')).toBe(paraDev(SQL))
  })

  it('90 ginasios, 18 tipos x 5 faixas', () => {
    expect(TIPOS_DE_GINASIO).toHaveLength(18)
    expect(FAIXAS_DE_GINASIO.map((f) => f.nivel)).toEqual([100, 200, 300, 400, 500])
    expect((SQL.match(/^ {2}\('[A-Z]+_\d00', '[A-Z]+'::text, \d00, \d+\)/gm) ?? []).length).toBe(90)
  })

  it('limites batem com o SQL', () => {
    expect(SQL).toContain(`v_n <> ${TAMANHO_DA_EQUIPE_DE_GINASIO}`)
    expect(SQL).toContain(`having count(*) > ${MAXIMO_DA_MESMA_ESPECIE}`)
    expect(SQL).toContain(`dia = v_dia) >= ${DESAFIOS_POR_DIA}`)
    expect(SQL).toContain(`floor(v_d.taxa * ${REPASSE_DO_LIDER})`)
    expect(SQL).toContain(`interval '${MANDATO_EM_DIAS} days'`)
  })
})

describe('ginasios: regras', () => {
  it('equipe do lider NPC: 6 do tipo, valida, no teto da faixa', () => {
    for (const f of FAIXAS_DE_GINASIO) {
      for (const t of TIPOS_DE_GINASIO) {
        const e = equipeNpc(t, f)
        expect(motivoDeEquipeInvalida(e.map((p) => p.species_id), t), `${t} ${f.nivel}`).toBeNull()
        expect(e.every((p) => p.level === f.nivel)).toBe(true)
      }
    }
  })

  it('valida tamanho, repeticao e tipo', () => {
    const seis = ['charizard', 'arcanine', 'rapidash', 'magmar', 'flareon', 'ninetales'].filter((s) => SPECIES[s])
    while (seis.length < 6) seis.push('charizard')
    expect(motivoDeEquipeInvalida(seis.slice(0, 5), null)).toMatch(/6 POKEs/)
    expect(motivoDeEquipeInvalida(['pidgey', 'pidgey', 'pidgey', 'rattata', 'rattata', 'spearow'], null)).toMatch(/2 vezes/)
    expect(motivoDeEquipeInvalida(['pidgey', 'pidgey', 'rattata', 'rattata', 'spearow', 'spearow'], 'FIRE')).toMatch(/FIRE/)
    expect(motivoDeEquipeInvalida(['pidgey', 'pidgey', 'rattata', 'rattata', 'spearow', 'spearow'], null)).toBeNull()
  })

  it('acima do teto, os atributos saem do teto; golpes continuam os do nivel real', () => {
    const p: PokeDeGinasio = {
      species_id: 'charizard', level: 160, iv: [20, 20, 20, 20, 20, 20], rarity: 'comum',
      is_shiny: false, nature: null, active_abilities: null, golpes_de_maquina: null,
    }
    const noTeto = pokeDoGinasio(p, 100, 'x')!
    const semTeto = pokeDoGinasio({ ...p, level: 100 }, 100, 'y')!
    expect(noTeto.level).toBe(100)
    expect(noTeto.stats).toEqual(semTeto.stats)
    expect(noTeto.unlockedAbilities.length).toBeGreaterThanOrEqual(semTeto.unlockedAbilities.length)
  })

  it('id do ginasio ida e volta', () => {
    expect(partesDoGinasio(idDoGinasio('FIRE', 300))).toMatchObject({ tipo: 'FIRE', faixa: { nivel: 300 } })
    expect(partesDoGinasio('XYZ_100')).toBeNull()
  })
})
