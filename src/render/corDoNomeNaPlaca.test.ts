// PH-373: a placa acima do POKE passa a dizer a raridade pela cor do nome.
//
// Antes disso a raridade so existia em POKE do JOGADOR (borda do retrato no
// `StatusRail`, borda da miniatura em `ReservasRail`). No selvagem a placa saia
// sempre `#f1f1f6`, e nao havia como distinguir um ULTRA de um COMUM antes de
// captura-lo.
//
// O que este teste tranca sao as duas decisoes que um "melhora" futuro
// desfaria sem perceber:
//
//   - COMUM NAO pode ser pintado. `#9aa0a6` e mais escuro que o branco, e COMUM
//     e 69% dos spawns: pintar a maioria troca legibilidade por nada.
//   - SHINY nao pode perder o roxo. `#b366ff` (shiny) e `#a78bfa` (ULTRA) tem
//     distancia RGB 39 — com os dois no mesmo canal, o mais raro fica.
import { describe, expect, it } from 'vitest'
import { corDoNomeNaPlaca } from './sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'

const SHINY = '#b366ff'
const BRANCO = '#f1f1f6'

describe('corDoNomeNaPlaca (PH-373)', () => {
  it('COMUM continua no branco de sempre — pintar 69% dos spawns nao informa nada', () => {
    expect(corDoNomeNaPlaca({ rarity: 'comum' })).toBe(BRANCO)
  })

  it('sem raridade no save (POKE antigo) tambem cai no branco, e nao numa cor errada', () => {
    expect(corDoNomeNaPlaca({})).toBe(BRANCO)
    expect(corDoNomeNaPlaca({ rarity: null })).toBe(BRANCO)
    expect(corDoNomeNaPlaca({ rarity: 'chave-que-nao-existe' })).toBe(BRANCO)
  })

  it('de INCOMUM pra cima o nome sai na cor da propria raridade', () => {
    const acimaDeComum: RarityKey[] = ['incomum', 'raro', 'ultra', 'legendary', 'mythic']
    for (const key of acimaDeComum) {
      expect(corDoNomeNaPlaca({ rarity: key })).toBe(RARITIES[key].color)
    }
  })

  it('shiny ganha de toda raridade — inclusive de ULTRA, que e quase a mesma cor', () => {
    for (const key of Object.keys(RARITIES) as RarityKey[]) {
      expect(corDoNomeNaPlaca({ rarity: key, isShiny: true })).toBe(SHINY)
    }
  })

  it('nenhuma raridade acima de COMUM devolve a cor de shiny — o canal e do shiny', () => {
    const cores = (Object.keys(RARITIES) as RarityKey[])
      .map((key) => corDoNomeNaPlaca({ rarity: key }))
    expect(cores.filter((cor) => cor === SHINY)).toHaveLength(0)
  })
})
