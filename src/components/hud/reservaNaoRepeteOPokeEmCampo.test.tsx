// @vitest-environment jsdom
//
// PH-382: o trilho de reservas desenhava o POKE que estava EM CAMPO.
//
// O trilho tirava as reservas com `team.slice(1)`, apoiado no invariante
// "`team[0]` e o POKE em campo". O invariante e real (`definir_ativo` rotaciona
// o escolhido pro slot 0 e grava `active_team_index = 0` sempre), mas a troca
// automatica por desmaio o quebrava: ela so apontava `activeIndex` pro proximo
// POKE vivo, sem rotacionar a equipe.
//
// Com `activeIndex = 1` o resultado na tela era o relato do jogador (conta
// Vinny, 01/09): o `StatusRail` desenhava `team[1]` — certo, e quem esta em
// campo — e o trilho desenhava `team.slice(1)`, entao o MESMO POKE aparecia nos
// dois lugares. Mesma instancia, logo o nivel e o HP da "reserva" subiam junto
// com os do POKE de campo, e o POKE do slot 0 (um Eevee Lv 1) desaparecia da
// tela.
//
// O conserto do invariante mora no motor (`simulation.ts#trocarPorDesmaio`) e na
// carga (`playerMapper.ts#snapshotToGameState`). Este teste tranca a OUTRA
// metade: o trilho tira as reservas de `activeIndex`, entao mesmo com o
// invariante quebrado ele nao repete POKE na tela.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useUiStore } from '@/stores/uiStore'
import { ReservasRail } from './ReservasRail'

vi.mock('@/engine/controller', () => ({
  controller: { setActiveTeamIndex: vi.fn(), reorderTeam: vi.fn() },
}))

const ESPECIES = ['charmander', 'bulbasaur', 'squirtle']

function equipeComAtivoEm(indiceAtivo: number) {
  const equipe = ESPECIES.map((id, i) => createPokeInstance(createRng(i + 1), id, 10 + i))
  useGameStateStore.setState({ team: equipe, activeIndex: indiceAtivo })
  return equipe
}

beforeEach(() => {
  useGameStateStore.getState().resetToDefaults()
  useUiStore.setState({ viewportWidth: 1440, viewportHeight: 900, coarsePointer: false })
  usePokeProfileStore.setState({ open: null })
})
afterEach(cleanup)

describe('o trilho nunca repete o POKE em campo (PH-382)', () => {
  it('com activeIndex fora do slot 0, o POKE em campo nao aparece como reserva', () => {
    const equipe = equipeComAtivoEm(1)
    render(<ReservasRail />)

    const emCampo = SPECIES[equipe[1].speciesId].name
    expect(
      screen.queryByRole('button', { name: new RegExp(emCampo, 'i') }),
      'o POKE em campo apareceu no trilho de reservas',
    ).toBeNull()
  })

  it('o POKE do slot 0 nao desaparece da tela quando o ativo e outro', () => {
    const equipe = equipeComAtivoEm(1)
    render(<ReservasRail />)

    // Com `slice(1)` este POKE nao era desenhado em lugar nenhum: nem no
    // StatusRail (que le `team[activeIndex]`) nem aqui.
    const slotZero = SPECIES[equipe[0].speciesId].name
    expect(screen.getByRole('button', { name: new RegExp(slotZero, 'i') })).toBeTruthy()
  })

  it('desenha uma reserva por POKE que nao esta em campo, sem duplicata', () => {
    equipeComAtivoEm(1)
    render(<ReservasRail />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })
})
