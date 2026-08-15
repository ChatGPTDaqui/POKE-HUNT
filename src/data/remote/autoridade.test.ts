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
  abrirSessaoDeHunt, liquidar, pararFlushPeriodico, registrarEncerramentoDeSessao, INTERVALO_FLUSH_MS,
} from './autoridade'
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
