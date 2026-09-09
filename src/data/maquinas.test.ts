import { describe, expect, it } from 'vitest'
import { aceitaTm, TM_ITEMS, TMS_DROPAVEIS, sortearTm } from './maquinas'
import { SHOP_STOCK } from './items'
import { getAbility } from './abilities'
import { golpeTemEfeitoReal } from './moveDescriptions'

describe('TMs negociáveis', () => {
  it('drops são raros, deterministas e restritos à espécie derrotada', () => {
    let drops = 0
    const tipos = new Set<string>()
    for (let seed = 0; seed < 100_000; seed++) {
      const tm = sortearTm('charizard', seed)
      expect(sortearTm('magikarp', seed)).toBeNull()
      if (!tm) continue
      drops++
      tipos.add(tm.id)
      expect(aceitaTm('charizard', tm.id)).toBe(true)
      expect(sortearTm('charizard', seed)).toEqual(tm)
    }
    expect(drops).toBeGreaterThan(65)
    expect(drops).toBeLessThan(135)
    expect(tipos.size).toBeGreaterThan(15)
  })
  it('nenhuma TM pode ser comprada do NPC', () => {
    expect(SHOP_STOCK.some(s => s.itemId in TM_ITEMS)).toBe(false)
    expect(TMS_DROPAVEIS.every(tm => !('buyPrice' in tm))).toBe(true)
  })
  it('só oferece máquinas cujos golpes existem no motor', () => {
    expect(TMS_DROPAVEIS).toHaveLength(100)
    for (const tm of TMS_DROPAVEIS) {
      const golpe = getAbility(tm.golpe)!
      expect(golpe).not.toBeNull()
      expect.soft(golpe.power > 0 || golpeTemEfeitoReal(golpe), tm.golpe).toBe(true)
    }
  })
  it('valida a espécie, não apenas a existência da TM', () => {
    expect(aceitaTm('charizard', 'tm_26')).toBe(true)
    expect(aceitaTm('magikarp', 'tm_26')).toBe(false)
    expect(aceitaTm('inexistente', 'tm_26')).toBe(false)
    expect(aceitaTm('charizard', 'tm_999')).toBe(false)
  })
})
