import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES, SPECIAL_EVOLUTION_STONE_COUNT } from '@/data/pokes'
import { stoneItemId } from '@/data/stones'
import { useGameStateStore } from '@/stores/gameStateStore'

// pedirAcao real decide entre servidor (so aplica via aplicarEstadoDoServidor
// na resposta) e fallback local (so roda sem servidor). Pra testar as duas
// pontas do contrato que evolvePoke depende (PH-12: nunca debitar Stone antes
// da confirmacao), controlamos os dois cenarios direto no mock.
const pedirAcaoMock = vi.fn()
vi.mock('@/data/remote/autoridade', () => ({
  pedirAcao: (...args: unknown[]) => pedirAcaoMock(...args),
  abrirSessaoDeHunt: vi.fn(async () => ({ ok: true, sala: null })),
  fecharSessaoDeHunt: vi.fn(async () => {}),
}))

// AQUECE O IMPORT DO MOTOR ANTES DE QUALQUER CASO (PH-322).
//
// Cada caso abaixo comeca com `await import('./controller')`. O modulo fica em
// cache depois da primeira vez, entao o custo INTEIRO — o grafo do motor — caia
// sobre o primeiro caso, sob o timeout padrao de 5s. Numa maquina ocupada isso
// estourava: em 31/08, com o jogo aberto num navegador ao lado, o primeiro caso
// reprovou com "Test timed out in 5000ms" enquanto o arquivo sozinho passava em
// 7,5s no total.
//
// Nao e teoria de bancada: `import` foi 1.054s de uma execucao de 132s da suite
// inteira. Importar e o item mais caro daqui, e 5s de folga e pouco pro runner
// do CI, que e mais lento e compartilhado.
//
// O aquecimento vai num HOOK porque hook tem orcamento proprio, separado do
// caso — e porque assim nenhum caso paga por um custo que e de todos. Os
// `await import` de dentro dos casos continuam la e viram acerto de cache; nada
// do que eles afirmam muda.
beforeAll(async () => {
  await import('./controller')
}, 30000)

beforeEach(() => {
  pedirAcaoMock.mockReset()
  useGameStateStore.getState().resetToDefaults()
})

describe('controller.evolvePoke — Stone so sai depois da confirmacao (PH-12)', () => {
  it('pedirAcao falha (rede/409): nenhuma Stone sai, POKE nao evolui localmente', async () => {
    // Simula o caminho servidor-autoridade quando a request falha: o
    // fallback NUNCA e chamado (pedirAcao real so chama fallback no modo sem
    // servidor).
    pedirAcaoMock.mockResolvedValue(false)

    const { controller } = await import('./controller')
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.addItem(itemId, SPECIAL_EVOLUTION_STONE_COUNT)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    await controller.evolvePoke(poke.uid)

    expect(useGameStateStore.getState().items[itemId]).toBe(SPECIAL_EVOLUTION_STONE_COUNT)
    const aindaNaMochila = useGameStateStore.getState().bagPokes.find((p) => p.uid === poke.uid)
    expect(aindaNaMochila?.speciesId).toBe('kadabra')
  })

  it('pedirAcao confirma (fallback local, modo dev sem servidor): Stone sai e POKE evolui', async () => {
    pedirAcaoMock.mockImplementation(async (_acao: unknown, fallback: () => void) => {
      fallback()
      return true
    })

    const { controller } = await import('./controller')
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.addItem(itemId, SPECIAL_EVOLUTION_STONE_COUNT)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    await controller.evolvePoke(poke.uid)

    expect(useGameStateStore.getState().items[itemId] || 0).toBe(0)
    const evoluido = useGameStateStore.getState().bagPokes.find((p) => p.uid === poke.uid)
    expect(evoluido?.speciesId).toBe('alakazam')
  })
})

describe('controller.evolvePoke — round-trip inteiro guarda reentrancia (PH-13)', () => {
  it('await evolvePoke so resolve depois que pedirAcao resolve, nao no microtask seguinte', async () => {
    let resolvePedirAcao!: (ok: boolean) => void
    pedirAcaoMock.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolvePedirAcao = resolve
    }))

    const { controller } = await import('./controller')
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.addItem(itemId, SPECIAL_EVOLUTION_STONE_COUNT)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    let resolvido = false
    const promise = controller.evolvePoke(poke.uid).then(() => {
      resolvido = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(resolvido).toBe(false)

    resolvePedirAcao(true)
    await promise
    expect(resolvido).toBe(true)
  })

  it('pedirAcao falha: toast de sucesso e troca de especie nao disparam', async () => {
    pedirAcaoMock.mockResolvedValue(false)

    const { controller } = await import('./controller')
    const gameState = useGameStateStore.getState()
    const itemId = stoneItemId(SPECIES.kadabra.type)
    gameState.addItem(itemId, SPECIAL_EVOLUTION_STONE_COUNT)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    await controller.evolvePoke(poke.uid)

    const aindaKadabra = useGameStateStore.getState().bagPokes.find((p) => p.uid === poke.uid)
    expect(aindaKadabra?.speciesId).toBe('kadabra')
  })
})

// PRESO (PH-72): Wrap/Bind/Fire Spin e companhia travam a troca de POKE
// enquanto duram. O guard e de CLIENTE, por decisao registrada na issue:
// `definirAtivo` e RPC e o estado volatil de combate vive so no worldStore
// efemero, entao o servidor nao tem como validar sem receber estado de combate
// em toda troca.
//
// Os dois caminhos de sair de campo estao cobertos aqui. O segundo e o que
// tornaria o primeiro decorativo: tirar da equipe o POKE preso e a MESMA fuga
// que trocar por outro.
describe('controller — POKE preso nao sai de campo (PH-72)', () => {
  async function comJogadorPreso(presoAte: number) {
    const { useWorldStore } = await import('@/stores/worldStore')
    const { buildMapWorld } = await import('./simulation')
    const gameState = useGameStateStore.getState()
    const rng = createRng(21)
    const emCampo = createPokeInstance(rng, 'charmander', 30)
    const reserva = createPokeInstance(rng, 'squirtle', 30)
    gameState.addPokeToTeam(emCampo)
    gameState.addPokeToTeam(reserva)
    // `addPokeToTeam`, e nao `addCapturedPoke`: aquela poe na MOCHILA (toda
    // captura entra por la), e o teste precisa dos dois na EQUIPE.
    const world = buildMapWorld('route_46', useGameStateStore.getState().team[0], { seed: 0,
      rng, counters: { entity: 1, effect: 1, pendingHit: 1 },
    })
    world.player!.presoAte = presoAte
    useWorldStore.getState().setWorld(world)
    return useGameStateStore.getState().team
  }

  it('trocar de POKE nao chega nem a pedir a acao ao servidor', async () => {
    pedirAcaoMock.mockResolvedValue(true)
    const { controller } = await import('./controller')
    const team = await comJogadorPreso(8)
    expect(team.length).toBeGreaterThan(1)

    controller.setActiveTeamIndex(1)

    expect(pedirAcaoMock).not.toHaveBeenCalled()
  })

  it('tirar da equipe o POKE preso tambem e bloqueado (senao o bloqueio acima seria decorativo)', async () => {
    pedirAcaoMock.mockResolvedValue(true)
    const { controller } = await import('./controller')
    const team = await comJogadorPreso(8)

    controller.removeFromTeam(team[0].uid)

    expect(pedirAcaoMock).not.toHaveBeenCalled()
  })

  it('com o timer zerado, a troca segue normalmente', async () => {
    pedirAcaoMock.mockResolvedValue(true)
    const { controller } = await import('./controller')
    await comJogadorPreso(0)

    controller.setActiveTeamIndex(1)

    expect(pedirAcaoMock).toHaveBeenCalled()
  })
})
