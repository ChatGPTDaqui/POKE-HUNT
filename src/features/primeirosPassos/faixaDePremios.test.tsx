// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useDiarioStore } from '@/stores/diarioStore'
import { usePassosStore } from '@/stores/passosStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { FaixaDePremios } from './FaixaDePremios'

vi.mock('@/data/remote/servidor', async (orig) => ({ ...(await orig<object>()), servidorAtivo: () => false }))

afterEach(cleanup)

function diario(coletados: string[], abatesBase = 0) {
  useDiarioStore.setState({ carregado: true, dia: '2026-10-10', abatesBase, coletados: new Set(coletados), loginsNoMes: 0 })
}

beforeEach(() => {
  useGameStateStore.setState({ trainer: { name: 'T', level: 3, exp: 0 }, pokedexKills: {} })
  usePassosStore.setState({ carregado: true, reivindicados: new Set(), niveisColetados: new Set() })
})

describe('uma faixa só de prêmios no topo', () => {
  it('dois ou mais prêmios prontos viram UMA linha com Coletar tudo', () => {
    useGameStateStore.setState({ trainer: { name: 'T', level: 12, exp: 0 } })
    diario([])
    render(<FaixaDePremios />)
    expect(screen.getByText('3 prêmios para coletar')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Coletar tudo' })).toHaveLength(1)
    expect(screen.queryByText(/Login do mês/)).toBeNull()
    expect(screen.queryByText(/prêmios de treinador/)).toBeNull()
  })

  it('um prêmio só mostra a faixa dele', () => {
    diario([])
    render(<FaixaDePremios />)
    expect(screen.getByText('Login do mês: dia 1')).toBeTruthy()
    expect(screen.queryByText(/prêmios para coletar/)).toBeNull()
  })

  it('sem prêmio pronto e depois dos Primeiros Passos: só a meta do dia, não o marco de treinador', () => {
    usePassosStore.setState({ reivindicados: new Set(['primeiros_abates', 'nivel_5', 'primeira_captura', 'equipe_de_dois', 'primeiro_lord', 'primeira_missao', 'primeira_especialidade', 'estagio_2', 'primeira_evolucao', 'treinador_10', 'tres_biomas']) })
    diario(['login'])
    render(<FaixaDePremios />)
    expect(screen.getByText('Meta do dia: 100 abates')).toBeTruthy()
    expect(screen.queryByText(/Próximo prêmio no Lv/)).toBeNull()
  })

  it('durante os Primeiros Passos, sem prêmio pronto, não mostra faixa nenhuma', () => {
    diario(['login'])
    const { container } = render(<FaixaDePremios />)
    expect(container.textContent).toBe('')
  })
})
