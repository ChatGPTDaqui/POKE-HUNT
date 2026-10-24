// @vitest-environment jsdom
// Mural de lideres: lideres atuais com o ginasio, hall com defesas/mandatos,
// nome abre o perfil, e os vazios.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as rpc from '@/data/remote/ginasiosRpc'
import { useUiStore } from '@/stores/uiStore'
import { MuralDeLideres } from './MuralDeLideres'

vi.mock('@/data/remote/ginasiosRpc', () => ({ muralDeLideres: vi.fn() }))
afterEach(() => cleanup())

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><MuralDeLideres /></QueryClientProvider>)
}

describe('MuralDeLideres', () => {
  it('lista lideres e hall; o nome abre o perfil publico', async () => {
    const abrir = vi.fn()
    useUiStore.setState({ abrirPerfilPublico: abrir })
    vi.mocked(rpc.muralDeLideres).mockResolvedValue({
      atuais: [{ ginasioId: 'FIRE_300', liderId: 'u1', liderNome: 'Bia', mandatoAte: new Date(Date.now() + 3 * 86_400_000).toISOString() }],
      hall: [{ userId: 'u1', nome: 'Bia', defesas: 12, mandatos: 2, ginasiosAtuais: 1 }],
    })
    montar()
    expect(await screen.findByText('Ginásio das Chamas · Liga Campeã')).toBeTruthy()
    expect(screen.getByLabelText('12 defesas vencidas')).toBeTruthy()
    expect(screen.getByText('Lidera 1 ginásio')).toBeTruthy()
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Bia' })[0])
    expect(abrir).toHaveBeenCalledWith({ userId: 'u1', nome: 'Bia' })
  })

  it('sem lider humano convida a destronar', async () => {
    vi.mocked(rpc.muralDeLideres).mockResolvedValue({ atuais: [], hall: [] })
    montar()
    expect(await screen.findByText(/Todos os ginásios ainda têm líder NPC/)).toBeTruthy()
    expect(screen.getByText('Ninguém defendeu um ginásio ainda.')).toBeTruthy()
  })
})
