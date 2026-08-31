// O mesmo destino nunca pode aparecer na barra E na grade do "Mais": os dois
// lugares somam badge de pendencia, entao a duplicata faz o jogador ver "2
// pendencias" quando ha uma. Nao lanca, nao quebra render — so mente.
//
// Desde que a barra virou 8 slots fixos, Pokedex e Mercado moram nela nos tres
// regimes; o risco de duplicata deixou de depender de largura de tela e passou
// a depender so desta lista nao sair de sincronia com a grade.
//
// PH-257: agora sao TRES lugares (barra, coluna do canto direito, grade do
// "Mais"), e a mesma regra vale pros tres.
import { describe, expect, it } from 'vitest'
import { destinosDaGrade, TELAS_NA_BARRA } from './ActionDock'
import { TELAS_NA_COLUNA } from './ColunaDeAtalhos'

describe('destinos da barra e da grade', () => {
  it('a barra cobre os cinco destinos de tela fixos', () => {
    expect([...TELAS_NA_BARRA].sort()).toEqual(
      ['equipe', 'loja', 'mercado', 'mochila', 'pokedex'],
    )
  })

  it('nada que esta na barra reaparece na grade do Mais', () => {
    for (const d of destinosDaGrade()) {
      expect(TELAS_NA_BARRA.has(d.screen)).toBe(false)
    }
  })

  it('nada que esta na coluna do canto direito reaparece na grade (PH-257)', () => {
    const naGrade = destinosDaGrade().map((d) => d.screen)
    for (const { screen } of TELAS_NA_COLUNA) {
      expect(naGrade, `${screen} esta em dois lugares`).not.toContain(screen)
    }
  })

  it('a grade nao repete destino nem perde nenhum pelo caminho', () => {
    const telas = destinosDaGrade().map((d) => d.screen)
    expect(new Set(telas).size).toBe(telas.length)
    // Bestiario, Especialidades e Tasks sairam daqui na PH-257: os tres ganharam
    // lugar fixo na coluna do canto superior direito.
    //
    // Troca entrou na PH-314, logo depois do Correio: as duas sao as telas
    // "com outro jogador do outro lado", e e do Correio que o convite costuma
    // sair.
    expect(telas).toEqual(
      ['correio', 'troca', 'calc', 'ranking', 'wiki', 'tutoriais', 'config'],
    )
  })
})
