import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `servidorAtivo()` decide se a autoridade esta ligada; sem isto `liquidar()`
// sai na primeira linha e nao ha o que testar.
vi.mock('./servidor', async () => {
  const real = await vi.importActual<typeof import('./servidor')>('./servidor')
  return {
    ...real,
    servidorAtivo: () => true,
    servidor: {
      abrirSessao: vi.fn(),
      flush: vi.fn(),
      fecharSessao: vi.fn(),
      estado: vi.fn(),
    },
  }
})

import { ErroServidor, servidor } from './servidor'
import {
  abrirSessaoDeHunt, liquidar, pararFlushPeriodico, registrarEncerramentoDeSessao,
  INTERVALO_FLUSH_MS, INTERVALO_FLUSH_MAX_MS,
} from './autoridade'
import { LIMIAR_OFFLINE_SEGUNDOS } from '@/engine/simulation'
import { useToastStore } from '@/stores/toastStore'

const mock = servidor as unknown as {
  abrirSessao: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
}

describe('liquidar() com 409 (nenhuma sessao aberta)', () => {
  type PushToast = ReturnType<typeof useToastStore.getState>['pushToast']
  let pushToast: ReturnType<typeof vi.fn<PushToast>>
  let pushToastOriginal: PushToast

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pararFlushPeriodico()
    pushToastOriginal = useToastStore.getState().pushToast
    pushToast = vi.fn<PushToast>()
    useToastStore.setState({ pushToast })
  })

  afterEach(() => {
    pararFlushPeriodico()
    useToastStore.setState({ pushToast: pushToastOriginal })
    vi.useRealTimers()
  })

  // O VAZAMENTO que este teste tranca: antes, o 409 era engolido com um `return`
  // mudo e o timer seguia batendo em /sessao/flush a cada 30s pra sempre — uma
  // verificacao de auth por tique, numa cacada que ja nao existia.
  it('sessao morta pelas costas: para o timer, avisa e tira o jogador da hunt', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockRejectedValue(new ErroServidor(409, 'nenhuma sessao aberta'))
    const aoEncerrar = vi.fn()
    registrarEncerramentoDeSessao(aoEncerrar)

    await abrirSessaoDeHunt('route_46', 'poke-1')
    await liquidar()

    expect(aoEncerrar).toHaveBeenCalledTimes(1)
    expect(pushToast).toHaveBeenCalledTimes(1)

    // O timer morreu: avancar meia hora nao gera mais nenhuma chamada.
    mock.flush.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS * 60)
    expect(mock.flush).not.toHaveBeenCalled()
  })

  // O outro lado: `fecharSessaoDeHunt` para o timer ANTES do request, e
  // `commitAgora` chama `liquidar()` fora de hunt de proposito. Nesses dois o
  // 409 e esperado e o jogador nao pode ver aviso nenhum.
  it('corrida normal (timer ja parado): silencioso, sem toast e sem callback', async () => {
    mock.flush.mockRejectedValue(new ErroServidor(409, 'nenhuma sessao aberta'))
    const aoEncerrar = vi.fn()
    registrarEncerramentoDeSessao(aoEncerrar)

    await liquidar()

    expect(aoEncerrar).not.toHaveBeenCalled()
    expect(pushToast).not.toHaveBeenCalled()
  })

  // BUG REAL: `/sessao/flush` tambem responde 409 quando o CAS de `gravarEstado`
  // (server/src/progresso.ts) colide com OUTRA escrita em `players` (config de
  // auto, comprar, vender) — sem relacao com a sessao existir ou nao. Tratar
  // como "sessao sumiu" derrubava o timer no meio de uma cacada viva; o pior
  // caso medido foi bem na hora de fechar a sequencia do Campeao Lance, que
  // reiniciava do zero. So a mensagem exata "nenhuma sessao aberta" pode
  // encerrar a hunt; qualquer outro texto de 409 e so mais um erro reportado, e
  // a proxima tentativa periodica segue tentando sozinha.
  it('409 por colisao de escrita (nao "sessao sumiu"): so reporta, nao derruba a hunt', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockRejectedValue(new ErroServidor(409, 'outro comando em andamento — tente de novo'))
    const aoEncerrar = vi.fn()
    registrarEncerramentoDeSessao(aoEncerrar)

    await abrirSessaoDeHunt('route_46', 'poke-1')
    await liquidar()

    expect(aoEncerrar).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledTimes(1)

    // Timer continua vivo — a proxima tentativa periodica ainda vai tentar.
    mock.flush.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalled()
  })

  it('erro que NAO e 409 continua so reportando, sem derrubar a hunt', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockRejectedValue(new ErroServidor(503, 'servidor fora do ar'))
    const aoEncerrar = vi.fn()
    registrarEncerramentoDeSessao(aoEncerrar)

    await abrirSessaoDeHunt('route_46', 'poke-1')
    await liquidar()

    expect(aoEncerrar).not.toHaveBeenCalled()
    expect(pushToast).toHaveBeenCalledTimes(1)

    // Hunt continua viva: uma queda passageira do servidor nao pode expulsar
    // ninguem da cacada.
    mock.flush.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalled()
  })
})

// O intervalo de flush e ADAPTATIVO (PH-62). Cada flush e uma invocacao de Edge
// Function e o plano Free tem 500 mil por mes: a 30s fixos, ~120 por hora por
// jogador, o que num jogo idle (jogador sempre ligado) da teto de ~5 jogadores
// simultaneos. Janela sem evento nao precisa desse ritmo — a janela do servidor
// e por tempo decorrido, entao esperar mais nao perde progresso.
describe('ritmo adaptativo do flush', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pararFlushPeriodico()
  })
  afterEach(() => {
    pararFlushPeriodico()
    vi.useRealTimers()
  })

  const janelaVazia = { estado: {}, resumo: { kills: 0, gold: 0, xp: 0 } }
  const janelaProdutiva = { estado: {}, resumo: { kills: 3, gold: 120, xp: 40 } }

  it('janela vazia dobra a espera; qualquer evento volta pro piso', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janelaVazia)
    await abrirSessaoDeHunt('route_46', 'poke-1')

    // 1o tique no piso.
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalledTimes(1)

    // Depois de uma janela vazia a espera dobrou: no piso NAO ha tique.
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalledTimes(2)

    // Janela produtiva: o proximo tique volta a acontecer no piso.
    mock.flush.mockResolvedValue(janelaProdutiva)
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS * 4)
    const apos = mock.flush.mock.calls.length
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush.mock.calls.length).toBeGreaterThan(apos)
  })

  it('a espera nunca passa do teto, que fica abaixo do limiar de ausencia', async () => {
    // Acima de LIMIAR_OFFLINE_SEGUNDOS (120s) o servidor trata a janela como
    // AUSENCIA — modo pessimista e piso de 50%. Um teto que atravessasse essa
    // linha faria jogo ao vivo ser creditado como farm offline.
    expect(INTERVALO_FLUSH_MAX_MS).toBeLessThan(LIMIAR_OFFLINE_SEGUNDOS * 1000)

    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janelaVazia)
    await abrirSessaoDeHunt('route_46', 'poke-1')

    // Meia hora de janelas vazias: o intervalo satura no teto em vez de crescer
    // sem limite (o que deixaria a hunt sem creditar nada por muito tempo).
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000)
    const chamadasNaMeiaHora = mock.flush.mock.calls.length
    const minimoNoTeto = Math.floor((30 * 60 * 1000) / INTERVALO_FLUSH_MAX_MS) - 1
    expect(chamadasNaMeiaHora).toBeGreaterThanOrEqual(minimoNoTeto)
  })

  it('entrar numa hunt nova volta pro piso, sem herdar a espera esticada', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janelaVazia)
    await abrirSessaoDeHunt('route_46', 'poke-1')
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS * 6)

    await abrirSessaoDeHunt('mata_faixa1', 'poke-1')
    mock.flush.mockClear()
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    expect(mock.flush).toHaveBeenCalledTimes(1)
  })
})
