// @vitest-environment jsdom
// Historico do ginasio: quem venceu, tempo, repasse do lider e lista vazia.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as rpc from '@/data/remote/ginasiosRpc'
import { HistoricoDoGinasio } from './HistoricoDoGinasio'

vi.mock('@/data/remote/ginasiosRpc', () => ({ historicoDoGinasio: vi.fn() }))
afterEach(() => cleanup())

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><HistoricoDoGinasio ginasioId="FIRE_100" /></QueryClientProvider>)
}

describe('HistoricoDoGinasio', () => {
  it('mostra vencedor, tempo e o ouro do lider', async () => {
    const agora = new Date().toISOString()
    vi.mocked(rpc.historicoDoGinasio).mockResolvedValue([
      { desafiante: 'Ana', lider: 'Bia', liderHumano: true, duelo: 'insignia', resultado: 'derrota', ticks: 2460, repasse: 15000, quando: agora },
      { desafiante: 'Caio', lider: 'Bia', liderHumano: true, duelo: 'destronar', resultado: 'vitoria', ticks: 1800, repasse: 0, quando: agora },
    ])
    montar()
    expect(await screen.findByText(/Bia defendeu · 41s/)).toBeTruthy()
    expect(screen.getByText(/\+15\.000 ao líder/)).toBeTruthy()
    expect(screen.getByText(/Caio venceu · 30s/)).toBeTruthy()
    expect(screen.getByLabelText('Para destronar')).toBeTruthy()
  })

  it('sem desafios avisa', async () => {
    vi.mocked(rpc.historicoDoGinasio).mockResolvedValue([])
    montar()
    expect(await screen.findByText('Ninguém desafiou este ginásio ainda.')).toBeTruthy()
  })
})
