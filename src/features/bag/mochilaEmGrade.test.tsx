// @vitest-environment jsdom
//
// PH-118 — a Mochila passou de lista de linhas pra grade quadriculada.
//
// O QUE ESTE TESTE TRANCA
//
// A linha antiga carregava TUDO de uma vez: icone, nome, quantidade, descricao,
// cadeado e "Usar". A grade nao tem onde por texto — o slot e um quadrado com
// sprite — entao nome, descricao e acoes passaram pra uma ficha que aparece
// DEPOIS de escolher.
//
// Essa e a troca que pode perder funcionalidade em silencio: a tela continua
// bonita e o inventario continua certo, e o que falta e um botao que ninguem
// procura. Os casos abaixo afirmam que a ficha existe, que ela e do item
// escolhido, e que trancado da as caras SEM precisar selecionar (numa lista o
// cadeado tinha coluna propria; numa grade, se ele nao estiver no slot, o
// jogador descobre a trava so ao tentar vender).
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

import { useGameStateStore } from '@/stores/gameStateStore'
import { ITEMS } from '@/data/items'
import { ItensTab } from './BagMenu'

// A ficha tem cadeado e "Usar", e os dois falam com o servidor. O que este
// teste mede e a TELA, entao as duas pontas viram espiao.
vi.mock('@/data/remote/autoridade', () => ({
  pedirAcao: vi.fn(async (_acao: unknown, local: () => void) => { local(); return { ok: true } }),
  pedirAcaoComLocal: vi.fn(),
}))
vi.mock('@/engine/controller', () => ({ controller: { useItem: vi.fn() } }))

const BALL = 'poke_ball'
const POCAO = Object.keys(ITEMS).find((id) => ITEMS[id].kind === 'potion')!

beforeEach(() => {
  useGameStateStore.setState({
    items: { [BALL]: 30, [POCAO]: 4 },
    lockedItems: { [POCAO]: true },
    team: [],
  })
})
afterEach(cleanup)

describe('Mochila em grade (PH-118)', () => {
  it('cada item e um slot com nome acessivel e contador', () => {
    render(<ItensTab />)
    expect(screen.getByRole('radiogroup', { name: 'Itens da mochila' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: `${ITEMS[BALL].name} (x30)` })).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
  })

  it('item trancado se anuncia no proprio slot', () => {
    // Pelo ROTULO: e ele que o leitor de tela le, e a marca visual (cadeado no
    // canto) nao existe pra quem nao ve a tela.
    render(<ItensTab />)
    expect(screen.getByRole('radio', { name: `${ITEMS[POCAO].name} (x4) — trancado` })).toBeTruthy()
  })

  it('sem escolher nada, nao ha ficha — e escolher abre a do item certo', () => {
    render(<ItensTab />)
    // Antes de escolher: nenhuma descricao na tela. Se a ficha aparecesse
    // sozinha com o primeiro item, o jogador acharia que escolheu algo.
    expect(screen.queryByText(ITEMS[BALL].description)).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: `${ITEMS[BALL].name} (x30)` }))
    expect(screen.getByText(ITEMS[BALL].description)).toBeTruthy()
    // A descricao do OUTRO item nao entra junto — a ficha e de um item so.
    expect(screen.queryByText(ITEMS[POCAO].description)).toBeNull()
  })

  it('a ficha traz o cadeado, que era a acao da linha', () => {
    render(<ItensTab />)
    // Nenhum cadeado antes de escolher: ele mora na ficha.
    expect(screen.queryByRole('button', { name: 'Trancar' })).toBeNull()

    fireEvent.click(screen.getByRole('radio', { name: `${ITEMS[BALL].name} (x30)` }))
    const trancar = screen.getByRole('button', { name: 'Trancar' })
    fireEvent.click(trancar)
    expect(useGameStateStore.getState().lockedItems[BALL]).toBe(true)
  })

  it('escolher o item trancado mostra a ficha com o botao de DESTRANCAR', () => {
    render(<ItensTab />)
    fireEvent.click(screen.getByRole('radio', { name: `${ITEMS[POCAO].name} (x4) — trancado` }))
    expect(screen.getByRole('button', { name: 'Destrancar' })).toBeTruthy()
  })

  it('item que zera fecha a ficha em vez de mostrar um item que nao existe', () => {
    // A ficha e derivada da lista de ids, e nao guardada em estado proprio.
    // Guardar o objeto do item deixaria uma ficha de "x0" na tela depois de usar
    // a ultima pocao — e o botao "Usar" continuaria ali.
    render(<ItensTab />)
    fireEvent.click(screen.getByRole('radio', { name: `${ITEMS[BALL].name} (x30)` }))
    expect(screen.getByText(ITEMS[BALL].description)).toBeTruthy()

    // `act`: o store e externo ao React, entao sem isto o React 19 nao libera o
    // re-render antes das assercoes e o teste mediria o DOM velho.
    act(() => { useGameStateStore.setState({ items: { [POCAO]: 4 } }) })
    expect(screen.queryByText(ITEMS[BALL].description)).toBeNull()
    expect(screen.queryByRole('radio', { name: `${ITEMS[BALL].name} (x30)` })).toBeNull()
  })
})
