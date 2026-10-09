import { describe, expect, it } from 'vitest'
import { getAbility } from '@/data/abilities'
import { retanguloDoEfeito } from '../desenharVfx'
import { rngSemeado } from '../aleatorio'
import { PELES } from '../paletas'
import { resolverVfx } from '../resolverVfx'
import { INVESTIDAS_POR_GOLPE, PERFIS_DE_INVESTIDA } from './investidas'
import type { ContextoVfx, Tier } from '../tipos'

const IDS = ['tackle', 'quick_attack', 'extreme_speed', 'take_down', 'double_edge', 'body_slam', 'giga_impact',
  'high_horsepower', 'last_resort', 'retaliate', 'chip_away', 'facade', 'return', 'frustration', 'strength',
  'heavy_slam', 'u_turn', 'acrobatics']
const contato = (id: string) => PERFIS_DE_INVESTIDA[id].preparo + PERFIS_DE_INVESTIDA[id].viagem

function quadro(id: string, ms: number, angulo = 0, orcamento = 100, tier: Tier = 3) {
  const log: string[] = []
  const ctx = new Proxy({}, {
    get: (_o, k) => (...args: unknown[]) => { log.push(`${String(k)}:${args.join(',')}`) },
    set: (_o, k, v) => { log.push(`${String(k)}=${String(v)}`); return true },
  }) as CanvasRenderingContext2D
  const c: ContextoVfx = { ctx, ms, tier, duracao: INVESTIDAS_POR_GOLPE[id].duracao[tier]!,
    origem: { x: 0, y: 0 }, alvo: { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }, angulo, raio: 0,
    pele: PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => { const k = Math.min(n, orcamento); orcamento -= k; return k } }
  INVESTIDAS_POR_GOLPE[id].desenhar(c)
  return log
}

describe('família Investida', () => {
  it('cobre os dezoito golpes de investida do catálogo, todos de dano em alvo único', () => {
    expect(Object.keys(INVESTIDAS_POR_GOLPE).sort()).toEqual([...IDS].sort())
    for (const id of IDS) {
      const g = getAbility(id)!
      expect(g.category, id).not.toBe('status')
      expect(g.target, id).toBe('single')
    }
  })

  it('ainda fora do registro: o jogo segue no efeito do tipo até a aprovação do dono', () => {
    for (const id of IDS) expect(resolverVfx({ abilityId: id, area: false })?.entrada).not.toBe(INVESTIDAS_POR_GOLPE[id])
  })

  it.each(IDS)('%s: determinismo, sem NaN em qualquer direção e nada depois da duração', id => {
    const ms = contato(id) + 30
    const a = quadro(id, ms)
    expect(a.length).toBeGreaterThan(0)
    expect(quadro(id, ms)).toEqual(a)
    for (const angulo of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .7]) {
      expect(quadro(id, ms, angulo).join('|')).not.toMatch(/NaN|Infinity/)
    }
    expect(quadro(id, INVESTIDAS_POR_GOLPE[id].duracao[3]!)).toEqual([])
    expect(quadro(id, -1)).toEqual([])
  })

  it('o número de dano sai quando a proa bate', () => {
    for (const id of IDS) {
      const e = INVESTIDAS_POR_GOLPE[id]
      for (const t of [1, 2, 3, 4] as const) expect(e.impactos?.[t]).toEqual([contato(id)])
    }
  })

  it('orçamento zerado mantém a proa e corta só as partículas', () => {
    const id = 'giga_impact', ms = contato(id) + 40
    expect(quadro(id, ms, 0, 0).length).toBeGreaterThan(0)
    expect(quadro(id, ms, 0, 0).length).toBeLessThan(quadro(id, ms).length)
  })

  it('geometria cabe no retângulo em todas as direções e tiers', () => {
    for (const [id, e] of Object.entries(INVESTIDAS_POR_GOLPE)) for (const tier of [1, 2, 3, 4] as const) {
      for (const angulo of [0, Math.PI / 2, Math.PI, -Math.PI / 2, .7]) {
        const origem = { x: 0, y: 0 }, alvo = { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }
        const r = retanguloDoEfeito(origem, alvo, e.alcance, 0, e.margem)
        for (let ms = 0; ms < e.duracao[tier]!; ms += 20) {
          let m = [1, 0, 0, 1, 0, 0]
          const pilha: number[][] = [], pontos: number[][] = []
          const ponto = (x: number, y: number) => pontos.push([m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
          const multiplicar = (n: number[]) => {
            const [a, b, c, d, x, y] = m
            m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3], a * n[4] + c * n[5] + x, b * n[4] + d * n[5] + y]
          }
          const metodos: Record<string, (...args: number[]) => void> = {
            save: () => { pilha.push([...m]) }, restore: () => { m = pilha.pop()! },
            translate: (x, y) => multiplicar([1, 0, 0, 1, x, y]), scale: (x, y) => multiplicar([x, 0, 0, y, 0, 0]),
            rotate: a => multiplicar([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]),
            moveTo: ponto, lineTo: ponto,
            fillRect: (x, y, w, h) => { ponto(x, y); ponto(x + w, y); ponto(x, y + h); ponto(x + w, y + h) },
            arc: (x, y, raio) => { ponto(x - raio, y - raio); ponto(x + raio, y + raio) },
            ellipse: (x, y, rx, ry) => { ponto(x - rx, y - ry); ponto(x + rx, y + ry) },
            quadraticCurveTo: (x, y, x1, y1) => { ponto(x, y); ponto(x1, y1) },
            bezierCurveTo: (x, y, x1, y1, x2, y2) => { ponto(x, y); ponto(x1, y1); ponto(x2, y2) },
          }
          const ctx = new Proxy({}, { get: (_o, k) => metodos[String(k)] ?? (() => {}), set: () => true }) as CanvasRenderingContext2D
          e.desenhar({ ctx, ms, tier, duracao: e.duracao[tier]!, origem, alvo, angulo, raio: 0,
            pele: PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => n })
          if (pontos.length) {
            const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1])
            expect(Math.min(...xs), `${id} T${tier} ${ms}ms`).toBeGreaterThanOrEqual(r.x + 2)
            expect(Math.max(...xs), `${id} T${tier} ${ms}ms`).toBeLessThanOrEqual(r.x + r.w - 2)
            expect(Math.min(...ys), `${id} T${tier} ${ms}ms`).toBeGreaterThanOrEqual(r.y + 2)
            expect(Math.max(...ys), `${id} T${tier} ${ms}ms`).toBeLessThanOrEqual(r.y + r.h - 2)
          }
          expect(pilha).toHaveLength(0)
        }
      }
    }
  })
})
