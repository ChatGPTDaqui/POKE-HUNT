// @vitest-environment jsdom
//
// O caminho ate os 4 golpes. A gestao vive dentro do perfil do POKE, numa aba
// que nada anunciava: o jogador tinha que clicar no card e DEPOIS descobrir a
// aba "Golpes". A Equipe e onde ele administra o POKE, entao e onde o atalho
// tem que existir — e ele precisa abrir JA na aba certa, senao troca um passo
// escondido por outro.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { controller } from '@/engine/controller'
import userEvent from '@testing-library/user-event'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { getAbility } from '@/data/abilities'
import { activeAbilitiesPadrao } from '@/data/activeAbilities'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { TeamMenu } from './TeamMenu'

vi.mock('@/engine/controller', () => ({
  controller: { setActiveTeamIndex: vi.fn(), removeFromTeam: vi.fn(), evolvePoke: vi.fn() },
}))

const ESPECIE = SPECIES.charmander
const NIVEL = 20

function poke(): PokeInstance {
  return {
    uid: 'poke-da-equipe',
    speciesId: ESPECIE.id,
    level: NIVEL,
    isShiny: false,
    rarity: 'comum',
    exp: 0,
    ivs: { hp: 10, atkFis: 10, atkEsp: 10, def: 10, defEsp: 10, speed: 10 },
    stats: { hp: 100, atkFis: 50, atkEsp: 50, def: 50, defEsp: 50, speed: 50 },
    hp: 100,
    unlockedAbilities: ESPECIE.abilities
      .filter((a) => a.levelReq <= NIVEL)
      .map((a) => a.key)
      .filter((k) => getAbility(k)),
    activeAbilities: activeAbilitiesPadrao(ESPECIE, NIVEL),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useGameStateStore.setState({ team: [poke()], activeIndex: 0 })
  usePokeProfileStore.setState({ open: null })
})
afterEach(cleanup)

describe('TeamMenu — atalho pros golpes', () => {
  it('o card tem um botao Golpes que abre o perfil JA na aba de golpes', async () => {
    render(<TeamMenu />)

    await userEvent.click(screen.getByRole('button', { name: /golpes/i }))

    const aberto = usePokeProfileStore.getState().open
    expect(aberto?.poke.uid).toBe('poke-da-equipe')
    expect(aberto?.aba).toBe('golpes')
  })

  it('selecionar não cobre a ficha; perfil completo continua disponível', async () => {
    render(<TeamMenu />)

    // A seleção fica no menu; abrir o perfil é uma ação explícita.
    await userEvent.click(screen.getByRole('button', { name: `Selecionar ${ESPECIE.name}` }))
    expect(usePokeProfileStore.getState().open).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ver perfil completo' }))
    expect(usePokeProfileStore.getState().open?.poke.uid).toBe('poke-da-equipe')
    expect(usePokeProfileStore.getState().open?.aba).toBeUndefined()
  })
  it('ações usam o integrante selecionado e a ficha se recupera quando ele sai', async () => {
    const second = { ...poke(), uid: 'segundo', speciesId: 'squirtle' }
    useGameStateStore.setState({ team: [poke(), second] })
    render(<TeamMenu />)
    await userEvent.click(screen.getByRole('button', { name: `Selecionar ${SPECIES.squirtle.name}` }))
    await userEvent.click(screen.getByRole('button', { name: /golpes/i }))
    expect(usePokeProfileStore.getState().open?.poke.uid).toBe('segundo')
    await userEvent.click(screen.getByRole('button', { name: /colocar em campo|pôr em campo/i }))
    expect(controller.setActiveTeamIndex).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: /retirar/i }))
    expect(controller.removeFromTeam).toHaveBeenCalledWith('segundo')
    act(() => useGameStateStore.setState({ team: [poke()] }))
    expect(screen.getByRole('button', { name: `Selecionar ${ESPECIE.name}` }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: /retirar/i })).toBeNull()
  })
})
