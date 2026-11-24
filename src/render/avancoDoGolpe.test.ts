// Investida do golpe pelas marcas do PMD (RushFrame/HitFrame/ReturnFrame).
import { describe, expect, it } from 'vitest'
import { avancoDoGolpe, fracaoDaInvestida, AVANCO_DA_POSE } from './avancoDoGolpe'
import { INVESTIDA_DO_ATAQUE } from '@/data/generated/investidaDoAtaque.generated'
import { APICE_DO_ATAQUE } from '@/data/generated/apiceDoAtaque.generated'
import { BATTLE_SPRITE_ANIMS } from '@/data/battleSpriteAnims'

describe('fracao da investida', () => {
  // Charizard, Attack: 11 quadros de 2/2/2/2/4/1/1/...; rush 2, hit 5, return 8.
  const duracoes = [2, 2, 2, 2, 4, 1, 1, 2, 2, 2, 2]
  it('parado ate o RushFrame, avanca ate o apice, segura, volta do ReturnFrame ao fim', () => {
    expect(fracaoDaInvestida(duracoes, 2, 5, 8, 0)).toBe(0)
    expect(fracaoDaInvestida(duracoes, 2, 5, 8, 3.9)).toBe(0)
    const meio = fracaoDaInvestida(duracoes, 2, 5, 8, 8)
    expect(meio).toBeGreaterThan(0)
    expect(meio).toBeLessThan(1)
    expect(fracaoDaInvestida(duracoes, 2, 5, 8, 12)).toBe(1) // apice
    expect(fracaoDaInvestida(duracoes, 2, 5, 8, 14)).toBe(1) // entre apice e retorno
    expect(fracaoDaInvestida(duracoes, 2, 5, 8, 22)).toBe(0) // fim da pose
  })
})

describe('investida na tela', () => {
  const corpo = (pose: 'Attack' | 'Shoot', quadro: number) => ({
    poke: { speciesId: 'charizard' },
    battleAnim: { name: pose, durations: BATTLE_SPRITE_ANIMS.charizard[pose]!.durations },
    animFrame: quadro, animElapsed: 0, attackAnimTimer: 0.3, facing: { x: 1, y: 0 },
  })

  it('o acervo do Charizard marca a investida do Attack', () => {
    expect(INVESTIDA_DO_ATAQUE.charizard?.Attack).toEqual([2, 8])
    expect(APICE_DO_ATAQUE.charizard?.Attack).toBe(5)
  })

  it('no apice, avanca a distancia da pose na direcao do alvo', () => {
    expect(avancoDoGolpe(corpo('Attack', 5), false).dx).toBeCloseTo(AVANCO_DA_POSE.Attack!)
    expect(avancoDoGolpe(corpo('Attack', 0), false).dx).toBe(0)
  })

  it('pose de soltar (Shoot) fica no lugar; movimento reduzido tambem', () => {
    expect(avancoDoGolpe(corpo('Shoot', 2), false)).toEqual({ dx: 0, dy: 0 })
    expect(avancoDoGolpe(corpo('Attack', 5), true)).toEqual({ dx: 0, dy: 0 })
  })

  it('fora da pose de golpe nao investe', () => {
    expect(avancoDoGolpe({ ...corpo('Attack', 5), attackAnimTimer: 0 }, false)).toEqual({ dx: 0, dy: 0 })
  })
})
