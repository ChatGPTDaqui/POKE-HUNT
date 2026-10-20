// Inicial nasce no nivel 5 (19/10/2026). O servidor (RPC escolher_starter) nao
// tem a curva de EXP, entao a migration grava nivel e EXP literais; este teste
// trava os dois lados juntos.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { SPECIES, createPokeInstance, pokeExpForLevel } from '@/data/pokes'
import { STARTER_LEVEL } from './simulation'

const INICIAIS = ['charmander', 'squirtle', 'bulbasaur']
const ARQUIVO = { public: '20261019130000_inicial_nivel_5_public', dev: '20261019130001_inicial_nivel_5_dev' }
const migration = (schema: keyof typeof ARQUIVO) => readFileSync(`supabase/migrations/${ARQUIVO[schema]}.sql`, 'utf8')

describe('inicial no nivel 5', () => {
  it('o cliente cria o inicial no nivel 5; capturado continua no nivel pedido', () => {
    expect(STARTER_LEVEL).toBe(5)
    expect(createPokeInstance(createRng(1), 'rattata').level).toBe(1)
  })

  it('a migration grava o mesmo nivel e a mesma EXP do cliente, nos dois schemas', () => {
    for (const id of INICIAIS) {
      const exp = pokeExpForLevel(STARTER_LEVEL, SPECIES[id].growthCurve)
      for (const schema of ['public', 'dev'] as const) {
        const sql = migration(schema)
        expect(sql).toContain(`'team', 0, ${STARTER_LEVEL}, ${exp},`)
        expect(sql).toContain(`_calcular_stats(v_species, ${STARTER_LEVEL},`)
        expect(sql).toContain(`level_req <= ${STARTER_LEVEL})`)
      }
    }
  })
})
