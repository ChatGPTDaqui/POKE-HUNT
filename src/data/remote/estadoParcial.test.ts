// O flush deixou de devolver a mochila inteira (ver `OpcoesDeLeitura` em
// server/src/progresso.ts: 3,2 MB por request numa conta com 5 mil POKEs, a
// cada 30s). O que sobra e um estado PARCIAL — e a forma de errar isso nao
// lanca excecao nenhuma: ou a Mochila do jogador esvazia na tela, ou cada
// captura aparece duas vezes (a predicao local e a linha real, com uids
// diferentes). Os dois sintomas so aparecem OLHANDO. Dai estes testes.
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { aplicarEstadoDoServidor } from './autoridade'
import { ativarPredicoesDeCaptura } from './predicoesDeCaptura'
import { defaultGameStateData } from '@/stores/gameStateDefaults'

const rng = createRng(7)
const poke = (uid: string) => ({ ...createPokeInstance(rng, 'bulbasaur', 5), uid })

// O que o servidor manda num flush parcial: estado inteiro, menos a mochila —
// `bagPokes` traz so o que ESTA janela capturou.
function respostaParcial(bag: ReturnType<typeof poke>[], gold = 0): GameStateData {
  return { ...defaultGameStateData(), bagPokes: bag, wallet: { gold, diamonds: 0 } }
}

beforeEach(() => {
  useGameStateStore.setState({ ...defaultGameStateData() })
  ativarPredicoesDeCaptura(true)
})

describe('aplicarEstadoDoServidor(estado, parcial = true)', () => {
  it('preserva a mochila local — o estado parcial nao e a mochila do jogador', () => {
    const guardados = [poke('guardado-1'), poke('guardado-2')]
    useGameStateStore.setState({ bagPokes: guardados })

    aplicarEstadoDoServidor(respostaParcial([]), true)

    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid))
      .toEqual(['guardado-1', 'guardado-2'])
  })

  it('troca a predicao local pela linha real, sem exibir a captura duas vezes', () => {
    useGameStateStore.setState({ bagPokes: [poke('guardado-1')] })
    // A simulacao local captura: entra na mochila com uid proprio, so pra o
    // jogador ver na hora.
    useGameStateStore.getState().addCapturedPoke(poke('predicao-local'))
    expect(useGameStateStore.getState().bagPokes).toHaveLength(2)

    // O servidor simulou a MESMA janela e gravou a captura com o uid DELE.
    aplicarEstadoDoServidor(respostaParcial([poke('linha-real-do-servidor')]), true)

    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid))
      .toEqual(['guardado-1', 'linha-real-do-servidor'])
  })

  it('a mesma captura chegando duas vezes (retry de rede) nao duplica', () => {
    const doServidor = respostaParcial([poke('linha-real')])
    aplicarEstadoDoServidor(doServidor, true)
    aplicarEstadoDoServidor(doServidor, true)

    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual(['linha-real'])
  })

  it('o resto do estado continua vindo do servidor, parcial ou nao', () => {
    useGameStateStore.setState({ wallet: { gold: 1, diamonds: 0 } })
    aplicarEstadoDoServidor(respostaParcial([], 5000), true)
    expect(useGameStateStore.getState().wallet.gold).toBe(5000)
  })

  it('predicao nao confirmada por ESTA resposta some mesmo assim', () => {
    // A captura que o servidor nao viu (a janela dele fechou antes) nao pode
    // ficar na tela pra sempre: ela e predicao de uma janela que ja foi
    // creditada. Se o POKE existir de verdade, o proximo `/estado` o traz.
    useGameStateStore.getState().addCapturedPoke(poke('predicao-orfa'))
    aplicarEstadoDoServidor(respostaParcial([]), true)
    expect(useGameStateStore.getState().bagPokes).toEqual([])
  })
})

describe('aplicarEstadoDoServidor(estado) — completo, o caminho de /estado', () => {
  it('substitui a mochila inteira, inclusive descartando predicao pendente', () => {
    useGameStateStore.setState({ bagPokes: [poke('velho')] })
    useGameStateStore.getState().addCapturedPoke(poke('predicao-local'))

    aplicarEstadoDoServidor({ ...defaultGameStateData(), bagPokes: [poke('do-banco')] })

    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual(['do-banco'])
  })

  it('uma predicao anterior nao contamina o proximo flush parcial', () => {
    useGameStateStore.getState().addCapturedPoke(poke('predicao-local'))
    // Sync completo: a partir daqui nada mais e predicao.
    aplicarEstadoDoServidor({ ...defaultGameStateData(), bagPokes: [poke('do-banco')] })

    aplicarEstadoDoServidor(respostaParcial([]), true)

    expect(useGameStateStore.getState().bagPokes.map((p) => p.uid)).toEqual(['do-banco'])
  })
})
