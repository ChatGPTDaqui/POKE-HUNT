import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'
import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import { converterDadoPuro } from './dados-gerados-como-json.mts'

const pasta = join(import.meta.dirname, '..', 'src', 'data', 'generated')

function avaliar(codigo: string): Record<string, unknown> {
  const __e: Record<string, unknown> = {}
  vm.runInNewContext(codigo.replace(/^export const (\w+)\s*=/gm, '__e.$1 ='), { __e })
  return __e
}

describe('dados gerados como JSON.parse', () => {
  it('cada tabela convertida tem exatamente o mesmo valor que o literal original', async () => {
    let convertidas = 0
    for (const arquivo of readdirSync(pasta).filter((f) => f.endsWith('.generated.ts'))) {
      const { code } = await transformWithOxc(readFileSync(join(pasta, arquivo), 'utf8'), arquivo)
      const novo = converterDadoPuro(code)
      if (!novo) continue
      convertidas++
      expect(JSON.stringify(avaliar(novo)), arquivo).toBe(JSON.stringify(avaliar(code)))
    }
    // As grandes (pokes, spriteTopOffsets, elencoPorEstagio...) precisam entrar.
    expect(convertidas).toBeGreaterThanOrEqual(15)
  })

  it('recusa o que nao e dado puro', () => {
    expect(converterDadoPuro('export const A = { x: undefined }')).toBeNull()
    expect(converterDadoPuro('export const A = [1, NaN]')).toBeNull()
    expect(converterDadoPuro('export const A = new Map()')).toBeNull()
    expect(converterDadoPuro('const B = { y: 1 }\nexport const A = [B, B]')).toBeNull()
    expect(converterDadoPuro("import { X } from './x'\nexport const A = { X }")).toBeNull()
    expect(converterDadoPuro('export function f() {}')).toBeNull()
    expect(converterDadoPuro('export const A = [1, , 3]')).toBeNull()
  })

  it('converte dado puro preservando o valor', () => {
    const novo = converterDadoPuro('export const A = { "a b": [1, -2.5, "x\\u2028y", null, true] };')
    expect(novo).toContain('JSON.parse(')
    expect(avaliar(novo!).A).toEqual({ 'a b': [1, -2.5, 'x y', null, true] })
  })
})
