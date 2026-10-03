import { describe, expect, it } from 'vitest'
import type { WorldEffect } from '@/engine/types'
import { CADENCIA_DO_VFX, desenharVfxDeGolpe, passoDaCoreografia, retanguloDoEfeito } from './desenharVfx'

describe('retanguloDoEfeito em area', () => {
  const alvo = { x: 100, y: 200 }, R = 175
  const bordaDeTras = alvo.y + 12 - R * 0.45

  it('cobre a borda de tras da elipse mesmo com alcance baixo', () => {
    // alcance 30 (Bubble, Charge): antes o topo era alvo.y - 30 e cortava a metade de tras.
    const r = retanguloDoEfeito(alvo, alvo, 30, R)
    expect(r.y).toBeLessThan(bordaDeTras)
    expect(r.y + r.h).toBeGreaterThan(alvo.y + 12 + R * 0.45)
  })

  it('efeito que sobe mais que a borda de tras mantem o proprio alcance', () => {
    expect(retanguloDoEfeito(alvo, alvo, 200, R).y).toBe(alvo.y - 200)
  })
})

describe('retanguloDoEfeito com margem por lado (02/10)', () => {
  it('single com margem usa cima/baixo/lados no lugar do alcance', () => {
    const r = retanguloDoEfeito({ x: 0, y: 0 }, { x: 40, y: 10 }, 200, 0, { cima: 150, baixo: 60, lados: 50 })
    expect(r).toEqual({ x: -50, y: -150, w: 40 + 100, h: 10 + 210 })
  })

  it('sem margem continua o alcance igual pros quatro lados', () => {
    expect(retanguloDoEfeito({ x: 0, y: 0 }, { x: 0, y: 0 }, 30, 0)).toEqual({ x: -30, y: -30, w: 60, h: 60 })
  })
})

describe('passoDaCoreografia: o VFX anda a 30 passos por segundo (02/10)', () => {
  const PASSO = 1000 / CADENCIA_DO_VFX

  it('nunca adianta o tempo e nunca atrasa mais que um passo', () => {
    for (const id of ['effect-1', 'effect-2']) {
      for (let ms = 0; ms < 2000; ms += 7) {
        const p = passoDaCoreografia(ms, id)
        expect(p).toBeLessThanOrEqual(ms)
        expect(ms - p).toBeLessThan(PASSO + 1e-9)
      }
    }
  })

  it('dois quadros de 60 Hz no mesmo passo pedem o MESMO desenho', () => {
    const vistos = new Set<number>()
    for (let q = 0; q < 60; q++) vistos.add(passoDaCoreografia(q * (1000 / 60), 'effect-7'))
    expect(vistos.size).toBeLessThanOrEqual(31)
    expect(vistos.size).toBeGreaterThanOrEqual(29)
  })

  it('metade dos efeitos anda com o passo deslocado: nao repintam no mesmo quadro', () => {
    const fases = new Set<number>()
    for (let i = 0; i < 20; i++) fases.add(passoDaCoreografia(1000, `effect-${i}`) % PASSO)
    expect(fases.size).toBe(2)
  })
})

describe('versao do quadro guardado', () => {
  const versoes: string[] = []
  const anota = (_d: CanvasRenderingContext2D, _r: unknown, _p: unknown, _pintar: unknown, guarda?: { versao: string }) => {
    versoes.push(guarda!.versao)
    return true
  }
  const efeito = (age: number, extra: Record<string, unknown> = {}) => ({
    id: 'effect-42', type: 'abilityEffect', x: 100, y: 100, targetX: 100, targetY: 90,
    origemX: 60, origemY: 90, anguloDeAtaque: 0, radius: 10, color: '#fff', duration: 3, delay: 0,
    age, isAoe: false, elementType: 'FIRE', abilityId: 'flamethrower',
    laneSize: 1, ownerId: null, lane: 0, ...extra,
  }) as unknown as WorldEffect

  it('posicao e angulo que mudam no meio do passo nao forcam repintura', () => {
    versoes.length = 0
    const passo = passoDaCoreografia(300, 'effect-42') / 1000
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(passo + 0.001), { pixelizar: anota as never })
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(passo + 0.002, { targetX: 104, anguloDeAtaque: 0.3 }), { pixelizar: anota as never })
    expect(versoes[0]).toBe(versoes[1])
  })

  it('o passo seguinte pede desenho novo', () => {
    versoes.length = 0
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(0.3), { pixelizar: anota as never })
    desenharVfxDeGolpe({} as CanvasRenderingContext2D, efeito(0.3 + 1 / CADENCIA_DO_VFX), { pixelizar: anota as never })
    expect(versoes[0]).not.toBe(versoes[1])
  })
})

describe('retanguloDoEfeito: margem em area (03/10)', () => {
  const alvo = { x: 100, y: 200 }, R = 100

  it('sem margem a folga alem da elipse e 20 nos tres lados', () => {
    const r = retanguloDoEfeito(alvo, alvo, 10, R)
    expect(r.x).toBe(alvo.x - R - 20)
    expect(r.y + r.h).toBe(alvo.y + 12 + R * 0.45 + 20)
  })

  it('com margem cada lado usa a sua (coreografia que passava da borda saia cortada)', () => {
    const r = retanguloDoEfeito(alvo, alvo, 10, R, { cima: 50, baixo: 30, lados: 70 })
    expect(r.x).toBe(alvo.x - R - 70)
    expect(r.w).toBe(2 * (R + 70))
    expect(r.y).toBe(alvo.y + 12 - R * 0.45 - 50)
    expect(r.y + r.h).toBe(alvo.y + 12 + R * 0.45 + 30)
  })
})
