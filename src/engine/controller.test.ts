import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { stoneItemId } from '@/data/stones'
import { useGameStateStore } from '@/stores/gameStateStore'

// pedirAcao real decide entre servidor (so aplica via aplicarEstadoDoServidor
// na resposta) e fallback local (so roda sem servidor). Pra testar as duas
// pontas do contrato que evolvePoke depende (PH-12: nunca debitar Stone antes
// da confirmacao), controlamos os dois cenarios direto no mock.
const pedirAcaoMock = vi.fn()
vi.mock('@/data/remote/autoridade', () => ({
  pedirAcao: (...args: unknown[]) => pedirAcaoMock(...args),
  abrirSessaoDeHunt: vi.fn(async () => true),
  fecharSessaoDeHunt: vi.fn(async () => {}),
}))

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
    gameState.addItem(itemId, 20)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    controller.evolvePoke(poke.uid)
    // pedirAcao e fire-and-forget (`void`) dentro de evolvePoke — dar um
    // microtask pro mock resolver antes de checar.
    await Promise.resolve()
    await Promise.resolve()

    expect(useGameStateStore.getState().items[itemId]).toBe(20)
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
    gameState.addItem(itemId, 20)
    const poke = createPokeInstance(createRng(1), 'kadabra', 80)
    gameState.addCapturedPoke(poke)

    controller.evolvePoke(poke.uid)
    await Promise.resolve()

    expect(useGameStateStore.getState().items[itemId] || 0).toBe(0)
    const evoluido = useGameStateStore.getState().bagPokes.find((p) => p.uid === poke.uid)
    expect(evoluido?.speciesId).toBe('alakazam')
  })
})
