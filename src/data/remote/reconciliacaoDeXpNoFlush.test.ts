// PH-171/PH-172: a barra de XP (treinador e POKE ativo) "voltava" durante a
// hunt sem o jogador ter perdido nada — `aplicarEstadoDoServidor` substituia
// o estado inteiro a cada flush (~30s) sem comparar com o que ja foi
// exibido, e o servidor resimula a janela pelo RELOGIO DELE, nao pelo tempo
// que o client ja renderizou ao vivo. Latencia de rede faz esse recorte
// fechar um pouco antes do ponto que o jogador ja viu — sem trava, esse
// valor MENOR substituia o que ja estava na tela.
//
// Diferente do PH-37 (ja corrigido: era passo de resimulacao errado). Isto e
// descompasso de JANELA de tempo, continua acontecendo mesmo com o passo
// certo.
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { aplicarEstadoDoServidor } from './autoridade'
import { ativarPredicoesDeCaptura } from './predicoesDeCaptura'
import { useMochilaStore } from '@/stores/mochilaStore'
import { defaultGameStateData } from '@/stores/gameStateDefaults'
import { createEmptySummary } from '@/engine/systems/offlineSimSystem'

const rng = createRng(11)
const poke = (uid: string, exp: number, level = 5) => ({
  ...createPokeInstance(rng, 'bulbasaur', level), uid, exp,
})

function resumoComPenalidade(expPerdidaPorMorte: number) {
  return { ...createEmptySummary(), mortesDoJogador: 1, expPerdidaPorMorte }
}

function estadoDoServidor(over: Partial<GameStateData>): GameStateData {
  return { ...defaultGameStateData(), ...over }
}

beforeEach(() => {
  useGameStateStore.setState({ ...defaultGameStateData() })
  useWorldStore.setState({ player: null } as never)
  ativarPredicoesDeCaptura(true)
  useMochilaStore.setState({ carregada: true, carregando: false, erro: null })
})

describe('reconciliacao de XP no flush — treinador', () => {
  it('nunca desce, mesmo sem resumo (recarregarEstado, so /estado)', () => {
    useGameStateStore.setState({ trainer: { name: 'T', level: 10, exp: 5000 } })

    aplicarEstadoDoServidor(estadoDoServidor({ trainer: { name: 'T', level: 9, exp: 4000 } }))

    expect(useGameStateStore.getState().trainer.exp).toBe(5000)
    expect(useGameStateStore.getState().trainer.level).toBe(10)
  })

  it('sobe normal quando o servidor manda mais', () => {
    useGameStateStore.setState({ trainer: { name: 'T', level: 10, exp: 5000 } })

    aplicarEstadoDoServidor(estadoDoServidor({ trainer: { name: 'T', level: 11, exp: 6000 } }))

    expect(useGameStateStore.getState().trainer.exp).toBe(6000)
    expect(useGameStateStore.getState().trainer.level).toBe(11)
  })
})

describe('reconciliacao de XP no flush — POKE ativo', () => {
  it('queda DENTRO do orcamento reportado (morte real) e aceita normal', () => {
    const ativo = poke('ativo', 1000)
    useGameStateStore.setState({ team: [ativo] })
    useWorldStore.setState({ player: { poke: ativo } } as never)

    const doServidor = estadoDoServidor({ team: [{ ...ativo, exp: 950, level: 4 }] })
    aplicarEstadoDoServidor(doServidor, true, resumoComPenalidade(50))

    const pokeFinal = useGameStateStore.getState().team.find((p) => p.uid === 'ativo')!
    expect(pokeFinal.exp).toBe(950)
    expect(pokeFinal.level).toBe(4)
  })

  it('queda ACIMA do orcamento e espuria — trava no piso justificado', () => {
    const ativo = poke('ativo', 1000, 5)
    useGameStateStore.setState({ team: [ativo] })
    useWorldStore.setState({ player: { poke: ativo } } as never)

    // Servidor "resimulou" e voltou bem menos do que a penalidade de morte
    // (50) justifica — descompasso de janela, nao penalidade de verdade.
    const doServidor = estadoDoServidor({ team: [{ ...ativo, exp: 400, level: 3 }] })
    aplicarEstadoDoServidor(doServidor, true, resumoComPenalidade(50))

    const pokeFinal = useGameStateStore.getState().team.find((p) => p.uid === 'ativo')!
    expect(pokeFinal.exp).toBe(950) // 1000 - 50, nunca o 400 que veio
    expect(pokeFinal.level).toBe(5) // nao regride abaixo do que ja foi mostrado
  })

  it('sem resumo (nenhuma janela de resim rodou), confia no servidor como sempre', () => {
    const ativo = poke('ativo', 1000, 5)
    useGameStateStore.setState({ team: [ativo] })
    useWorldStore.setState({ player: { poke: ativo } } as never)

    const doServidor = estadoDoServidor({ team: [{ ...ativo, exp: 400, level: 3 }] })
    aplicarEstadoDoServidor(doServidor, true)

    const pokeFinal = useGameStateStore.getState().team.find((p) => p.uid === 'ativo')!
    expect(pokeFinal.exp).toBe(400)
  })

  it('troca de POKE ativo (uid diferente) nao aplica trava nenhuma', () => {
    const antigo = poke('antigo', 1000, 5)
    useGameStateStore.setState({ team: [antigo] })
    // O jogador ja engajou com o PROXIMO POKE (desmaio + troca de time) —
    // o antigo nao esta mais em campo.
    const novo = poke('novo-em-campo', 10)
    useWorldStore.setState({ player: { poke: novo } } as never)

    const doServidor = estadoDoServidor({ team: [{ ...antigo, exp: 1, level: 1 }] })
    aplicarEstadoDoServidor(doServidor, true, resumoComPenalidade(50))

    // uid 'antigo' nao esta em campo (world.player.poke.uid = 'novo-em-campo')
    // — a reconciliacao nao mexe nele, servidor manda no valor.
    const pokeFinal = useGameStateStore.getState().team.find((p) => p.uid === 'antigo')!
    expect(pokeFinal.exp).toBe(1)
  })
})
