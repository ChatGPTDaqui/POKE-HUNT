// @vitest-environment jsdom
// Defesa do ginasio: o lider monta 6 POKEs do tipo, golpes e Rotacao/Inteligente,
// e so salva quando a equipe e valida.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import * as rpc from '@/data/remote/ginasiosRpc'
import { DefesaDoGinasio } from './DefesaDoGinasio'

vi.mock('@/data/remote/ginasiosRpc', async (original) => ({
  ...(await original<typeof rpc>()),
  definirDefesaDoGinasio: vi.fn(),
}))

const insetos = ['scyther', 'pinsir', 'heracross', 'scizor', 'butterfree', 'beedrill']
  .map((id, i) => createPokeInstance(createRng(i + 1), id, 90, { uid: `${id}-1` }))
const ratinho = createPokeInstance(createRng(9), 'rattata', 90, { uid: 'rattata-1' })

const ginasio: rpc.GinasioNoEstado = {
  id: 'BUG_100', tipo: 'BUG', faixa: 100, taxa: 50_000, liderId: 'eu', liderNome: 'Eu', equipe: [],
  mandatoAte: new Date(Date.now() + 86_400_000).toISOString(), ganhos: 0, defesa: [],
  candidatoNome: null, candidatoTicks: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  useGameStateStore.setState({ team: insetos.slice(0, 3), bagPokes: [...insetos.slice(3), ratinho] })
  useMochilaStore.setState({ carregada: true, erro: null })
  vi.mocked(rpc.definirDefesaDoGinasio).mockResolvedValue({ mensagem: 'Defesa do ginásio salva.' })
})
afterEach(() => cleanup())

describe('DefesaDoGinasio', () => {
  it('a caixa so oferece POKEs do tipo e o salvar so libera com 6', async () => {
    const user = userEvent.setup()
    render(<DefesaDoGinasio g={ginasio} aoSalvar={async () => {}} />)
    expect(screen.getByText('Faltam 6 POKEs BUG.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Salvar defesa' }) as HTMLButtonElement).disabled).toBe(true)

    for (let i = 0; i < 6; i++) {
      await user.click(screen.getByRole('button', { name: `Adicionar POKE à vaga ${i + 1}` }))
      const caixa = screen.getByRole('region', { name: `Escolher POKE para a vaga ${i + 1}` })
      expect(within(caixa).queryByText('Rattata')).toBeNull()
      await user.click(within(caixa).getAllByRole('button').filter((b) => b.classList.contains('candidate'))[0])
    }
    expect(screen.getByText('Pronta para salvar.')).toBeTruthy()

    // Rotacao no 1o POKE.
    await user.click(screen.getAllByRole('button', { name: 'Golpes' })[0])
    await user.click(screen.getByRole('radio', { name: /Rotação/ }))
    await user.click(screen.getByRole('button', { name: 'Salvar defesa' }))

    const [id, slots] = vi.mocked(rpc.definirDefesaDoGinasio).mock.calls[0]
    expect(id).toBe('BUG_100')
    expect(slots).toHaveLength(6)
    expect(slots[0].rotacao).toBe(true)
    expect(slots.slice(1).every((s) => !s.rotacao)).toBe(true)
    // Os POKEs da defesa ganham o cadeado na hora.
    const todos = [...useGameStateStore.getState().team, ...useGameStateStore.getState().bagPokes]
    expect(todos.filter((p) => p.locked).map((p) => p.uid).sort()).toEqual(slots.map((s) => s.pokemonId).sort())
  })
})
