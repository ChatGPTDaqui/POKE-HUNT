import { describe, expect, it } from 'vitest'
import { ABILITIES, getAbility } from '@/data/abilities'
import { vfxDoGolpe } from '@/data/moveVfx'
import { resolverVfx } from '../resolverVfx'
import { atrasoDoNumeroDeDano, desenharVfxDeGolpe } from '../desenharVfx'
import { retanguloDoEfeito } from '../desenharVfx'
import { rngSemeado } from '../aleatorio'
import { PELES } from '../paletas'
import { SOCOS_POR_GOLPE, PERFIS_DE_SOCO } from './socos'
import type { ContextoVfx, Tier } from '../tipos'

function quadro(id: string, ms: number, acertos = 3, angulo = 0, orcamento = 100, tier: Tier = 3) {
  const log: string[] = []
  const ctx = new Proxy({}, {
    get: (_o, k) => (...args: unknown[]) => { log.push(`${String(k)}:${args.join(',')}`) },
    set: (_o, k, v) => { log.push(`${String(k)}=${String(v)}`); return true },
  }) as CanvasRenderingContext2D
  const c: ContextoVfx = { ctx, ms, acertos, tier, duracao: SOCOS_POR_GOLPE[id].duracao[tier]!,
    origem: { x: 0, y: 0 }, alvo: { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }, angulo, raio: 0,
    pele: PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => { const k = Math.min(n, orcamento); orcamento -= k; return k } }
  SOCOS_POR_GOLPE[id].desenhar(c)
  return log
}

describe('punhos de energia', () => {
  it('cobre exatamente os punches do catálogo, exceto Bullet Punch', () => {
    const ids = Object.keys(ABILITIES).filter(id => id.split('_').includes('punch') && id !== 'bullet_punch').sort()
    expect(Object.keys(SOCOS_POR_GOLPE).sort()).toEqual(ids)
    expect(ids).toHaveLength(11)
    for (const id of ids) expect(resolverVfx({ abilityId: id, area: false })?.entrada).toBe(SOCOS_POR_GOLPE[id])
  })
  it('Bullet usa a sprite original, sem mudar arte/configuração ou atraso de número', () => {
    expect(resolverVfx({ abilityId: 'bullet_punch', area: false })).toBeNull()
    expect(resolverVfx({ abilityId: 'bullet_punch', area: false, critico: true })).toBeNull()
    expect(vfxDoGolpe('bullet_punch')?.single).toBeTruthy()
    expect(atrasoDoNumeroDeDano('bullet_punch', true)).toBe(0)
    expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D, { abilityId: 'bullet_punch' } as never)).toBe(false)
  })
  it('não transforma golpes em área ou outros golpes em socos', () => {
    expect(resolverVfx({ abilityId: 'fire_punch', area: true })?.entrada).not.toBe(SOCOS_POR_GOLPE.fire_punch)
    expect(resolverVfx({ abilityId: 'metal_claw', area: false })?.motivo).not.toBe('soco')
  })
  it.each(Object.keys(SOCOS_POR_GOLPE))('%s: determinismo, direção e desaparecimento', id => {
    const ms = PERFIS_DE_SOCO[id].contato - 20
    const a = quadro(id, ms)
    expect(a.length).toBeGreaterThan(0)
    expect(quadro(id, ms)).toEqual(a)
    for (const angulo of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .7]) {
      expect(quadro(id, ms, 3, angulo).join('|')).not.toMatch(/NaN|Infinity/)
    }
    expect(quadro(id, SOCOS_POR_GOLPE[id].duracao[3]!)).toEqual([])
  })
  it('Comet desenha só os contatos resolvidos, inclusive KO no primeiro', () => {
    expect(quadro('comet_punch', 400, 1)).toEqual([])
    expect(quadro('comet_punch', 400, 2)).toEqual([])
    expect(quadro('comet_punch', 400, 4).length).toBeGreaterThan(0)
    expect(quadro('comet_punch', 570, 5).length).toBeGreaterThan(0)
    expect(quadro('comet_punch', 700, 5)).toEqual([])
  })
  it('orçamento esgotado mantém punho mas elimina partículas opcionais', () => {
    expect(quadro('fire_punch', 110, 1, 0, 0).length).toBeGreaterThan(0)
    expect(quadro('fire_punch', 180, 1, 0, 0).length).toBeLessThan(quadro('fire_punch', 180).length)
  })
  it('crítico aumenta elaboração, não adiciona contatos', () => {
    const r = resolverVfx({ abilityId: 'mach_punch', area: false, critico: true })!
    expect(r.tier).toBe(2)
    expect(r.entrada.impactos?.[r.tier]).toEqual([100])
  })

  it('geometria cabe no retângulo em todas as direções e tiers', () => {
    for (const [id, e] of Object.entries(SOCOS_POR_GOLPE)) for (const tier of [1, 2, 3, 4] as const) {
      for (const angulo of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .7]) {
        const origem = { x: 0, y: 0 }, alvo = { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }
        const r = retanguloDoEfeito(origem, alvo, e.alcance, 0)
        for (const ms of [0, 50, 80, 120, 160, 200, 240, 440, 570]) {
          let m = [1, 0, 0, 1, 0, 0]
          const pilha: number[][] = [], pontos: number[][] = []
          const ponto = (x: number, y: number) => pontos.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
          const multiplicar = (n: number[]) => {
            const [a,b,c,d,x,y] = m
            m = [a*n[0]+c*n[1], b*n[0]+d*n[1], a*n[2]+c*n[3], b*n[2]+d*n[3], a*n[4]+c*n[5]+x, b*n[4]+d*n[5]+y]
          }
          const metodos: Record<string, (...args: number[]) => void> = {
            save: () => { pilha.push([...m]) }, restore: () => { m = pilha.pop()! },
            translate: (x,y) => multiplicar([1,0,0,1,x,y]), scale: (x,y) => multiplicar([x,0,0,y,0,0]),
            rotate: a => multiplicar([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]),
            moveTo: ponto, lineTo: ponto,
            fillRect: (x,y,w,h) => { ponto(x,y); ponto(x+w,y); ponto(x,y+h); ponto(x+w,y+h) },
            arc: (x,y,raio) => { ponto(x-raio,y-raio); ponto(x+raio,y+raio) },
            ellipse: (x,y,rx,ry) => { ponto(x-rx,y-ry); ponto(x+rx,y+ry) },
            quadraticCurveTo: (x,y,x1,y1) => { ponto(x,y); ponto(x1,y1) },
            bezierCurveTo: (x,y,x1,y1,x2,y2) => { ponto(x,y); ponto(x1,y1); ponto(x2,y2) },
          }
          const ctx = new Proxy({}, { get: (_o,k) => metodos[String(k)] ?? (() => {}), set: () => true }) as CanvasRenderingContext2D
          e.desenhar({ ctx, ms, acertos: 5, tier, duracao: e.duracao[tier]!, origem, alvo, angulo, raio: 0,
            pele: PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => n })
          if (pontos.length) {
            const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1])
            expect(Math.min(...xs), `${id} T${tier} ${ms}ms`).toBeGreaterThanOrEqual(r.x + 2)
            expect(Math.max(...xs)).toBeLessThanOrEqual(r.x + r.w - 2)
            expect(Math.min(...ys)).toBeGreaterThanOrEqual(r.y + 2)
            expect(Math.max(...ys)).toBeLessThanOrEqual(r.y + r.h - 2)
          }
          expect(pilha).toHaveLength(0)
        }
      }
    }
  })
})
