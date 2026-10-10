import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BIOMAS } from './biomas'
import { ITEMS } from './items'
import { especialidadeNiveisDefault } from './especialidades'
import { PRIMEIROS_PASSOS, aindaNaRota46, chaveDoPasso, passoCumprido, situacaoDosPassos, type EstadoDosPassos } from './primeirosPassos'
import { PREFIXO_DO_PASSO } from '@/stores/passosStore'
import { avisaSobre, FAMILIA_STATUS } from '@/components/auto/estoqueBaixo'
import type { PokeInstance } from './pokes'

const MIGRATIONS = ['public', 'dev'].map(s => ({
  schema: s,
  sql: readFileSync(`supabase/migrations/2026101012000${s === 'public' ? 0 : 1}_primeiros_passos_${s}.sql`, 'utf8'),
}))

const poke = (speciesId: string, level = 1) => ({ uid: speciesId + level, speciesId, level }) as unknown as PokeInstance

function estado(parcial: Partial<EstadoDosPassos> = {}): EstadoDosPassos {
  return {
    pokedexKills: {}, team: [poke('squirtle')], bagPokes: [], biomaProgress: {},
    missoesReivindicadas: {}, especialidades: especialidadeNiveisDefault(),
    trainer: { name: 'T', level: 1, exp: 0 }, ...parcial,
  }
}

describe('Primeiros Passos: cliente e RPC concordam', () => {
  for (const { schema, sql } of MIGRATIONS) {
    it(`a ordem da RPC (${schema}) é a do cliente`, () => {
      const ordem = sql.match(/v_ordem text\[\] := array\[([\s\S]*?)\];/)![1].match(/'(\w+)'/g)!.map(x => x.slice(1, -1))
      expect(ordem).toEqual(PRIMEIROS_PASSOS.map(p => p.id))
    })
    it(`recompensa e alvo da RPC (${schema}) batem com o cliente`, () => {
      for (const p of PRIMEIROS_PASSOS) {
        const bloco = sql.match(new RegExp(`when '${p.id}' then([\\s\\S]*?)(?=\\n    when |\\n  end case)`))?.[1]
        expect(bloco, p.id).toBeTruthy()
        expect(bloco, p.id).toContain(`v_alvo := ${p.alvo};`)
        expect(bloco, p.id).toContain(`v_ouro := ${p.recompensa.ouro};`)
        const itens = JSON.parse(bloco!.match(/v_itens := '(.*?)';/)![1])
        expect(itens, p.id).toEqual(p.recompensa.itens)
      }
    })
    it(`a lista de biomas da RPC (${schema}) é BIOMAS`, () => {
      const lista = sql.match(/v_biomas text\[\] := array\[([\s\S]*?)\];/)![1].match(/'(\w+)'/g)!.map(x => x.slice(1, -1))
      expect(lista).toEqual(BIOMAS.map(b => b.chave))
    })
    it(`a RPC (${schema}) não fica aberta ao anônimo e toca players sempre`, () => {
      expect(sql).toContain(`revoke execute on function ${schema}.reivindicar_passo(text) from anon;`)
      expect(sql).toContain(`update ${schema}.players set gold = gold + v_ouro where user_id = v_user_id;`)
      expect(sql).not.toMatch(/if v_ouro > 0 then\s+update/)
    })
  }

  it('todo item de recompensa existe no catálogo', () => {
    for (const p of PRIMEIROS_PASSOS) for (const i of p.recompensa.itens) expect(ITEMS[i.itemId], `${p.id}: ${i.itemId}`).toBeTruthy()
  })

  it('a chave gravada é a que o store lê', () => {
    expect(chaveDoPasso('')).toBe(PREFIXO_DO_PASSO)
  })
})

describe('Primeiros Passos: andamento', () => {
  it('conta nova começa no passo 1, sem nada cumprido', () => {
    const s = situacaoDosPassos(estado(), new Set())
    expect(s.atual?.id).toBe('primeiros_abates')
    expect(s.progresso).toBe(0)
    expect(s.pronto).toBe(false)
  })

  it('o passo fica pronto quando o save cumpre, e só avança depois de reivindicado', () => {
    const s = estado({ pokedexKills: { rattata: { normal: 8, shiny: 0 }, pidgey: { normal: 3, shiny: 0 } } })
    expect(situacaoDosPassos(s, new Set())).toMatchObject({ indice: 0, progresso: 10, pronto: true })
    expect(situacaoDosPassos(s, new Set(['primeiros_abates'])).atual?.id).toBe('nivel_5')
  })

  it('veterano vê o próximo passo já pronto para coletar', () => {
    const veterano = estado({ team: [poke('wartortle', 30), poke('pidgeotto', 25)], trainer: { name: 'V', level: 40, exp: 0 } })
    expect(situacaoDosPassos(veterano, new Set(['primeiros_abates'])).pronto).toBe(true)
    expect(passoCumprido('primeira_evolucao', veterano, new Set())).toBe(true)
    expect(passoCumprido('treinador_10', veterano, new Set())).toBe(true)
  })

  it('o inicial sozinho não conta como captura', () => {
    expect(passoCumprido('primeira_captura', estado(), new Set())).toBe(false)
    expect(passoCumprido('primeira_captura', estado({ bagPokes: [poke('rattata')] }), new Set())).toBe(true)
  })

  it('cadeia toda reivindicada devolve atual nulo', () => {
    expect(situacaoDosPassos(estado(), new Set(PRIMEIROS_PASSOS.map(p => p.id))).atual).toBeNull()
  })

  it('o selo de início é da Rota 46 até os 10 primeiros abates', () => {
    expect(aindaNaRota46({})).toBe(true)
    expect(aindaNaRota46({ rattata: { normal: 10, shiny: 0 } })).toBe(false)
  })
})

describe('aviso de estoque das curas de status', () => {
  it('não avisa de cura que o jogador nunca teve, e avisa depois que ele teve', () => {
    const id = `${FAMILIA_STATUS}sleep`
    expect(avisaSobre(id, 0)).toBe(false)
    expect(avisaSobre(id, 3)).toBe(true)
    expect(avisaSobre(id, 0)).toBe(true)
    expect(avisaSobre('poke_ball', 0)).toBe(true)
  })
})
