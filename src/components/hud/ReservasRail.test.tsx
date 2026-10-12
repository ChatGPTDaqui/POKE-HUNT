// @vitest-environment jsdom
//
// PH-75: o trilho de reservas.
//
// A regra que mais quebra calado e "so as reservas": o POKE em campo ja ocupa a
// linha inteira do StatusRail logo acima, e duplicar a foto dele aqui gasta a
// coluna com informacao repetida. Como consequencia, a numeracao visivel comeca
// em 2 — o slot 1 e o campo.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useUiStore } from '@/stores/uiStore'
import { ReservasRail } from './ReservasRail'

const setActiveTeamIndex = vi.fn()
const reorderTeam = vi.fn()
vi.mock('@/engine/controller', () => ({
  controller: {
    setActiveTeamIndex: (...a: unknown[]) => setActiveTeamIndex(...a),
    reorderTeam: (...a: unknown[]) => reorderTeam(...a),
  },
}))

const ESPECIES = ['charmander', 'bulbasaur', 'squirtle', 'pikachu']

function montarEquipe(quantos: number) {
  const equipe = Array.from({ length: quantos }, (_, i) =>
    createPokeInstance(createRng(i + 1), ESPECIES[i % ESPECIES.length], 10 + i))
  useGameStateStore.setState({ team: equipe, activeIndex: 0 })
  return equipe
}

beforeEach(() => {
  vi.clearAllMocks()
  useGameStateStore.getState().resetToDefaults()
  // Regime amplo com ponteiro fino: e onde hover existe.
  useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900, coarsePointer: false })
  usePokeProfileStore.setState({ open: null })
})
afterEach(cleanup)

describe('o que o trilho mostra', () => {
  it('nao desenha o POKE em campo — ele ja esta no StatusRail', () => {
    const equipe = montarEquipe(3)
    render(<ReservasRail />)

    const emCampo = SPECIES[equipe[0].speciesId].name
    expect(screen.queryByRole('button', { name: new RegExp(emCampo, 'i') })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('numera as reservas a partir de 2, da esquerda para a direita', () => {
    montarEquipe(4)
    render(<ReservasRail />)

    const rotulos = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(rotulos[0]).toMatch(/^Reserva 2:/)
    expect(rotulos[1]).toMatch(/^Reserva 3:/)
    expect(rotulos[2]).toMatch(/^Reserva 4:/)
  })

  it('nao desenha nada quando a equipe tem so o POKE em campo', () => {
    montarEquipe(1)
    const { container } = render(<ReservasRail />)
    // Nem um bloco vazio: ele ocuparia altura no topo da tela sem mostrar nada.
    expect(container.firstChild).toBeNull()
  })

  it('mostra o nivel de cada reserva', () => {
    montarEquipe(3)
    render(<ReservasRail />)
    // Equipe montada com nivel 10+i, entao as reservas sao 11 e 12.
    expect(screen.getByText('Nv 11')).toBeTruthy()
    expect(screen.getByText('Nv 12')).toBeTruthy()
  })

  it('mantém as cinco reservas em coluna no mobile', () => {
    montarEquipe(6)
    useUiStore.setState({ viewportWidth: 320, viewportHeight: 568, coarsePointer: true })
    render(<ReservasRail />)
    const fila = screen.getByRole('group', { name: 'Companheiros da equipe' })
    expect(fila.dataset.orientation).toBe('vertical')
    expect(fila.style.gridTemplateColumns).toBe('44px')
    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('usa uma fila horizontal no PC', () => {
    montarEquipe(6)
    render(<ReservasRail />)
    const fila = screen.getByRole('group', { name: 'Companheiros da equipe' })
    expect(fila.dataset.orientation).toBe('horizontal')
    expect(fila.style.gridTemplateColumns).toBe('repeat(5, minmax(44px, 1fr))')
  })
})

describe('menu de clique', () => {
  it('abre com Perfil e Colocar em campo', async () => {
    montarEquipe(3)
    render(<ReservasRail />)

    await userEvent.click(screen.getAllByRole('button')[0])

    expect(screen.getByRole('button', { name: 'Perfil' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Colocar em campo' })).toBeTruthy()
  })

  it('"Colocar em campo" usa o indice NA EQUIPE, nao o indice no trilho', async () => {
    montarEquipe(4)
    render(<ReservasRail />)

    // Segundo card do trilho = indice 2 da equipe. Mandar 1 poria o POKE
    // errado em campo.
    await userEvent.click(screen.getAllByRole('button')[1])
    await userEvent.click(screen.getByRole('button', { name: 'Colocar em campo' }))

    expect(setActiveTeamIndex).toHaveBeenCalledWith(2)
  })

  it('"Perfil" abre o perfil do POKE certo', async () => {
    const equipe = montarEquipe(3)
    render(<ReservasRail />)

    await userEvent.click(screen.getAllByRole('button')[1])
    await userEvent.click(screen.getByRole('button', { name: 'Perfil' }))

    expect(usePokeProfileStore.getState().open?.poke.uid).toBe(equipe[2].uid)
  })

  it('clicar de novo no mesmo card fecha o menu', async () => {
    montarEquipe(3)
    render(<ReservasRail />)

    await userEvent.click(screen.getAllByRole('button')[0])
    expect(screen.queryByRole('button', { name: 'Perfil' })).toBeTruthy()

    await userEvent.click(screen.getAllByRole('button')[0])
    expect(screen.queryByRole('button', { name: 'Perfil' })).toBeNull()
  })
})

describe('teclado', () => {
  it('Enter abre o menu nativo sem alternar duas vezes', async () => {
    montarEquipe(3)
    render(<ReservasRail />)
    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Perfil' })).toBeTruthy()
  })

  it('setas horizontais seguem a disposição da fila', async () => {
    montarEquipe(4)
    render(<ReservasRail />)
    screen.getAllByRole('button')[1].focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}')
    expect(reorderTeam.mock.calls).toEqual([[2, 1], [2, 3]])
  })

  it('seta pra baixo desce a reserva uma posicao', async () => {
    montarEquipe(4)
    render(<ReservasRail />)

    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{ArrowDown}')

    expect(reorderTeam).toHaveBeenCalledWith(1, 2)
  })

  it('seta pra cima nao promove pro campo a partir da primeira reserva', async () => {
    // A primeira reserva e o indice 1. Subir levaria ao 0, que e o campo — e
    // isso e `setActiveTeamIndex`, nao reordenar.
    montarEquipe(4)
    render(<ReservasRail />)

    screen.getAllByRole('button')[0].focus()
    await userEvent.keyboard('{ArrowUp}')

    expect(reorderTeam).not.toHaveBeenCalled()
  })

  it('seta pra baixo na ultima reserva nao sai da equipe', async () => {
    montarEquipe(3)
    render(<ReservasRail />)

    screen.getAllByRole('button')[1].focus()
    await userEvent.keyboard('{ArrowDown}')

    expect(reorderTeam).not.toHaveBeenCalled()
  })
})

describe('arraste acompanha a disposição', () => {
  it.each(['PC', 'mobile'])('mede o eixo correto no %s e não abre menu ao soltar', (regime) => {
    const mobile = regime === 'mobile'
    if (mobile) useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, coarsePointer: true })
    montarEquipe(4)
    render(<ReservasRail />)
    const cards = screen.getAllByRole('button')
    const geometria = cards.map((card, i) => vi.spyOn(card, 'getBoundingClientRect')
      .mockReturnValue({ left: mobile ? 0 : i * 54, top: mobile ? i * 54 : 0, width: 52, height: 52 } as DOMRect))
    // PointerEvent não existe em todas as versões do jsdom.
    vi.stubGlobal('PointerEvent', MouseEvent)
    try {
      fireEvent.pointerDown(cards[0], { button: 0, clientX: 20, clientY: 20 })
      fireEvent.pointerMove(cards[0], { clientX: mobile ? 120 : 74, clientY: mobile ? 74 : 120 })
      fireEvent.pointerUp(cards[0], { clientX: mobile ? 120 : 74, clientY: mobile ? 74 : 120 })
      fireEvent.click(cards[0], { detail: 1 })
      expect(reorderTeam).toHaveBeenCalledWith(1, 2)
      expect(screen.queryByRole('button', { name: 'Perfil' })).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      geometria.forEach(mock => mock.mockRestore())
    }
  })
})
