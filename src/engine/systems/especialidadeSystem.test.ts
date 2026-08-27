import { describe, expect, it } from 'vitest'

import { subirNivelEspecialidade } from './especialidadeSystem'
import { ESPECIALIDADE_CUSTOS, ESPECIALIDADE_NIVEL_MAX } from '@/data/especialidades'
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
    // Sem addGold: so os 1000 do default, abaixo do custo do nivel 1 (500)? Nao —
    // 1000 >= 500. Zera a carteira pra garantir insuficiencia de verdade.
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

  it('sobe um nivel e deduz exatamente o custo do nivel atual', () => {
    const gameState = estadoLimpo()
    const custoNivel1 = ESPECIALIDADE_CUSTOS[0]
    useGameStateStore.setState({ wallet: { gold: custoNivel1.gold, diamonds: 0 } })
    gameState.addItem(stoneItemId('BUG'), custoNivel1.stoneQtd)

    const resultado = subirNivelEspecialidade(useGameStateStore.getState(), 'BUG', 'dano')

    expect(resultado).toEqual({ success: true })
    expect(useGameStateStore.getState().especialidades.BUG.dano).toBe(1)
    expect(useGameStateStore.getState().especialidades.BUG.defesa).toBe(0)
    expect(useGameStateStore.getState().wallet.gold).toBe(0)
    expect(useGameStateStore.getState().items[stoneItemId('BUG')] ?? 0).toBe(0)
  })

  it('recusa subir alem do nivel maximo', () => {
    const gameState = estadoLimpo()
    for (const custo of ESPECIALIDADE_CUSTOS) {
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
    const custoNivel1 = ESPECIALIDADE_CUSTOS[0]
    gameState.addGold(custoNivel1.gold * 2)
    gameState.addItem(stoneItemId('DRAGON'), custoNivel1.stoneQtd * 2)

    subirNivelEspecialidade(useGameStateStore.getState(), 'DRAGON', 'dano')
    subirNivelEspecialidade(useGameStateStore.getState(), 'DRAGON', 'defesa')

    expect(useGameStateStore.getState().especialidades.DRAGON).toEqual({ dano: 1, defesa: 1 })
  })
})
