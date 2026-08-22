// @vitest-environment jsdom
//
// O caminho ate os 4 golpes. A gestao vive dentro do perfil do POKE, numa aba
// que nada anunciava: o jogador tinha que clicar no card e DEPOIS descobrir a
// aba "Golpes". A Equipe e onde ele administra o POKE, entao e onde o atalho
// tem que existir — e ele precisa abrir JA na aba certa, senao troca um passo
// escondido por outro.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

  it('clicar no card continua abrindo em Status, como sempre', async () => {
    render(<TeamMenu />)

    // O card inteiro e clicavel; os botoes dentro dele param a propagacao.
    await userEvent.click(screen.getByText(ESPECIE.name))

    expect(usePokeProfileStore.getState().open?.aba).toBeUndefined()
  })
})
