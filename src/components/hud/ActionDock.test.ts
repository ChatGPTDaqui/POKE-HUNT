// O mesmo destino nunca pode aparecer na barra E na grade do "Mais": os dois
// lugares somam badge de pendencia, entao a duplicata faz o jogador ver "2
// pendencias" quando ha uma. Nao lanca, nao quebra render — so mente.
import { describe, expect, it } from 'vitest'
import { destinosPorRegime } from './ActionDock'

describe('destinosPorRegime', () => {
  it('no compacto nada e promovido: tudo mora no Mais', () => {
    const { promovidos, naGrade } = destinosPorRegime(true)
    expect(promovidos).toHaveLength(0)
    expect(naGrade.map((d) => d.screen)).toContain('pokedex')
    expect(naGrade.map((d) => d.screen)).toContain('mercado')
  })

  it('no amplo os promovidos SAEM da grade', () => {
    const { promovidos, naGrade } = destinosPorRegime(false)
    expect(promovidos.length).toBeGreaterThan(0)
    for (const d of promovidos) {
      expect(naGrade).not.toContain(d)
      expect(naGrade.map((x) => x.screen)).not.toContain(d.screen)
    }
  })

  it('nenhum regime perde um destino pelo caminho', () => {
    for (const compacto of [true, false]) {
      const { promovidos, naGrade } = destinosPorRegime(compacto)
      const telas = [...promovidos, ...naGrade].map((d) => d.screen)
      expect(new Set(telas).size).toBe(telas.length)
      expect(telas).toHaveLength(10)
    }
  })
})
