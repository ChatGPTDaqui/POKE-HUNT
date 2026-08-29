import { describe, expect, it } from 'vitest'

import { subirNivelEspecialidade } from './especialidadeSystem'
import { custosDoTipo, ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_TYPES } from '@/data/especialidades'
import { stoneItemId } from '@/data/stones'
import { useGameStateStore } from '@/stores/gameStateStore'

function estadoLimpo() {
  useGameStateStore.getState().resetToDefaults()
  return useGameStateStore.getState()
}

describe('subirNivelEspecialidade', () => {
  it('recusa por ouro insuficiente e nao mexe em nada', () => {
    const gameState = estadoLimpo()
    gameState.addItem(stoneItemId('FIRE'), 1000)
    useGameStateStore.setState({ wallet: { gold: 0, diamonds: 0 } })

    const resultado = subirNivelEspecialidade(useGameStateStore.getState(), 'FIRE', 'dano')

    expect(resultado).toEqual({ success: false, reason: 'insufficient_gold' })
    expect(useGameStateStore.getState().especialidades.FIRE.dano).toBe(0)
    expect(useGameStateStore.getState().items[stoneItemId('FIRE')]).toBe(1000)
  })

  it('recusa por stone insuficiente e nao gasta ouro', () => {
    const gameState = estadoLimpo()
    gameState.addGold(1_000_000)

    const ouroAntes = useGameStateStore.getState().wallet.gold
    const resultado = subirNivelEspecialidade(useGameStateStore.getState(), 'WATER', 'defesa')

    expect(resultado).toEqual({ success: false, reason: 'stone_insuficiente' })
    expect(useGameStateStore.getState().especialidades.WATER.defesa).toBe(0)
    expect(useGameStateStore.getState().wallet.gold).toBe(ouroAntes)
  })

  it('sobe um nivel e deduz exatamente o custo DO TIPO', () => {
    // PH-246: o custo passou a variar por tipo. Este caso usaria o custo de
    // outro tipo sem perceber se `subirNivelEspecialidade` ignorasse o `tipo`
    // ao consultar o preco.
    const gameState = estadoLimpo()
    const custoNivel1 = custosDoTipo('BUG')[0]
    useGameStateStore.setState({ wallet: { gold: custoNivel1.gold, diamonds: 0 } })
    gameState.addItem(stoneItemId('BUG'), custoNivel1.stoneQtd)

    const resultado = subirNivelEspecialidade(useGameStateStore.getState(), 'BUG', 'dano')

    expect(resultado).toEqual({ success: true })
    expect(useGameStateStore.getState().especialidades.BUG.dano).toBe(1)
    expect(useGameStateStore.getState().especialidades.BUG.defesa).toBe(0)
    expect(useGameStateStore.getState().wallet.gold).toBe(0)
    expect(useGameStateStore.getState().items[stoneItemId('BUG')] ?? 0).toBe(0)
  })

  it('cobra o preco do tipo pedido, e nao o de outro tipo', () => {
    // WATER custa varias vezes mais Stone que DARK. Com a Stone exata de DARK
    // em maos, subir WATER tem que ser recusado.
    const gameState = estadoLimpo()
    gameState.addGold(1_000_000)
    const custoDark = custosDoTipo('DARK')[0]
    expect(custosDoTipo('WATER')[0].stoneQtd).toBeGreaterThan(custoDark.stoneQtd)
    gameState.addItem(stoneItemId('WATER'), custoDark.stoneQtd)

    expect(subirNivelEspecialidade(useGameStateStore.getState(), 'WATER', 'dano'))
      .toEqual({ success: false, reason: 'stone_insuficiente' })
  })

  it('recusa subir alem do nivel maximo', () => {
    const gameState = estadoLimpo()
    for (const custo of custosDoTipo('GHOST')) {
      gameState.addGold(custo.gold)
      gameState.addItem(stoneItemId('GHOST'), custo.stoneQtd)
      const r = subirNivelEspecialidade(useGameStateStore.getState(), 'GHOST', 'dano')
      expect(r).toEqual({ success: true })
    }
    expect(useGameStateStore.getState().especialidades.GHOST.dano).toBe(ESPECIALIDADE_NIVEL_MAX)

    gameState.addGold(1_000_000)
    gameState.addItem(stoneItemId('GHOST'), 1_000_000)
    const resultado = subirNivelEspecialidade(useGameStateStore.getState(), 'GHOST', 'dano')

    expect(resultado).toEqual({ success: false, reason: 'nivel_maximo' })
  })

  it('dano e defesa do mesmo tipo sobem independentes', () => {
    const gameState = estadoLimpo()
    const custoNivel1 = custosDoTipo('DRAGON')[0]
    gameState.addGold(custoNivel1.gold * 2)
    gameState.addItem(stoneItemId('DRAGON'), custoNivel1.stoneQtd * 2)

    subirNivelEspecialidade(useGameStateStore.getState(), 'DRAGON', 'dano')
    subirNivelEspecialidade(useGameStateStore.getState(), 'DRAGON', 'defesa')

    expect(useGameStateStore.getState().especialidades.DRAGON).toEqual({ dano: 1, defesa: 1 })
  })

  it('TODO tipo consegue chegar ao nivel maximo nas duas trilhas', () => {
    // FLYING nao conseguia: a Pedra FLYING nao caia de lugar nenhum, entao os
    // 10 niveis eram anunciados com preco e nunca compraveis (PH-246). Aqui a
    // Stone e dada de graca — o que este caso trava e que nao existe tipo com
    // custo impossivel de satisfazer pela propria API.
    for (const tipo of ESPECIALIDADE_TYPES) {
      const gameState = estadoLimpo()
      gameState.addGold(10_000_000)
      gameState.addItem(stoneItemId(tipo), 100_000)
      for (const trilha of ['dano', 'defesa'] as const) {
        for (let n = 0; n < ESPECIALIDADE_NIVEL_MAX; n++) {
          expect(subirNivelEspecialidade(useGameStateStore.getState(), tipo, trilha), `${tipo}/${trilha}/${n}`)
            .toEqual({ success: true })
        }
      }
      expect(useGameStateStore.getState().especialidades[tipo]).toEqual({ dano: 5, defesa: 5 })
    }
  })
})
