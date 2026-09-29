// Golpe -> tier/motivo/coreografia (spec 2026-09-28, decisoes D2, D3, D5, D7, D8).
import { describe, expect, it } from 'vitest'
import { ABILITIES, isDamagingAbility } from '@/data/abilities'
import { REGISTRO_DE_AREA, REGISTRO_DE_MOTIVO, REGISTRO_SINGLE } from './registro'
import { isolarRegistros } from './registroDeTeste'
import { motivoDoGolpe, resolverVfx, tierDoPoder } from './resolverVfx'
import type { EntradaDeCoreografia } from './tipos'

const falsa = (): EntradaDeCoreografia => ({ desenhar: () => {}, duracao: { 1: 400, 2: 600, 3: 900, 4: 1200 }, alcance: 30 })

// Registros vazios em cada teste; o real (com FIRE) volta no fim.
isolarRegistros()

describe('tierDoPoder: faixas fixas, borda cai na de baixo', () => {
  it.each([
    [40, 1], [54, 1], [55, 2], [79, 2], [80, 3], [99, 3], [100, 4], [250, 4],
  ])('single poder %i -> T%i', (poder, tier) => {
    expect(tierDoPoder(poder, false)).toBe(tier)
  })

  it.each([
    [40, 1], [64, 1], [65, 2], [99, 2], [100, 3], [150, 3],
  ])('area poder %i -> T%i', (poder, tier) => {
    expect(tierDoPoder(poder, true)).toBe(tier)
  })

  it('golpe de dano sem poder base cai no T2', () => {
    expect(tierDoPoder(0, false)).toBe(2)
    expect(tierDoPoder(0, true)).toBe(2)
  })
})

describe('motivoDoGolpe', () => {
  it.each([
    ['fire_punch', 'soco'], ['bullet_punch', 'soco'],
    ['high_jump_kick', 'chute'], ['blaze_kick', 'chute'],
    ['thunder_fang', 'mordida'], ['bite', 'mordida'], ['crunch', 'mordida'],
    ['crush_claw', 'garra'], ['scratch', 'garra'],
    ['megahorn', 'chifre'], ['horn_attack', 'chifre'],
    ['drill_peck', 'bicada'],
    ['karate_chop', 'corte'], ['slash', 'corte'],
    ['body_slam', 'investida'], ['tackle', 'investida'],
  ])('%s -> %s', (id, motivo) => {
    expect(motivoDoGolpe(id)).toBe(motivo)
  })

  it.each(['ember', 'thunderbolt', 'flamethrower', 'thorn_x', 'speck'])('%s nao tem motivo', id => {
    // Por PEDACO do id: `thorn` nao contem o pedaco `horn`.
    expect(motivoDoGolpe(id)).toBeNull()
  })
})

describe('resolverVfx', () => {
  it('registro vazio -> todo golpe segue na tira', () => {
    // Guarda da migracao: tipo nao inscrito nao muda um pixel.
    for (const id of Object.keys(ABILITIES)) {
      expect(resolverVfx({ abilityId: id, area: ABILITIES[id].target === 'aoe' })).toBeNull()
    }
  })

  it('tipo migrado resolve no tier do poder', () => {
    REGISTRO_SINGLE.FIRE = { 3: falsa() }
    const r = resolverVfx({ abilityId: 'flamethrower', area: false })
    expect(r).toMatchObject({ tipo: 'FIRE', tier: 3, area: false, motivo: null })
  })

  it('critico sobe um tier, com teto 4 no single e 3 na area', () => {
    REGISTRO_SINGLE.FIRE = { 3: falsa(), 4: falsa() }
    expect(resolverVfx({ abilityId: 'flamethrower', area: false, critico: true })?.tier).toBe(4)
    expect(resolverVfx({ abilityId: 'fire_blast', area: false, critico: true })?.tier).toBe(4)
    REGISTRO_DE_AREA.FIRE = { 3: falsa() }
    expect(resolverVfx({ abilityId: 'eruption', area: true, critico: true })?.tier).toBe(3)
  })

  it('golpe de status nunca resolve, nem com o tipo migrado (D8)', () => {
    REGISTRO_SINGLE.NORMAL = { 1: falsa(), 2: falsa(), 3: falsa(), 4: falsa() }
    REGISTRO_DE_AREA.NORMAL = { 1: falsa(), 2: falsa(), 3: falsa() }
    expect(resolverVfx({ abilityId: 'growl', area: true })).toBeNull()
  })

  it('golpe desconhecido ou sem id nao resolve', () => {
    REGISTRO_SINGLE.FIRE = { 3: falsa() }
    expect(resolverVfx({ abilityId: 'nao_existe', area: false })).toBeNull()
    expect(resolverVfx({ area: false })).toBeNull()
  })

  it('motivo inscrito manda, mesmo com o tipo ainda nao migrado (D5)', () => {
    REGISTRO_DE_MOTIVO.soco = falsa()
    expect(resolverVfx({ abilityId: 'thunder_punch', area: false })).toMatchObject({ motivo: 'soco', tipo: 'ELECTRIC' })
  })

  it('motivo sem coreografia cai na do tipo', () => {
    REGISTRO_SINGLE.FIRE = { 2: falsa(), 3: falsa() }
    expect(resolverVfx({ abilityId: 'fire_punch', area: false })).toMatchObject({ motivo: null, tipo: 'FIRE' })
  })

  it('area ignora motivo', () => {
    REGISTRO_DE_MOTIVO.corte = falsa()
    expect(resolverVfx({ abilityId: 'razor_wind', area: true })).toBeNull()
  })

  it('golpe de dano sem poder base resolve no T2', () => {
    REGISTRO_DE_AREA.GROUND = { 2: falsa() }
    expect(resolverVfx({ abilityId: 'magnitude', area: true })?.tier).toBe(2)
  })

  it('todo golpe de dano do catalogo cai num tier valido', () => {
    const danos = Object.values(ABILITIES).filter(isDamagingAbility)
    expect(danos.length).toBeGreaterThan(250) // anti-teste-vacuo
    for (const g of danos) {
      const area = g.target === 'aoe'
      const t = tierDoPoder(g.power, area)
      expect(t).toBeGreaterThanOrEqual(1)
      expect(t).toBeLessThanOrEqual(area ? 3 : 4)
    }
  })
})
