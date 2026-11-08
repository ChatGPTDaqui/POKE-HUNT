// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useCenaStore } from '@/stores/cenaStore'
import { CamadaDeCena } from './CamadaDeCena'
import { SUSPENSE_DA_EVOLUCAO, SUSPENSE_DO_OVO, TEMPO_NA_TELA } from './roteiroDaCena'

let agora = 0
const relogio = () => agora
async function avancar(seg: number) {
  for (let i = 0; i < Math.ceil(seg / 0.1); i++) {
    agora += 0.1
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
}

afterEach(() => { cleanup(); useCenaStore.setState({ fila: [] }); agora = 0 })

describe('cena de evolucao', () => {
  it('suspense, revelacao quando o servidor confirma, e fecha sozinha', async () => {
    let confirmar!: (v: { ok: boolean }) => void
    useCenaStore.getState().iniciar({
      tipo: 'evolucao', deId: 'charmander', deNome: 'Charmander', paraId: 'charmeleon', paraNome: 'Charmeleon',
      isShiny: false, resultado: new Promise((r) => { confirmar = r as typeof confirmar }),
    })
    render(<CamadaDeCena relogio={relogio} />)
    await avancar(0.3)
    expect(screen.getByRole('status').textContent).toContain('está evoluindo')
    await avancar(SUSPENSE_DA_EVOLUCAO + 0.5)
    expect(screen.getByRole('status').textContent, 'sem resposta do servidor nao revela').toContain('está evoluindo')
    await act(async () => { confirmar({ ok: true }) })
    await avancar(0.4)
    expect(screen.getByRole('status').textContent).toContain('evoluiu para Charmeleon')
    await avancar(TEMPO_NA_TELA + 0.5)
    expect(useCenaStore.getState().fila).toHaveLength(0)
  })

  it('servidor recusou: para de evoluir', async () => {
    useCenaStore.getState().iniciar({
      tipo: 'evolucao', deId: 'charmander', deNome: 'Charmander', paraId: 'charmeleon', paraNome: 'Charmeleon',
      isShiny: false, resultado: Promise.resolve({ ok: false }),
    })
    render(<CamadaDeCena relogio={relogio} />)
    await avancar(SUSPENSE_DA_EVOLUCAO + 0.3)
    expect(screen.getByRole('status').textContent).toContain('parou de evoluir')
  })
})

describe('cena do ovo', () => {
  it('a cena vive no store: continua mesmo depois que o cartao do ovo some', async () => {
    useCenaStore.getState().iniciar({
      tipo: 'ovo',
      ovo: { id: 'o1', speciesId: 'charmander', raridade: 'raro', shiny: false, naEquipe: true, abatesRestantes: 0 } as never,
      resultado: Promise.resolve({ pokeId: 'p1', speciesId: 'charmander', rarity: 'raro', isShiny: false, local: 'team' }),
    })
    render(<CamadaDeCena relogio={relogio} />)
    await avancar(SUSPENSE_DO_OVO + 0.6)
    expect(screen.getByRole('status').textContent).toContain('Charmander nasceu!')
    expect(screen.getByRole('status').textContent).toContain('na sua equipe')
  })
})
