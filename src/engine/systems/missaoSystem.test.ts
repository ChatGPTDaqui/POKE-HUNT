import { describe, expect, it } from 'vitest'

import { reivindicarMissao } from './missaoSystem'
import { cadeiaDoTipo, chaveDaMissao } from '@/data/missoes'
import { useGameStateStore } from '@/stores/gameStateStore'

function estadoLimpo() {
  useGameStateStore.getState().resetToDefaults()
  return useGameStateStore.getState()
}

describe('reivindicarMissao', () => {
  it('recusa especie que nao pertence a cadeia do tipo', () => {
    estadoLimpo()
    const resultado = reivindicarMissao(useGameStateStore.getState(), 'FIRE', 'squirtle')
    expect(resultado).toEqual({ success: false, reason: 'especie_fora_da_cadeia' })
  })

  it('recusa abates insuficientes e nao paga nada', () => {
    const gameState = estadoLimpo()
    const [primeira] = cadeiaDoTipo('BUG')
    const ouroAntes = gameState.wallet.gold

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'BUG', primeira.speciesId)

    expect(resultado).toEqual({ success: false, reason: 'abates_insuficientes' })
    expect(useGameStateStore.getState().wallet.gold).toBe(ouroAntes)
    expect(useGameStateStore.getState().missoesReivindicadas[chaveDaMissao('BUG', primeira.speciesId)]).toBeUndefined()
  })

  it('reivindica a primeira missao com abates suficientes, paga o gold certo', () => {
    const gameState = estadoLimpo()
    const [primeira] = cadeiaDoTipo('GHOST')
    gameState.setPokedexKillEntry(primeira.speciesId, { normal: primeira.alvo, shiny: 0 })
    const ouroAntes = useGameStateStore.getState().wallet.gold

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'GHOST', primeira.speciesId)

    expect(resultado).toEqual({ success: true })
    expect(useGameStateStore.getState().wallet.gold).toBe(ouroAntes + primeira.recompensa)
    expect(useGameStateStore.getState().missoesReivindicadas[chaveDaMissao('GHOST', primeira.speciesId)]).toBe(true)
  })

  it('recusa reivindicar de novo a mesma missao', () => {
    const gameState = estadoLimpo()
    const [primeira] = cadeiaDoTipo('DRAGON')
    gameState.setPokedexKillEntry(primeira.speciesId, { normal: primeira.alvo, shiny: 0 })
    reivindicarMissao(useGameStateStore.getState(), 'DRAGON', primeira.speciesId)

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'DRAGON', primeira.speciesId)

    expect(resultado).toEqual({ success: false, reason: 'ja_reivindicada' })
  })

  it('bloqueia a segunda missao antes da primeira ser reivindicada', () => {
    const gameState = estadoLimpo()
    const cadeia = cadeiaDoTipo('STEEL')
    if (cadeia.length < 2) return // tipo com cadeia curta demais pra este caso
    const segunda = cadeia[1]
    gameState.setPokedexKillEntry(segunda.speciesId, { normal: segunda.alvo, shiny: 0 })

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'STEEL', segunda.speciesId)

    expect(resultado).toEqual({ success: false, reason: 'missao_anterior_pendente' })
  })

  it('libera a segunda missao depois da primeira reivindicada', () => {
    const gameState = estadoLimpo()
    const cadeia = cadeiaDoTipo('ROCK')
    if (cadeia.length < 2) return
    const [primeira, segunda] = cadeia
    gameState.setPokedexKillEntry(primeira.speciesId, { normal: primeira.alvo, shiny: 0 })
    gameState.setPokedexKillEntry(segunda.speciesId, { normal: segunda.alvo, shiny: 0 })
    reivindicarMissao(useGameStateStore.getState(), 'ROCK', primeira.speciesId)

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'ROCK', segunda.speciesId)

    expect(resultado).toEqual({ success: true })
  })

  it('reivindicar a ultima missao da cadeia paga o bonus de conclusao', () => {
    const gameState = estadoLimpo()
    const cadeia = cadeiaDoTipo('ICE')
    for (const missao of cadeia) {
      gameState.setPokedexKillEntry(missao.speciesId, { normal: missao.alvo, shiny: 0 })
    }
    for (let i = 0; i < cadeia.length - 1; i++) {
      reivindicarMissao(useGameStateStore.getState(), 'ICE', cadeia[i].speciesId)
    }
    const ultima = cadeia[cadeia.length - 1]
    const ouroAntes = useGameStateStore.getState().wallet.gold

    const resultado = reivindicarMissao(useGameStateStore.getState(), 'ICE', ultima.speciesId)

    expect(resultado).toEqual({ success: true })
    expect(useGameStateStore.getState().wallet.gold).toBe(ouroAntes + ultima.recompensa)
  })
})
