// @vitest-environment jsdom
// Brasao de ginasio: os 18 tipos tem simbolo proprio e as 5 ligas tem metal.
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { BrasaoDeGinasio, METAL_DA_LIGA, nomeDoGinasio } from './BrasaoDeGinasio'
import { FAIXAS_DE_GINASIO, TIPOS_DE_GINASIO } from '@/data/ginasios'

describe('BrasaoDeGinasio', () => {
  it('cada tipo desenha um simbolo diferente dos outros', () => {
    const desenhos = TIPOS_DE_GINASIO.map((t) => {
      const { container, unmount } = render(<BrasaoDeGinasio tipo={t} faixa={100} />)
      // Tudo depois do escudo e do reflexo e o simbolo.
      const html = [...container.querySelectorAll('svg > *')].slice(3).map((e) => e.outerHTML.replace(/fill="[^"]*"|stroke="[^"]*"/g, '')).join('')
      unmount()
      expect(html, t).not.toBe('')
      return html
    })
    expect(new Set(desenhos).size).toBe(TIPOS_DE_GINASIO.length)
  })

  it('toda liga tem metal, e o ornamento so cresce', () => {
    const ordem = ['nenhum', 'coroa', 'coroa-asas']
    let antes = 0
    for (const f of FAIXAS_DE_GINASIO) {
      const m = METAL_DA_LIGA[f.nivel]
      expect(m, String(f.nivel)).toBeTruthy()
      expect(ordem.indexOf(m.ornamento)).toBeGreaterThanOrEqual(antes)
      antes = ordem.indexOf(m.ornamento)
    }
  })

  it('nome tematico do ginasio', () => {
    expect(nomeDoGinasio('FIRE')).toBe('Ginásio das Chamas')
  })
})
