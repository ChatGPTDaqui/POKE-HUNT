// A barra de EXP e o gatilho de level-up TEM que medir a mesma coisa.
//
// Bug real que estes testes prendem: `expProgressForInstance` (a barra) media
// pela curva crua e `grantExp` subia de nivel pela curva com o multiplicador de
// +30% do POKE. A barra enchia, ficava parada em 100% e o nivel so vinha 30%
// depois — reportado como "chega a 100% e o level up nao dispara".
//
// Uma barra cheia sem level-up nao quebra nada em runtime: nao ha excecao, nao
// ha log, o jogo so parece travado. Por isso vale um teste.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { stoneItemId } from '@/data/stones'
import { useGameStateStore } from '@/stores/gameStateStore'
import { evolvePokeInstance, expProgressForInstance, grantExp } from './progressionSystem'

const rng = () => createRng(4242)

describe('progressao de POKE', () => {
  it('a barra cheia sobe de nivel: exatamente o EXP que falta basta', () => {
    const poke = createPokeInstance(rng(), 'sentret', 5)
    const species = SPECIES[poke.speciesId]
    const { into, needed } = expProgressForInstance(poke, species)

    const resultado = grantExp(poke, needed - into)
    expect(resultado.leveledUp).toBe(true)
    expect(resultado.level).toBe(poke.level + 1)
  })

  it('um ponto a menos NAO sobe de nivel (a barra chega perto, nao estoura)', () => {
    const poke = createPokeInstance(rng(), 'sentret', 5)
    const species = SPECIES[poke.speciesId]
    const { into, needed } = expProgressForInstance(poke, species)

    const resultado = grantExp(poke, needed - into - 1)
    expect(resultado.leveledUp).toBe(false)
    const depois = expProgressForInstance(resultado.poke, species)
    expect(depois.into).toBeLessThan(depois.needed)
  })

  it('a barra nunca fica em 100% ou mais depois de ganhar EXP', () => {
    // Varre uma faixa larga de niveis e de lotes de EXP: se as duas curvas
    // voltarem a divergir em qualquer ponto, `into >= needed` aparece aqui.
    for (const nivel of [1, 5, 17, 40, 63, 99]) {
      let poke = createPokeInstance(rng(), 'charmander', nivel)
      for (const lote of [1, 37, 500, 12_345]) {
        poke = grantExp(poke, lote).poke
        const { into, needed } = expProgressForInstance(poke, SPECIES[poke.speciesId])
        expect(into, `nivel ${poke.level}, lote ${lote}`).toBeLessThan(needed)
        expect(into).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

// PH-12: evolvePokeInstance nao pode debitar Stones sozinha -- o chamador
// (server: na hora, ja e a acao confirmada; client: so depois que pedirAcao
// confirmar) decide QUANDO aplicar o `stoneReq` que ela devolve.
describe('evolvePokeInstance — nao muta gameState, so calcula (PH-12)', () => {
  it('devolve stoneReq mas nao remove o item da store, mesmo com estoque suficiente', () => {
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.addItem(itemId, 20)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)

    const result = evolvePokeInstance(poke, gameState)

    expect(result).not.toBeNull()
    expect(result && 'blocked' in result).toBe(false)
    if (result && !('blocked' in result)) {
      expect(result.stoneReq).toEqual({ itemId, count: 20, type: SPECIES.kadabra.type })
      expect(result.updatedPoke.speciesId).toBe('alakazam')
    }
    // A propria chamada nao mutou nada -- 20 Stones seguem la.
    expect(useGameStateStore.getState().items[itemId]).toBe(20)
  })

  it('sem Stones suficientes: bloqueia sem tocar em nada', () => {
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.removeItem(itemId, gameState.items[itemId] || 0)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)

    const result = evolvePokeInstance(poke, gameState)

    expect(result && 'blocked' in result).toBe(true)
    expect(useGameStateStore.getState().items[itemId] || 0).toBe(0)
  })
})
