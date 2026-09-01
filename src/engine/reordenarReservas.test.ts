// PH-75: reordenar a fila de reservas pelo trilho da HUD.
//
// O invariante que estes testes protegem e um so: o slot 0 e intocavel por este
// caminho. No modelo do servidor o POKE em campo e SEMPRE o slot 0, e trocar
// quem esta em campo faz um ritual que so `setActiveTeamIndex` executa —
// precarregar a arte da especie nova, escrever `worldStore.player.poke`, zerar
// cooldowns e alvo. Se o reordenar pudesse mexer no slot 0, o POKE desenhado no
// canvas ficaria diferente do POKE ativo no estado ate a proxima troca de cena.
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'

const pedirAcaoMock = vi.fn()
vi.mock('@/data/remote/autoridade', () => ({
  pedirAcao: (...args: unknown[]) => pedirAcaoMock(...args),
  abrirSessaoDeHunt: vi.fn(async () => ({ ok: true, sala: null })),
  fecharSessaoDeHunt: vi.fn(async () => {}),
}))

const ESPECIES = ['charmander', 'bulbasaur', 'squirtle', 'pikachu']

function montarEquipe(quantos: number) {
  const equipe = Array.from({ length: quantos }, (_, i) =>
    createPokeInstance(createRng(i + 1), ESPECIES[i % ESPECIES.length], 10 + i))
  useGameStateStore.setState({ team: equipe, activeIndex: 0 })
  return equipe
}

// AQUECE O IMPORT DO MOTOR ANTES DE QUALQUER CASO (PH-404).
//
// Os casos de `controller.reorderTeam` comecam com `await import('./controller')`.
// O modulo fica em cache depois da primeira vez, entao o grafo INTEIRO do motor
// caia sobre o primeiro caso, dentro do orcamento de 5s dele. Na suite cheia isso
// reprovava sempre nesta maquina — `Test timed out in 5000ms` — enquanto o arquivo
// sozinho passava em 7,2s. `import` foi 1.290s de uma execucao de 155s da suite
// inteira: e o item mais caro daqui.
//
// O aquecimento vai num HOOK porque hook tem orcamento proprio, separado do caso —
// e porque assim nenhum caso paga sozinho por um custo que e de todos. Os
// `await import` de dentro dos casos continuam la e viram acerto de cache; nada do
// que eles afirmam muda. Mesmo remedio da PH-322 em `controller.test.ts`.
beforeAll(async () => {
  await import('./controller')
}, 30000)

beforeEach(() => {
  pedirAcaoMock.mockReset()
  pedirAcaoMock.mockResolvedValue(true)
  useGameStateStore.getState().resetToDefaults()
})

describe('gameStateStore.reordenarReservas', () => {
  it('move uma reserva pra outra posicao da fila', () => {
    const [a, b, c, d] = montarEquipe(4)
    useGameStateStore.getState().reordenarReservas(1, 3)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual([a.uid, c.uid, d.uid, b.uid])
  })

  it('move pra cima tambem', () => {
    const [a, b, c, d] = montarEquipe(4)
    useGameStateStore.getState().reordenarReservas(3, 1)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual([a.uid, d.uid, b.uid, c.uid])
  })

  it('RECUSA tirar o POKE em campo do slot 0', () => {
    const antes = montarEquipe(4).map((p) => p.uid)
    useGameStateStore.getState().reordenarReservas(0, 2)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual(antes)
  })

  it('RECUSA promover uma reserva pro slot 0 arrastando', () => {
    // Promover e `setActiveTeamIndex`, que faz o preload da arte e mexe no
    // worldStore. Deixar o arrasto fazer isso desenharia o POKE errado.
    const antes = montarEquipe(4).map((p) => p.uid)
    useGameStateStore.getState().reordenarReservas(2, 0)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual(antes)
  })

  it('ignora indice fora da equipe em vez de criar buraco na fila', () => {
    const antes = montarEquipe(3).map((p) => p.uid)
    useGameStateStore.getState().reordenarReservas(1, 9)
    useGameStateStore.getState().reordenarReservas(9, 1)
    useGameStateStore.getState().reordenarReservas(-1, 2)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual(antes)
  })

  it('nao mexe em activeIndex — ele e sempre 0 neste modelo', () => {
    montarEquipe(4)
    useGameStateStore.getState().reordenarReservas(1, 3)
    expect(useGameStateStore.getState().activeIndex).toBe(0)
  })

  it('nao faz nada quando origem e destino sao iguais', () => {
    const antes = montarEquipe(4).map((p) => p.uid)
    useGameStateStore.getState().reordenarReservas(2, 2)
    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual(antes)
  })
})

describe('controller.reorderTeam', () => {
  it('manda a ordem RESULTANTE completa, nao o par (de, para)', async () => {
    const [a, b, c, d] = montarEquipe(4)
    const { controller } = await import('./controller')

    controller.reorderTeam(1, 3)

    expect(pedirAcaoMock).toHaveBeenCalledTimes(1)
    const acao = pedirAcaoMock.mock.calls[0][0] as { tipo: string; ordem: string[] }
    expect(acao.tipo).toBe('reordenarEquipe')
    // Lista inteira: a RPC valida que ela cobre a equipe sem repetir, e o
    // resultado nao depende de quantas vezes a chamada rode.
    expect(acao.ordem).toEqual([a.uid, c.uid, d.uid, b.uid])
  })

  it('calcula a ordem ANTES do fallback rodar', async () => {
    // Sob autoridade do servidor o fallback NAO roda. Se a ordem fosse lida do
    // estado depois do `pedirAcao`, o servidor receberia a ordem velha.
    const [a, b, c] = montarEquipe(3)
    const { controller } = await import('./controller')

    controller.reorderTeam(1, 2)

    const acao = pedirAcaoMock.mock.calls[0][0] as { ordem: string[] }
    expect(acao.ordem).toEqual([a.uid, c.uid, b.uid])
    // O fallback e o 2o argumento e so roda no modo sem servidor.
    expect(typeof pedirAcaoMock.mock.calls[0][1]).toBe('function')
  })

  it('o fallback aplica o mesmo movimento localmente', async () => {
    const [a, b, c] = montarEquipe(3)
    const { controller } = await import('./controller')

    controller.reorderTeam(1, 2)
    const fallback = pedirAcaoMock.mock.calls[0][1] as () => void
    fallback()

    expect(useGameStateStore.getState().team.map((p) => p.uid)).toEqual([a.uid, c.uid, b.uid])
  })

  it('nao chama o servidor quando o movimento envolve o slot 0', async () => {
    montarEquipe(4)
    const { controller } = await import('./controller')

    controller.reorderTeam(0, 2)
    controller.reorderTeam(2, 0)

    expect(pedirAcaoMock).not.toHaveBeenCalled()
  })

  it('nao chama o servidor quando origem e destino sao iguais', async () => {
    montarEquipe(4)
    const { controller } = await import('./controller')
    controller.reorderTeam(2, 2)
    expect(pedirAcaoMock).not.toHaveBeenCalled()
  })

  it('nao chama o servidor com indice fora da equipe', async () => {
    montarEquipe(3)
    const { controller } = await import('./controller')
    controller.reorderTeam(1, 7)
    expect(pedirAcaoMock).not.toHaveBeenCalled()
  })
})
