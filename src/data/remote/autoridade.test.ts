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
  INTERVALO_FLUSH_MS, INTERVALO_FLUSH_MAX_MS, commitAgora,
} from './autoridade'
import { LIMIAR_OFFLINE_SEGUNDOS } from '@/engine/simulation'
import { useToastStore } from '@/stores/toastStore'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { ABATES_POR_SALA } from '@/data/biomas'

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

// Bug relatado: "dou F5 e perco niveis". `commitAgora` ja existia pra isso
// (comentario no proprio arquivo), mas o debounce de 5s so tinha leading
// edge: um SEGUNDO level-up dentro da janela era descartado em silencio, sem
// nada agendado pra cobrir aquele ganho — exatamente a fresta que o F5 cai
// dentro. `vi.setSystemTime` com uma data bem no futuro em cada teste evita
// que o `ultimoCommit` (singleton do modulo) sobreviva de um teste pro outro.
describe('commitAgora — trailing edge do debounce (bug "F5 perde nivel")', () => {
  const janela = { estado: {}, resumo: { kills: 0, gold: 0, xp: 0 } }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pararFlushPeriodico()
  })
  afterEach(() => {
    pararFlushPeriodico()
    vi.useRealTimers()
  })

  it('segundo commit dentro da janela agenda um trailing em vez de descartar', async () => {
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janela)
    await abrirSessaoDeHunt('route_46', 'poke-1')
    mock.flush.mockClear()

    await commitAgora() // primeiro: passa direto
    expect(mock.flush).toHaveBeenCalledTimes(1)

    await commitAgora() // segundo, <5s depois: suprimido — mas AGENDADO
    expect(mock.flush).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(mock.flush).toHaveBeenCalledTimes(2) // o trailing disparou
  })

  it('varios commits suprimidos na mesma janela agendam so UM trailing', async () => {
    vi.setSystemTime(new Date('2030-01-02T00:00:00Z'))
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janela)
    await abrirSessaoDeHunt('route_46', 'poke-1')
    mock.flush.mockClear()

    await commitAgora()
    expect(mock.flush).toHaveBeenCalledTimes(1)

    await commitAgora()
    await commitAgora()
    await commitAgora()
    expect(mock.flush).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(mock.flush).toHaveBeenCalledTimes(2) // 1 trailing, nao 4
  })

  it('sem chamada suprimida, nao ha trailing (nao inventa flush sozinho)', async () => {
    vi.setSystemTime(new Date('2030-01-03T00:00:00Z'))
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'route_46' })
    mock.flush.mockResolvedValue(janela)
    await abrirSessaoDeHunt('route_46', 'poke-1')
    mock.flush.mockClear()

    await commitAgora()
    expect(mock.flush).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(mock.flush).toHaveBeenCalledTimes(1) // nada extra
  })
})

// PH-273 — INSISTIR ENCOLHE A JANELA DO SERVIDOR, E JANELA CURTA TRAVA A HUNT.
//
// Com a quota da sala fechada, o cliente pede o flush na hora em vez de esperar
// o periodico (`observarQuotaDeSala`) — a sala nao avanca sem o servidor, e
// deixar a barra cheia parada por 30s le como jogo travado. O pedido tem uma
// repeticao propria, e ela era de 5 segundos.
//
// So que cada pedido FECHA a janela de simulacao do servidor: ele credita o
// intervalo desde o ultimo flush, reconstroi o mundo do zero (POKE de volta no
// ponto de entrada) e simula so aquilo. Pedir de 5 em 5 segundos nao apressa
// ninguem — poe o servidor pra viver de janelas de 5s, que nao pagam nem a
// caminhada ate o alvo.
//
// Medido na conta de teste no jogo-dev em 2026-08-29, mesma sessao:
//
//   janela de   5s  ->  0 abates (dezenas seguidas; o protetor da sala ficou com
//                                 o mesmo `hp_atual` por mais de 10 minutos)
//   janela de  35s  -> 10 abates, e a sala avancou
//   janela de 111s  -> 24 abates e o protetor morto
//
// Como a sala so avanca quando o protetor dela morre e quem tem que mata-lo e o
// servidor, o resultado era a hunt parada em 30/30 pra sempre.
describe('pedido de sala com a quota fechada (PH-273)', () => {
  const janela = { estado: {}, resumo: { kills: 0, gold: 0, xp: 0 }, sala: null }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pararFlushPeriodico()
    useWorldStore.setState({ sala: null, salaSobAutoridade: false })
    useGameStateStore.getState().resetToDefaults()
  })

  afterEach(() => {
    pararFlushPeriodico()
    useWorldStore.setState({ sala: null, salaSobAutoridade: false })
    vi.useRealTimers()
  })

  /** Fecha a quota no world, que e o que dispara o observador. */
  function fecharQuota(indice = 0) {
    useWorldStore.setState({
      salaSobAutoridade: true,
      salaPendente: null,
      salaCountdownRemaining: null,
      sala: { indice, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 },
    })
  }

  it('a quota fechada nao pode ser repedida antes do intervalo de flush inteiro', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'mata_faixa1' })
    mock.flush.mockResolvedValue(janela)
    await abrirSessaoDeHunt('mata_faixa1', 'poke-1')
    mock.flush.mockClear()

    fecharQuota()
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush, 'o primeiro pedido continua saindo na hora').toHaveBeenCalledTimes(1)

    // A JANELA QUE O SERVIDOR VAI RECEBER. Cada tick abaixo repete o estado de
    // quota fechada, que e exatamente o que acontece no jogo: o mundo continua
    // andando com a barra cheia. Com a repeticao de 5s, isto virava seis pedidos
    // — cinco janelas de 5s, zero abate em cada uma. Cinco e nao seis pra
    // parar em 25s: aos 30s o flush PERIODICO entra, e ele e legitimo.
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5000)
      useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    }
    expect(
      mock.flush.mock.calls.length,
      'o cliente repediu antes do intervalo e encolheu a janela do servidor',
    ).toBe(1)

    // Passado o intervalo inteiro, repedir e legitimo: a janela ja tem tamanho.
    await vi.advanceTimersByTimeAsync(INTERVALO_FLUSH_MS)
    useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush.mock.calls.length).toBeGreaterThan(1)
  })

  // --- PH-393: o pedido extra ------------------------------------------------
  //
  // O primeiro pedido pega o servidor a 1-3 abates de fechar (medido: mediana
  // 27/30), e sem um segundo pedido o jogador espera o intervalo INTEIRO por
  // isso. O extra existe pra cobrir essa borda — e as duas regras abaixo sao o
  // que o separa da repeticao de 5s do PH-273, que travava a hunt.

  /** Resposta de flush com a sala do servidor e a contagem dela. */
  function janelaComSala(abates: number) {
    return {
      estado: {},
      resumo: { kills: 1, gold: 1, xp: 1 },
      sala: { indice: 0, chave: 'grass', abates, ciclos: 0 },
    }
  }

  it('servidor quase fechando: sai UM pedido extra, e so um, antes do intervalo', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'mata_faixa1' })
    mock.flush.mockResolvedValue(janelaComSala(28))
    await abrirSessaoDeHunt('mata_faixa1', 'poke-1')
    mock.flush.mockClear()

    fecharQuota()
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush, 'o primeiro pedido sai na hora').toHaveBeenCalledTimes(1)

    // Antes da espera do extra, nada muda: continua UM.
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(5000)
      useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    }
    expect(mock.flush, 'o extra saiu cedo demais — janela curta e o PH-273').toHaveBeenCalledTimes(1)

    // Passada a espera do extra, ele sai.
    await vi.advanceTimersByTimeAsync(5000)
    useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush, 'o pedido extra nao saiu').toHaveBeenCalledTimes(2)

    // E ele e UM SO: daqui ate o intervalo cheio, nada mais.
    for (let i = 0; i < 2; i++) {
      await vi.advanceTimersByTimeAsync(5000)
      useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    }
    expect(
      mock.flush,
      'o extra repetiu — e repetir e exatamente o livelock que o PH-273 mediu',
    ).toHaveBeenCalledTimes(2)
  })

  it('servidor LONGE de fechar nao ganha pedido extra — a janela curta so o atrasaria', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'mata_faixa1' })
    // 15 de 30: o pedido extra nao teria como fechar a quota, e ainda encurtaria
    // a janela do servidor. O caso que a bancada mostrou piorando o p90.
    mock.flush.mockResolvedValue(janelaComSala(15))
    await abrirSessaoDeHunt('mata_faixa1', 'poke-1')
    mock.flush.mockClear()

    fecharQuota()
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush).toHaveBeenCalledTimes(1)

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(5000)
      useWorldStore.setState({ sala: { indice: 0, chave: 'grass', abates: ABATES_POR_SALA, ciclos: 0 } })
    }
    expect(mock.flush, 'pediu extra com o servidor longe de fechar').toHaveBeenCalledTimes(1)
  })

  it('sala NOVA com a quota fechada pede na hora, sem esperar o intervalo', async () => {
    mock.abrirSessao.mockResolvedValue({ sessaoId: 's1', mapId: 'mata_faixa1' })
    mock.flush.mockResolvedValue(janela)
    await abrirSessaoDeHunt('mata_faixa1', 'poke-1')
    mock.flush.mockClear()

    fecharQuota(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush).toHaveBeenCalledTimes(1)

    // Outra sala e outro pedido: a chave do pedido e (ciclo, sala), e o teto de
    // repeticao nao pode segurar a sala seguinte — senao o jogador que limpa
    // duas salas rapido espera o intervalo inteiro na segunda.
    fecharQuota(1)
    await vi.advanceTimersByTimeAsync(0)
    expect(mock.flush).toHaveBeenCalledTimes(2)
  })
})
