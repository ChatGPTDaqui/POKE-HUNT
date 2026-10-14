import { describe, expect, it } from 'vitest'
import { CATALOGO_DE_CONQUISTAS } from '@/data/generated/conquistas.generated'
import type { ConquistaDaTela } from '@/data/conquistas'
import { nivelDaMoldura, resumoDaPlatina, textoDoProgresso } from './resumoDeConquistas'

const c = (id: string, nivel: ConquistaDaTela['nivel'], secreta = false, pontos = 10): ConquistaDaTela => ({
  id, nome: id, descricao: '', categoria: 'cacada', nivel, pontos, secreta, ordem: 1, ref: null, alvo: 1, unidade: null,
})

describe('resumoDaPlatina', () => {
  it('platina conta secretas e nao conta impossiveis (mesma regra do SQL)', () => {
    const catalogo = [c('a', 'bronze'), c('b', 'ouro', true), c('x', 'impossivel'), c('p', 'platina')]
    const r = resumoDaPlatina(catalogo, { a: '2026-10-14' })
    expect(r.total).toBe(2)
    expect(r.feitas).toBe(1)
    expect(r.secretasFaltando).toBe(1)
    expect(r.lendasTotal).toBe(1)
    expect(r.lendasFeitas).toBe(0)
  })

  it('pontos somam so o que o jogador tem', () => {
    const r = resumoDaPlatina([c('a', 'bronze', false, 10), c('b', 'ouro', false, 75)], { b: 'x' })
    expect(r.pontos).toBe(75)
  })

  it('o catalogo real tem uma platina alcancavel', () => {
    const r = resumoDaPlatina(CATALOGO_DE_CONQUISTAS, {})
    expect(r.total).toBeGreaterThan(100)
    expect(r.feitas).toBe(0)
  })
})

describe('textoDoProgresso', () => {
  it('numero com separador de milhar e travado no alvo', () => {
    expect(textoDoProgresso({ alvo: 10000, unidade: null }, 2500)).toBe('2.500 / 10.000')
    expect(textoDoProgresso({ alvo: 100, unidade: null }, 150)).toBe('100 / 100')
  })

  it('conquista de tempo em minutos e horas', () => {
    expect(textoDoProgresso({ alvo: 3600, unidade: 'tempo' }, 1800)).toBe('30 min / 1 h')
    expect(textoDoProgresso({ alvo: 360000, unidade: 'tempo' }, 9000)).toBe('2,5 h / 100 h')
  })
})

describe('nivelDaMoldura', () => {
  it('segue os degraus de 25/50/75% e a platina', () => {
    expect(nivelDaMoldura(10, 100, false)).toBeNull()
    expect(nivelDaMoldura(25, 100, false)).toBe('bronze')
    expect(nivelDaMoldura(50, 100, false)).toBe('prata')
    expect(nivelDaMoldura(75, 100, false)).toBe('ouro')
    expect(nivelDaMoldura(75, 100, true)).toBe('platina')
    expect(nivelDaMoldura(0, 0, false)).toBeNull()
  })
})
