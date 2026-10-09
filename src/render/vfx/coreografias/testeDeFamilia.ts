// Bateria comum das famílias de golpes (09/10): cada família chama
// `testarFamilia` no seu .test.ts. Garante o mesmo contrato pra todas —
// determinismo, sem NaN em qualquer direção, nada depois da duração, impacto
// declarado, orçamento zerado sem quebrar e geometria dentro do retângulo que
// o pixelizador varre (o que passa dele sai cortado na tela).
import { describe, expect, it } from 'vitest'
import { getAbility } from '@/data/abilities'
import { retanguloDoEfeito } from '../desenharVfx'
import { rngSemeado } from '../aleatorio'
import { PELES } from '../paletas'
import { resolverVfx } from '../resolverVfx'
import type { ContextoVfx, EntradaDeCoreografia, Tier } from '../tipos'

const RAIO_DA_AREA = 175
const DIRECOES = [0, Math.PI / 2, Math.PI, -Math.PI / 2, .7]

interface Opcoes {
  /** Golpes da família, na ordem do plano. */
  ids: readonly string[]
  golpes: Record<string, EntradaDeCoreografia>
  /** Golpes de área da família (desenhados com raio). */
  area?: Record<string, EntradaDeCoreografia>
  /** true quando a família já está inscrita no registro (resolver devolve ela). */
  inscrita: boolean
}

function pontosDoQuadro(e: EntradaDeCoreografia, id: string, ms: number, tier: Tier, angulo: number, raio: number) {
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
    arc: (x, y, r) => { ponto(x - r, y - r); ponto(x + r, y + r) },
    ellipse: (x, y, rx, ry) => { ponto(x - rx, y - ry); ponto(x + rx, y + ry) },
    quadraticCurveTo: (x, y, x1, y1) => { ponto(x, y); ponto(x1, y1) },
    bezierCurveTo: (x, y, x1, y1, x2, y2) => { ponto(x, y); ponto(x1, y1); ponto(x2, y2) },
  }
  const ctx = new Proxy({}, { get: (_o, k) => metodos[String(k)] ?? (() => {}), set: () => true }) as CanvasRenderingContext2D
  const origem = { x: 0, y: 0 }
  const alvo = raio ? origem : { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }
  e.desenhar({ ctx, ms, acertos: 3, tier, duracao: e.duracao[tier]!, origem, alvo, angulo, raio,
    pele: e.pele ?? PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => n })
  return { pontos, pilha, origem, alvo }
}

function log(e: EntradaDeCoreografia, id: string, ms: number, angulo = 0, orcamento = 100, raio = 0) {
  const saida: string[] = []
  const ctx = new Proxy({}, {
    get: (_o, k) => (...args: unknown[]) => { saida.push(`${String(k)}:${args.join(',')}`) },
    set: (_o, k, v) => { saida.push(`${String(k)}=${String(v)}`); return true },
  }) as CanvasRenderingContext2D
  const tier: Tier = raio ? 2 : 3
  const c: ContextoVfx = { ctx, ms, acertos: 3, tier, duracao: e.duracao[tier]!,
    origem: { x: 0, y: 0 }, alvo: raio ? { x: 0, y: 0 } : { x: Math.cos(angulo) * 46, y: Math.sin(angulo) * 46 }, angulo, raio,
    pele: e.pele ?? PELES[getAbility(id)!.type], rng: rngSemeado(42), pedir: n => { const k = Math.min(n, orcamento); orcamento -= k; return k } }
  e.desenhar(c)
  return saida
}

export function testarFamilia(nome: string, o: Opcoes): void {
  const todos = { ...o.golpes, ...(o.area ?? {}) }
  describe(`família ${nome}`, () => {
    it('cobre exatamente os golpes do plano, de dano, com o alvo certo', () => {
      expect(Object.keys(todos).sort()).toEqual([...o.ids].sort())
      for (const id of o.ids) {
        const g = getAbility(id)
        expect(g, id).toBeTruthy()
        expect(g!.category, id).not.toBe('status')
        expect(g!.target === 'single', id).toBe(!o.area?.[id])
      }
    })

    it(o.inscrita ? 'inscrita: o resolver devolve o efeito próprio' : 'fora do registro: o jogo segue no efeito do tipo', () => {
      for (const id of o.ids) {
        const area = !!o.area?.[id]
        const r = resolverVfx({ abilityId: id, area })?.entrada
        if (o.inscrita) expect(r, id).toBe(todos[id])
        else expect(r, id).not.toBe(todos[id])
      }
    })

    it.each([...o.ids])('%s: determinismo, sem NaN, impacto declarado e nada fora da duração', id => {
      const e = todos[id], raio = o.area?.[id] ? RAIO_DA_AREA : 0
      const tier: Tier = raio ? 2 : 3
      const impactos = e.impactos?.[tier] ?? []
      expect(impactos.length, id).toBeGreaterThan(0)
      const ms = impactos[0] + 30
      const a = log(e, id, ms, 0, 100, raio)
      expect(a.length).toBeGreaterThan(0)
      expect(log(e, id, ms, 0, 100, raio)).toEqual(a)
      for (const angulo of DIRECOES) expect(log(e, id, ms, angulo, 100, raio).join('|')).not.toMatch(/NaN|Infinity/)
      expect(log(e, id, e.duracao[tier]!, 0, 100, raio)).toEqual([])
      expect(log(e, id, -1, 0, 100, raio)).toEqual([])
      // Orçamento zerado: só cortes, nunca erro.
      expect(() => log(e, id, ms, 0, 0, raio)).not.toThrow()
      for (const t of [1, 2, 3, 4] as const) if (e.duracao[t]) for (const i of e.impactos?.[t] ?? []) expect(i).toBeLessThan(e.duracao[t]!)
    })

    it('geometria cabe no retângulo do pixelizador em todas as direções e tiers', () => {
      for (const [id, e] of Object.entries(todos)) {
        const raio = o.area?.[id] ? RAIO_DA_AREA : 0
        for (const tier of (raio ? [1, 2, 3] : [1, 2, 3, 4]) as Tier[]) {
          const dur = e.duracao[tier]
          if (!dur) continue
          for (const angulo of raio ? [0] : DIRECOES) {
            for (let ms = 0; ms < dur; ms += 20) {
              const { pontos, pilha, origem, alvo } = pontosDoQuadro(e, id, ms, tier, angulo, raio)
              const r = retanguloDoEfeito(origem, alvo, e.alcance, raio, e.margem)
              expect(pilha, `${id} pilha`).toHaveLength(0)
              if (!pontos.length) continue
              const xs = pontos.map(p => p[0]), ys = pontos.map(p => p[1])
              const onde = `${id} T${tier} ${ms}ms ang ${angulo.toFixed(2)}`
              expect(Math.min(...xs), onde).toBeGreaterThanOrEqual(r.x + 1)
              expect(Math.max(...xs), onde).toBeLessThanOrEqual(r.x + r.w - 1)
              expect(Math.min(...ys), onde).toBeGreaterThanOrEqual(r.y + 1)
              expect(Math.max(...ys), onde).toBeLessThanOrEqual(r.y + r.h - 1)
            }
          }
        }
      }
    })
  })
}
