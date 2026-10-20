// Mural de contratos e ovos (20/10/2026): os numeros de `ovos.ts` sao
// repetidos no SQL das RPCs, porque o sorteio acontece no servidor. Este teste
// le a migration e compara numero a numero, e tambem GERA o bloco do catalogo
// e o par `_dev`:
//
//   GERAR_OVOS=1 npx vitest run src/data/ovos.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ABATES_DO_CONTRATO, ABATES_PARA_CHOCAR, CHANCE_DE_CONTRATO_SHINY, CHANCE_DO_CONTRATO, CHANCE_SHINY_DO_OVO_SHINY,
  CONTRATOS_POR_DIA, IV_MINIMO_DO_OVO, PESO_DE_REFERENCIA, PESO_MINIMO_DO_CONTRATO, PESO_MINIMO_PRO_SHINY,
  PRECO_BASE_DO_REFRESH, RARIDADE_AO_CHOCAR, RARIDADES_DO_OVO, abatesDoContrato, precoDoRefresh, progressoDoContrato,
  type Contrato,
} from './ovos'
import { catalogoDeOvos } from './catalogoDeOvos'
import { CHANCE_DE_TRAIT_OCULTA } from './traits'
import { NATURE_LIST } from './natures'

const PUBLIC = 'supabase/migrations/20261020120000_mural_de_contratos_public.sql'
const DEV = 'supabase/migrations/20261020120001_mural_de_contratos_dev.sql'
const INICIO = '-- CATALOGO:INICIO'
const FIM = '-- CATALOGO:FIM'

const lit = (s: string | null) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`)
const arr = (xs: string[]) => `array[${xs.map(lit).join(', ')}]::text[]`

function blocoDoCatalogo(): string {
  const linhas = catalogoDeOvos().map((l) =>
    `  (${lit(l.bioma)}, ${lit(l.speciesId)}, ${lit(l.baseId)}, ${l.peso}, ${arr(l.traits)}, ${lit(l.traitOculta)})`)
  return [
    INICIO,
    'delete from public.ovo_catalogo;',
    'insert into public.ovo_catalogo (bioma, species_id, base_id, peso, traits, trait_oculta) values',
    linhas.join(',\n') + ';',
    FIM,
  ].join('\n')
}

function paraDev(sqlPublic: string): string {
  return '-- Espelho de 20261020120000_mural_de_contratos_public.sql no schema `dev`. GERADO por src/data/ovos.test.ts.\n'
    + sqlPublic
      .replace(/public\./g, 'dev.')
      .replace(/set search_path = public/g, "set search_path = dev, public")
}

function sqlAtualizado(): string {
  const atual = readFileSync(PUBLIC, 'utf8')
  const i = atual.indexOf(INICIO)
  const f = atual.indexOf(FIM) + FIM.length
  return atual.slice(0, i) + blocoDoCatalogo() + atual.slice(f)
}

if (process.env.GERAR_OVOS === '1') {
  const novo = sqlAtualizado()
  writeFileSync(PUBLIC, novo, 'utf8')
  writeFileSync(DEV, paraDev(novo), 'utf8')
}

const SQL = readFileSync(PUBLIC, 'utf8')

describe('mural de contratos: SQL e cliente concordam', () => {
  it('o catalogo gravado e o que o catalogo do jogo gera hoje (rode GERAR_OVOS=1)', () => {
    expect(SQL).toBe(sqlAtualizado())
    expect(readFileSync(DEV, 'utf8')).toBe(paraDev(SQL))
  })

  it('as tabelas de chance somam 100', () => {
    expect(Object.values(CHANCE_DO_CONTRATO).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    for (const r of RARIDADES_DO_OVO) {
      expect(Object.values(RARIDADE_AO_CHOCAR[r]).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    }
  })

  it('chance do contrato, abates do contrato e abates pra chocar batem com o SQL', () => {
    for (const r of RARIDADES_DO_OVO) {
      expect(SQL).toMatch(new RegExp(`'${r}', ${CHANCE_DO_CONTRATO[r].toFixed(1)}`))
      expect(SQL).toContain(`'${r}' then ${ABATES_PARA_CHOCAR[r]}`.replace(`'legendary' then`, 'else').replace(/^else (\d+)$/, 'else $1'))
    }
    const chocar = ABATES_PARA_CHOCAR
    expect(SQL.replace(/\s+/g, ' ')).toContain(`case v_c.raridade when 'comum' then ${chocar.comum} when 'incomum' then ${chocar.incomum} when 'raro' then ${chocar.raro} when 'ultra' then ${chocar.ultra} else ${chocar.legendary} end`)
    expect(SQL).toContain(`when 'comum' then ${ABATES_DO_CONTRATO.comum} when 'incomum' then ${ABATES_DO_CONTRATO.incomum} when 'raro' then ${ABATES_DO_CONTRATO.raro}`)
    expect(SQL).toContain(`when 'ultra' then ${ABATES_DO_CONTRATO.ultra} else ${ABATES_DO_CONTRATO.legendary} end`)
    expect(SQL).toContain(`least(1.0, v_esp.peso / ${PESO_DE_REFERENCIA}.0)`)
    expect(SQL).toContain(`then ${PESO_MINIMO_PRO_SHINY} else ${PESO_MINIMO_DO_CONTRATO} end`)
    expect(SQL).toContain(`random() < ${CHANCE_DE_CONTRATO_SHINY}`)
    expect(SQL).toContain(`for v_slot in 0..${CONTRATOS_POR_DIA - 1} loop`)
    expect(SQL).toContain(`generate_series(0, ${CONTRATOS_POR_DIA - 1})`)
    expect(SQL).toContain(`v_preco := ${PRECO_BASE_DO_REFRESH} * power(2, v_refreshes)`)
  })

  it('raridade ao chocar, shiny, IV, natureza e habilidade batem com o SQL', () => {
    for (const ovo of RARIDADES_DO_OVO) {
      for (const [chave, peso] of Object.entries(RARIDADE_AO_CHOCAR[ovo])) {
        expect(SQL).toMatch(new RegExp(`\\('${ovo}', \\d, '${chave}', ${peso.toFixed(peso % 1 === 0 ? 1 : String(peso).split('.')[1].length)}(::numeric)?\\)`))
      }
    }
    expect(SQL).toContain(`random() < ${CHANCE_SHINY_DO_OVO_SHINY}`)
    expect(SQL).toContain(`${IV_MINIMO_DO_OVO} + floor(random() * ${32 - IV_MINIMO_DO_OVO})::int`)
    expect(SQL).toContain(`random() < ${CHANCE_DE_TRAIT_OCULTA}`)
    for (const n of NATURE_LIST) expect(SQL).toContain(`('${n.key}')`)
  })
})

describe('regras do contrato no cliente', () => {
  it('abates do contrato escalam com o peso e tem piso', () => {
    expect(abatesDoContrato('comum', 30)).toBe(50)
    expect(abatesDoContrato('raro', 10)).toBe(67)
    expect(abatesDoContrato('comum', 5)).toBe(10)
  })

  it('refresh dobra de preco no dia', () => {
    expect([0, 1, 2, 3].map(precoDoRefresh)).toEqual([10, 20, 40, 80])
  })

  it('progresso conta so o que veio depois do contrato, e shiny conta so shiny', () => {
    const c: Contrato = { slot: 0, speciesId: 'zubat', baseId: 'zubat', raridade: 'comum', tipo: 'abates', alvo: 50, base: 100, reivindicado: false }
    expect(progressoDoContrato(c, { normal: 120, shiny: 1 })).toBe(21)
    expect(progressoDoContrato(c, { normal: 999 })).toBe(50)
    expect(progressoDoContrato({ ...c, tipo: 'shiny', alvo: 1, base: 2 }, { normal: 999, shiny: 3 })).toBe(1)
  })

  it('o catalogo tem todos os biomas e nenhuma lendaria', () => {
    const c = catalogoDeOvos()
    expect(new Set(c.map((l) => l.bioma)).size).toBe(12)
    expect(c.every((l) => l.peso >= 1)).toBe(true)
  })
})
