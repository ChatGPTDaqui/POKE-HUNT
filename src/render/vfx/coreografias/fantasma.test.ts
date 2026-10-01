// GHOST no lab (01/10): ainda NAO inscrito no registro — so entra no jogo
// depois da aprovacao visual do dono. Aqui tranca o que vale desde ja.
import { describe, expect, it } from 'vitest'
import { resolverVfx } from '../resolverVfx'
import { rngSemeado } from '../aleatorio'
import { PELES } from '../paletas'
import type { EntradaDeCoreografia, Tier } from '../tipos'
import { FANTASMA_AREA, FANTASMA_SINGLE } from './fantasma'

const todas = [
  ...Object.entries(FANTASMA_SINGLE).map(([t, e]) => [`single T${t}`, Number(t) as Tier, e!, false] as const),
  ...Object.entries(FANTASMA_AREA).map(([t, e]) => [`area T${t}`, Number(t) as Tier, e!, true] as const),
]

/** Contexto 2D que grava as chamadas de desenho, pra comparar quadros. */
function gravador(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_a, k) => (...args: unknown[]) => { log.push(`${String(k)}(${args.map(v => typeof v === 'number' ? v.toFixed(3) : String(v)).join(',')})`); return { addColorStop: (o: number, c: string) => log.push(`stop(${o},${c})`) } },
    set: (_a, k, v) => { log.push(`${String(k)}=${String(v)}`); return true },
  }) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}

function quadro(e: EntradaDeCoreografia, tier: Tier, area: boolean, ms: number): string[] {
  const { ctx, log } = gravador()
  const origem = { x: 0, y: 0 }, alvo = area ? origem : { x: 46, y: 10 }
  e.desenhar({ ctx, ms, duracao: e.duracao[tier]!, origem, alvo, angulo: 0.2, raio: area ? 175 : 0, tier, pele: PELES.GHOST, rng: rngSemeado(42), pedir: n => n })
  return log
}

describe('GHOST no lab', () => {
  it('ainda cai na tira no jogo (sem aprovacao do dono)', () => {
    expect(resolverVfx({ abilityId: 'shadow_ball', area: false })).toBeNull()
  })

  it.each(todas)('%s: impactos dentro da duracao', (_n, tier, e) => {
    const impactos = e.impactos?.[tier] ?? []
    expect(impactos.length).toBeGreaterThan(0)
    for (const ms of impactos) {
      expect(ms).toBeGreaterThanOrEqual(0)
      expect(ms).toBeLessThan(e.duracao[tier]!)
    }
  })

  it.each(todas)('%s: funcao pura de ms e desenha algo no impacto', (_n, tier, e, area) => {
    const ms = (e.impactos?.[tier] ?? [0])[0] + 10
    const a = quadro(e, tier, area, ms)
    expect(a.length).toBeGreaterThan(0)
    expect(quadro(e, tier, area, ms)).toEqual(a)
  })

  it.each(todas)('%s: nada sobra depois da duracao', (_n, tier, e, area) => {
    const fim = quadro(e, tier, area, e.duracao[tier]! - 1).filter(l => /^(moveTo|arc|lineTo|ellipse)\(/.test(l))
    expect(fim.length).toBeLessThan(40)
  })
})
