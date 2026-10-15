// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PokedexMenu } from './PokedexMenu'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'

beforeEach(() => {
  useGameStateStore.setState({ pokedexKills: { pikachu: { normal: 12, shiny: 3 } } })
  useWorldStore.setState({ mapDef: null })
  usePokeProfileStore.setState({ open: null })
})
afterEach(cleanup)

describe('Pokédex — grade e ficha de pesquisa', () => {
  it('seleciona sem abrir perfil e mantém contagem normal e shiny', () => {
    render(<PokedexMenu />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Pokémon' }), { target: { value: 'pikachu' } })
    const choice = screen.getByRole('button', { name: 'Selecionar Pikachu' })
    fireEvent.click(choice)
    expect(choice.getAttribute('aria-pressed')).toBe('true')
    expect(within(choice).getByText('Abates: 15')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Ficha de Pikachu' })).toBeTruthy()
    expect(usePokeProfileStore.getState().open).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Abates Totais/ }))
    expect(within(choice).getByText('✨ 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver perfil completo' }))
    expect(usePokeProfileStore.getState().open?.species.id).toBe('pikachu')
  })
  it('muda a ficha com o filtro e não deixa uma espécie fora da busca visível', () => {
    render(<PokedexMenu />)
    const search = screen.getByRole('textbox', { name: 'Buscar Pokémon' })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Pikachu' }))
    fireEvent.change(search, { target: { value: 'bulbasaur' } })
    expect(screen.queryByRole('region', { name: 'Ficha de Pikachu' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Ficha de Bulbasaur' })).toBeTruthy()
    fireEvent.change(search, { target: { value: 'sem-especie-xyz' } })
    expect(screen.queryByRole('region', { name: /Ficha de/ })).toBeNull()
    expect(screen.getByText('Nenhum Pokemon encontrado.')).toBeTruthy()
  })
  it('as setas andam pela Pokédex inteira, nao pelo que a busca deixou visivel', () => {
    render(<PokedexMenu />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Pokémon' }), { target: { value: 'pikachu' } })
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Pikachu' }))
    fireEvent.click(screen.getByRole('button', { name: /Próximo/i }))
    // So o Pikachu casa com a busca; a seta tem que sair dele.
    expect(screen.queryByRole('region', { name: 'Ficha de Pikachu' })).toBeNull()
    expect(screen.getByRole('region', { name: /Ficha de / })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Anterior/i }))
    expect(screen.getByRole('region', { name: 'Ficha de Pikachu' })).toBeTruthy()
  })
  it('a seta anda uma especie por vez na ordem do numero e da a volta no fim', () => {
    render(<PokedexMenu />)
    const titulo = () => screen.getByRole('region', { name: /Ficha de / }).getAttribute('aria-label')
    const primeira = titulo()
    fireEvent.click(screen.getByRole('button', { name: /Anterior/i }))
    const ultima = titulo()
    expect(ultima).not.toBe(primeira)
    fireEvent.click(screen.getByRole('button', { name: /Próximo/i }))
    expect(titulo()).toBe(primeira)
  })
})
