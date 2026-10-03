// FIRE ligado no jogo (28/09): todo golpe de fogo de dano resolve pra
// coreografia nova, no tier certo, e os instantes de impacto cabem na duracao.
import { describe, expect, it } from 'vitest'
import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { atrasoDoNumeroDeDano } from '../desenharVfx'
import { resolverVfx } from '../resolverVfx'
import { FOGO_AREA, FOGO_SINGLE } from './fogo'

const golpesDeFogo = Object.values(ABILITIES).filter(g => g.type === 'FIRE' && isDamagingAbility(g))

describe('FIRE migrado', () => {
  it('todo golpe de dano de fogo resolve pra coreografia nova', () => {
    expect(golpesDeFogo.length).toBeGreaterThan(10) // anti-teste-vacuo
    for (const g of golpesDeFogo) {
      const r = resolverVfx({ abilityId: g.id, area: g.target === 'aoe' })
      expect(r, g.id).not.toBeNull()
      expect(r!.tipo).toBe('FIRE')
    }
  })

  it('golpe de outro tipo nao vira fogo', () => {
    // Ate 01/10 este caso dizia "continua na tira"; agora os 18 tipos sao
    // procedurais, e o que importa e o FIRE nao capturar o golpe dos outros.
    expect(resolverVfx({ abilityId: 'psychic', area: false })?.tipo).toBe('PSYCHIC')
  })

  it.each([
    ...Object.entries(FOGO_SINGLE).map(([t, e]) => [`single T${t}`, Number(t), e] as const),
    ...Object.entries(FOGO_AREA).map(([t, e]) => [`area T${t}`, Number(t), e] as const),
  ])('%s: impactos dentro da duracao', (_n, tier, e) => {
    const dur = e.duracao[tier as 1]!
    const impactos = e.impactos?.[tier as 1] ?? []
    expect(impactos.length).toBeGreaterThan(0)
    for (const ms of impactos) {
      expect(ms).toBeGreaterThanOrEqual(0)
      expect(ms).toBeLessThan(dur)
    }
  })

  it('numero de dano espera o primeiro impacto da coreografia', () => {
    expect(atrasoDoNumeroDeDano('flamethrower')).toBe(250)
    expect(atrasoDoNumeroDeDano('fire_blast')).toBe(620)
    // Critico sobe um tier visual: Flamethrower critico vira o Fire Blast.
    expect(atrasoDoNumeroDeDano('flamethrower', true)).toBe(620)
    expect(atrasoDoNumeroDeDano(undefined)).toBe(0)
  })

  it('em area o critico nao muda a espera: o efeito e um so pro cast e nao sobe de tier', () => {
    expect(atrasoDoNumeroDeDano('heat_wave', true)).toBe(atrasoDoNumeroDeDano('heat_wave', false))
  })
})
