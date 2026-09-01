// PH-396: POKE em campo que NAO esta mais na equipe do servidor sai de campo.
//
// O buraco era um `return` mudo: `reconciliarPokeAtivoNoWorld` casava o POKE do
// mundo com o do servidor POR UID, e quando nao achava, desistia. Só que "nao
// achei" tem dois significados muito diferentes:
//
//   - o servidor mandou um estado sem esse POKE porque ele foi VENDIDO,
//     LIBERADO ou mandado pra mochila noutra aba;
//   - ...e nao ha um segundo caso. Nenhum caminho legitimo poe em campo quem nao
//     esta na equipe: a troca por desmaio escolhe outro membro DA equipe, e
//     captura vai pra mochila.
//
// Sem tratar, o POKE fantasma ficava em campo — desenhado, com HUD, lutando —
// ate a proxima reconstrucao de mundo (F5 ou troca de cena). Achado em 01/09 no
// dev: a tela mostrava um Scizor Lv 80 em campo enquanto o banco tinha esse POKE
// na MOCHILA, sem alteracao desde 24/08.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./servidor', async () => {
  const real = await vi.importActual<typeof import('./servidor')>('./servidor')
  return {
    ...real,
    servidorAtivo: () => true,
    servidor: { abrirSessao: vi.fn(), flush: vi.fn(), fecharSessao: vi.fn(), estado: vi.fn() },
  }
})
// O preload usa `Image`, que nao existe no ambiente de node desta suite.
vi.mock('@/data/preload', () => ({ preloadEspecies: vi.fn(() => Promise.resolve()) }))

import { aplicarEstadoDoServidor } from './autoridade'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { createPokeInstance } from '@/data/pokes'
import { createRng } from '@/core/rng'
import { createPlayerEntity } from '@/engine/entity'

const rng = createRng(5)
const emCampo = createPokeInstance(rng, 'scizor', 80)
const naEquipe = createPokeInstance(rng, 'charmander', 12)

function mundoComPokeEmCampo(poke = emCampo) {
  const player = createPlayerEntity({ entity: 1, effect: 1, pendingHit: 1 }, { poke, x: 10, y: 10 })
  player.cooldowns = { basic_attack: 3 }
  player.targetId = 'entity-9'
  useWorldStore.setState({ player } as never, false)
  return player
}

let pushToast: ReturnType<typeof vi.fn>
let pushToastOriginal: ReturnType<typeof useToastStore.getState>['pushToast']

beforeEach(() => {
  vi.clearAllMocks()
  useGameStateStore.getState().resetToDefaults()
  pushToastOriginal = useToastStore.getState().pushToast
  pushToast = vi.fn()
  useToastStore.setState({ pushToast: pushToast as never })
})
afterEach(() => {
  useToastStore.setState({ pushToast: pushToastOriginal })
  useWorldStore.setState({ player: null } as never, false)
})

describe('POKE fantasma em campo (PH-396)', () => {
  it('POKE que sumiu da equipe do servidor sai de campo e o slot 0 entra', () => {
    mundoComPokeEmCampo()

    // A equipe do servidor NAO tem o POKE que esta em campo.
    aplicarEstadoDoServidor({ team: [naEquipe] })

    const agora = useWorldStore.getState().player!
    expect(agora.poke.uid, 'o POKE fantasma continuou em campo').toBe(naEquipe.uid)
  })

  it('o substituto entra sem herdar recarga nem alvo de quem saiu', () => {
    const player = mundoComPokeEmCampo()
    expect(player.cooldowns).not.toEqual({})

    aplicarEstadoDoServidor({ team: [naEquipe] })

    const agora = useWorldStore.getState().player!
    expect(agora.cooldowns).toEqual({})
    expect(agora.targetId).toBeNull()
    expect(agora.state).toBe('wander')
  })

  it('avisa o jogador — trocar em silencio le como "meu POKE mudou sozinho"', () => {
    mundoComPokeEmCampo()

    aplicarEstadoDoServidor({ team: [naEquipe] })

    expect(pushToast).toHaveBeenCalledTimes(1)
    const texto = String(pushToast.mock.calls[0][0])
    expect(texto).toContain('Scizor')
    expect(texto).toContain('Charmander')
  })

  it('substituto DESMAIADO entra como desmaiado, e nao andando', () => {
    mundoComPokeEmCampo()
    const caido = { ...naEquipe, hp: 0 }

    aplicarEstadoDoServidor({ team: [caido] })

    const agora = useWorldStore.getState().player!
    expect(agora.fainted).toBe(true)
    expect(agora.state).toBe('dead')
  })

  it('equipe VAZIA nao mexe em nada — nao ha quem por em campo', () => {
    // Conta recem-resetada, antes de escolher o inicial. A tela de escolha ja
    // cobre esse estado; trocar por `undefined` aqui quebraria o desenho.
    mundoComPokeEmCampo()

    aplicarEstadoDoServidor({ team: [] })

    expect(useWorldStore.getState().player!.poke.uid).toBe(emCampo.uid)
    expect(pushToast).not.toHaveBeenCalled()
  })

  it('o caso NORMAL nao dispara nada: POKE em campo continua na equipe', () => {
    mundoComPokeEmCampo()

    aplicarEstadoDoServidor({ team: [emCampo, naEquipe] })

    expect(useWorldStore.getState().player!.poke.uid).toBe(emCampo.uid)
    expect(pushToast, 'avisou sem motivo').not.toHaveBeenCalled()
  })

  it('sem POKE em campo (Hospital) nao estoura', () => {
    useWorldStore.setState({ player: null } as never, false)
    expect(() => aplicarEstadoDoServidor({ team: [naEquipe] })).not.toThrow()
  })
})
