// Divisorias da barra de HP por quantidade de vida, estilo LoL (23/11/2026).
import { describe, expect, it } from 'vitest'
import { divisoriasDoHp, BLOCO_DO_HP, UNIDADE_DO_HP } from './divisoriasDoHp'

describe('divisorias da barra de HP', () => {
  it('quanto mais HP, mais riscos', () => {
    const pouco = divisoriasDoHp(60, 140).length
    const muito = divisoriasDoHp(300, 140).length
    expect(pouco).toBe(2)
    expect(muito).toBeGreaterThan(pouco)
  })

  it('risco fino a cada 25 HP, forte a cada 100', () => {
    const riscos = divisoriasDoHp(300, 140)
    expect(riscos).toHaveLength(300 / UNIDADE_DO_HP - 1)
    expect(riscos.filter((r) => r.forte).map((r) => Math.round(r.posicao * 300))).toEqual([BLOCO_DO_HP, 200])
  })

  it('barra pequena com HP alto: o fino vira 50 HP; nada fica colado', () => {
    const riscos = divisoriasDoHp(700, 32)
    expect(riscos).toHaveLength(13) // 50, 100, ..., 650
    expect(riscos.filter((r) => r.forte)).toHaveLength(6)
    for (let k = 1; k < riscos.length; k++) expect((riscos[k].posicao - riscos[k - 1].posicao) * 32).toBeGreaterThanOrEqual(2)
  })

  // Na troca de degrau (25 -> 50 HP, perto de 400 HP na barra de 32 px) o total
  // de riscos finos cai, mas os FORTES — os blocos de 100 que o olho conta —
  // nunca diminuem com mais vida.
  it('na barra pequena do campo, mais HP nunca mostra menos blocos de 100', () => {
    let anterior = 0
    for (let hp = 30; hp <= 700; hp += 5) {
      const fortes = divisoriasDoHp(hp, 32).filter((r) => r.forte).length
      expect(fortes, `${hp} HP`).toBeGreaterThanOrEqual(anterior)
      anterior = fortes
    }
    expect(divisoriasDoHp(600, 32).length).toBeGreaterThan(divisoriasDoHp(175, 32).length)
  })

  it('HP abaixo de 25 nao tem risco; entradas invalidas nao quebram', () => {
    expect(divisoriasDoHp(20, 32)).toEqual([])
    expect(divisoriasDoHp(0, 32)).toEqual([])
    expect(divisoriasDoHp(100, 0)).toEqual([])
  })
})
