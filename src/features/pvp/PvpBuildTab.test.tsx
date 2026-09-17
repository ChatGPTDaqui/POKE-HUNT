// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import { PvpBuildTab } from './PvpBuildTab'
import * as rpc from '@/data/remote/pvpRpc'

vi.mock('@/data/remote/pvpRpc', () => ({ meuTimePvp: vi.fn(), salvarTimePvp: vi.fn() }))
const charizard = createPokeInstance(createRng(1), 'charizard', 80, { uid: 'charizard-1' })
const lapras = createPokeInstance(createRng(2), 'lapras', 82, { uid: 'lapras-1' })
beforeEach(() => {
  vi.resetAllMocks()
  useGameStateStore.setState({ team: [charizard], bagPokes: [lapras] })
  useMochilaStore.setState({ carregada: true, erro: null })
  vi.mocked(rpc.meuTimePvp).mockResolvedValue({ pokemonIds: [charizard.uid], atualizadoEm: '' })
})
afterEach(cleanup)

describe('Formação PvP', () => {
  it('mantém a formação ao buscar e só aplica a escolha depois de o servidor salvar', async () => {
    const user = userEvent.setup()
    let resolve!: (value: rpc.TimePvp) => void
    vi.mocked(rpc.salvarTimePvp).mockImplementation(() => new Promise((r) => { resolve = r }))
    render(<PvpBuildTab />)
    const adicionar = await screen.findByRole('button', { name: 'Adicionar Pokémon ao slot 2' })
    await user.click(adicionar)
    expect(screen.getByText('Charizard')).toBeTruthy()
    const busca = screen.getByRole('textbox', { name: 'Buscar Pokémon para PvP' })
    expect(document.activeElement).toBe(busca)
    await user.type(busca, 'lap')
    const lista = screen.getByRole('region', { name: 'Escolher Pokémon para slot 2' })
    await user.click(within(lista).getByRole('button', { name: /Lapras.*Lv 82/ }))
    expect(rpc.salvarTimePvp).toHaveBeenCalledWith([charizard.uid, lapras.uid])
    expect(screen.getByRole('status').textContent).toBe('Salvando…')
    expect((screen.getByRole('button', { name: 'Remover Charizard do time' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => resolve({ pokemonIds: [charizard.uid, lapras.uid], atualizadoEm: '' }))
    expect(screen.queryByRole('textbox', { name: 'Buscar Pokémon para PvP' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remover Lapras do time' })).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('Trocar')
  })

  it('preserva o time e a seleção quando o salvamento falha', async () => {
    vi.mocked(rpc.salvarTimePvp).mockRejectedValue(new Error('Falha simulada'))
    render(<PvpBuildTab />)
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar Pokémon ao slot 2' }))
    await userEvent.click(screen.getByRole('button', { name: /Lapras.*Lv 82/ }))
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe('Salvando…'))
    expect(screen.getByRole('textbox', { name: 'Buscar Pokémon para PvP' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remover Lapras do time' })).toBeNull()
    expect(screen.getByText('Charizard')).toBeTruthy()
  })

  it('não permite criar buracos no time e devolve o foco ao fechar por Escape', async () => {
    render(<PvpBuildTab />)
    const adicionar = await screen.findByRole('button', { name: 'Adicionar Pokémon ao slot 2' })
    expect((screen.getByRole('button', { name: 'Adicionar Pokémon ao slot 3' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(adicionar)
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(adicionar)
  })

  it('falha de leitura mostra recuperação e não uma formação vazia', async () => {
    vi.mocked(rpc.meuTimePvp).mockRejectedValueOnce(new Error('offline'))
    render(<PvpBuildTab />)
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Adicionar Pokémon/ })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Charizard')).toBeTruthy()
  })
})
