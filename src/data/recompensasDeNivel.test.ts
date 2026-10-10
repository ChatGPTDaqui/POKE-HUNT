import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ITEMS } from './items'
import { MARCOS_DE_TREINADOR, chaveDoNivel, situacaoDosMarcos, somaDasRecompensas } from './recompensasDeNivel'
import { PREFIXO_DO_NIVEL } from '@/stores/passosStore'

const MIGRATIONS = (['public', 'dev'] as const).map(s => ({
  schema: s,
  sql: readFileSync(`supabase/migrations/2026101015000${s === 'public' ? 0 : 1}_recompensas_de_treinador_${s}.sql`, 'utf8'),
}))

describe('recompensas por nível de treinador', () => {
  for (const { schema, sql } of MIGRATIONS) {
    it(`a lista da RPC (${schema}) é a do cliente`, () => {
      const lista = JSON.parse(sql.match(/v_marcos jsonb := '(\[[\s\S]*?\])';/)![1])
      expect(lista).toEqual(MARCOS_DE_TREINADOR.map(m => ({ nivel: m.nivel, ouro: m.recompensa.ouro, itens: m.recompensa.itens })))
    })
    it(`a RPC (${schema}) é idempotente, fechada ao anônimo e toca players`, () => {
      expect(sql).toContain(`insert into ${schema}.recompensa_concedida (user_id, chave)`)
      expect(sql).toContain('on conflict do nothing;\n    continue when not found;')
      expect(sql).toContain(`revoke execute on function ${schema}.reivindicar_niveis_de_treinador() from anon;`)
      expect(sql).toContain(`update ${schema}.players set gold = gold + v_ouro where user_id = v_user_id;`)
    })
  }

  it('marco a cada 5 até o 100 e a cada 25 até o 1000', () => {
    const niveis = MARCOS_DE_TREINADOR.map(m => m.nivel)
    expect(niveis.slice(0, 3)).toEqual([5, 10, 15])
    expect(niveis).toContain(100)
    expect(niveis).not.toContain(105)
    expect(niveis).toContain(125)
    expect(niveis.at(-1)).toBe(1000)
  })

  it('valores aprovados pelo dono', () => {
    const de = (n: number) => MARCOS_DE_TREINADOR.find(m => m.nivel === n)!.recompensa
    expect(de(5)).toEqual({ ouro: 625, itens: [{ itemId: 'great_ball', quantidade: 25 }] })
    expect(de(50)).toEqual({ ouro: 17500, itens: [{ itemId: 'ultra_ball', quantidade: 25 }, { itemId: 'revive', quantidade: 3 }] })
    expect(de(100).ouro).toBe(60000)
    expect(de(300)).toEqual({ ouro: 480000, itens: [{ itemId: 'ultra_ball', quantidade: 50 }, { itemId: 'max_revive', quantidade: 3 }] })
  })

  it('todo item existe no catálogo', () => {
    for (const m of MARCOS_DE_TREINADOR) for (const i of m.recompensa.itens) expect(ITEMS[i.itemId], `${m.nivel}: ${i.itemId}`).toBeTruthy()
  })

  it('pendentes são os alcançados e não coletados; próximo é o seguinte', () => {
    const s = situacaoDosMarcos(23, new Set([5]))
    expect(s.pendentes.map(m => m.nivel)).toEqual([10, 15, 20])
    expect(s.proximo?.nivel).toBe(25)
    expect(situacaoDosMarcos(4, new Set()).pendentes).toEqual([])
    expect(situacaoDosMarcos(1000, new Set()).proximo).toBeNull()
  })

  it('a soma junta ouro e itens iguais', () => {
    const s = somaDasRecompensas(situacaoDosMarcos(25, new Set()).pendentes)
    expect(s.ouro).toBe(625 + 1500 + 2625 + 4000 + 5625)
    expect(s.itens).toEqual([{ itemId: 'great_ball', quantidade: 125 }, { itemId: 'revive', quantidade: 3 }])
  })

  it('a chave gravada é a que o store lê', () => {
    expect(chaveDoNivel(5)).toBe(`${PREFIXO_DO_NIVEL}5`)
  })
})
