// Pose de golpe por familia (18/10/2026): cada golpe toca a pose mais fiel que
// a especie tem, e cai na pose de sempre quando ela nao tem nenhuma.
import { describe, expect, it } from 'vitest'

import { getAbility, type Ability } from './abilities'
import { BATTLE_SPRITE_ANIMS } from './battleSpriteAnims'
import { familiaDoGolpe, POSES_DA_FAMILIA, poseDoGolpe } from './poseDoGolpe'
import { tempoDoGolpe } from '@/engine/tempoDoGolpe'

const g = (id: string): Ability => {
  const a = getAbility(id)
  if (!a) throw new Error(`golpe ausente: ${id}`)
  return a
}

describe('pose do golpe', () => {
  it('chute usa Kick em quem tem a arte (Hitmonlee)', () => {
    expect(BATTLE_SPRITE_ANIMS.hitmonlee?.Kick).toBeDefined()
    expect(poseDoGolpe('hitmonlee', g('double_kick'), false)).toBe('Kick')
    expect(poseDoGolpe('hitmonlee', g('double_kick'), true)).toBe('Kick')
  })

  it('soco usa Punch em quem tem (Hitmonchan) e Strike em quem so tem a generica', () => {
    expect(poseDoGolpe('hitmonchan', g('fire_punch'), false)).toBe('Punch')
    expect(BATTLE_SPRITE_ANIMS.rattata?.Punch).toBeUndefined()
    expect(BATTLE_SPRITE_ANIMS.rattata?.Strike).toBeDefined()
    expect(poseDoGolpe('rattata', g('mega_punch'), false)).toBe('Strike')
  })

  it('sem nenhuma pose da familia, vale a de sempre do modo', () => {
    expect(BATTLE_SPRITE_ANIMS.geodude?.Strike).toBeUndefined()
    // Geodude tem Punch: soco fica no Punch.
    expect(poseDoGolpe('geodude', g('mega_punch'), false)).toBe('Punch')
    // Contato sem Strike: Shoot no livre, Attack no duelo.
    expect(poseDoGolpe('geodude', g('tackle'), false)).toBe('Shoot')
    expect(poseDoGolpe('geodude', g('tackle'), true)).toBe('Attack')
  })

  it('fisico a distancia nao vira estocada de contato', () => {
    expect(familiaDoGolpe(g('razor_leaf'))).toBe('padrao')
    expect(poseDoGolpe('bulbasaur', g('razor_leaf'), false)).toBe(g('razor_leaf').target === 'aoe' ? 'Charge' : 'Shoot')
  })

  it('especial em area continua canalizando no Charge', () => {
    expect(poseDoGolpe('charmander', g('heat_wave'), false)).toBe('Charge')
  })

  it('toda pose de toda familia e um nome que o acervo usa', () => {
    const conhecidas = new Set(Object.values(BATTLE_SPRITE_ANIMS).flatMap((s) => Object.keys(s)))
    for (const poses of Object.values(POSES_DA_FAMILIA)) for (const p of poses) expect(conhecidas.has(p), p).toBe(true)
  })

  it('a pose escolhida e a que o tempo do golpe mede (apice da arte que toca)', () => {
    const pose = poseDoGolpe('hitmonlee', g('double_kick'), false)
    const t = tempoDoGolpe('hitmonlee', pose, 'double_kick')
    const arte = BATTLE_SPRITE_ANIMS.hitmonlee![pose]!
    const duracao = arte.durations.reduce((s, d) => s + d, 0) / 60
    expect(t.pose).toBeCloseTo(duracao, 5)
    expect(t.apice).toBeLessThanOrEqual(duracao)
  })
})
