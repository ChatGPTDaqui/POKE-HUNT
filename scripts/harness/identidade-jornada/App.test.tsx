// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { App } from './App'
import { GROUPS, PRIMARY, filterItems } from './data'

afterEach(cleanup)

describe('protótipo isolado da Jornada do Treinador', () => {
  it('apresenta cinco destinos com nomes explícitos e aviso de demonstração', () => {
    render(<App />)
    expect(screen.getByText('PROTÓTIPO VISUAL')).toBeTruthy()
    const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    expect(nav.getAllByRole('button').map(button => button.textContent)).toEqual([...PRIMARY])
  })
  it('troca diretamente de painel e devolve foco ao fechar com Esc', () => {
    render(<App />)
    const equipe = screen.getByRole('button', { name: 'Equipe' })
    equipe.focus()
    fireEvent.click(equipe)
    expect(screen.getByRole('heading', { name: 'Equipe', level: 1 })).toBe(document.activeElement)
    const mochila = screen.getByRole('button', { name: 'Mochila' })
    mochila.focus()
    fireEvent.click(mochila)
    expect(screen.getByRole('heading', { name: 'Mochila', level: 1 })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('heading', { name: 'Mochila', level: 1 }), { key: 'Escape' })
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(document.activeElement).toBe(mochila)
  })
  it('preserva todos os destinos do guia com acesso direto, inclusive Hospital', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    for (const destination of GROUPS.flatMap(group => [...group.destinations])) {
      expect(screen.getByRole('button', { name: `${destination.name}: ${destination.description}` })).toBeTruthy()
    }
    fireEvent.click(screen.getByRole('button', { name: 'Hospital: Recuperação e retorno' }))
    expect(screen.getByRole('heading', { name: 'Hospital', level: 1 })).toBeTruthy()
    expect(screen.getByText(/Aqui nenhum deles é executado/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao Menu' }))
    expect(screen.getByRole('heading', { name: 'Menu', level: 1 })).toBeTruthy()
  })
  it('seleciona um integrante sem alterar o parceiro até a ação explícita', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Equipe' }))
    fireEvent.click(screen.getByRole('button', { name: /Ver ficha de Pikachu/ }))
    expect(screen.getByRole('region', { name: 'Ficha de Pikachu' })).toBeTruthy()
    expect(screen.getByRole('meter', { name: 'HP do Pokémon em campo demonstrativo' }).getAttribute('aria-valuenow')).toBe('82')
    fireEvent.click(screen.getByRole('button', { name: 'Colocar em campo' }))
    expect(screen.getByRole('status').textContent).toContain('Nenhum save foi alterado')
    expect(screen.getByRole('meter', { name: 'HP do Pokémon em campo demonstrativo' }).getAttribute('aria-valuenow')).toBe('68')
  })
  it('filtra itens, explica o vazio e limpa filtros sem consumir inventário', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Mochila' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar item' }), { target: { value: 'inexistente' } })
    expect(screen.getByRole('heading', { name: 'Nenhum item encontrado' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('button', { name: 'Poké Ball, quantidade 48' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Prévia da ação' }))
    expect(screen.getByRole('status').textContent).toContain('nenhum item foi usado')
    expect(screen.getByRole('button', { name: 'Poké Ball, quantidade 48' })).toBeTruthy()
  })
  it('mantém a busca tolerante a acentos e a categoria selecionada', () => {
    expect(filterItems('Poké Bolas', 'poke').map(item => item.id)).toEqual(['poke_ball'])
    expect(filterItems('Recuperação', 'ball')).toEqual([])
  })
  it('consulta a Pokédex e comunica busca sem resultados', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Pokédex' }))
    fireEvent.click(screen.getByRole('button', { name: 'Consultar Eevee na Pokédex' }))
    expect(screen.getByRole('region', { name: 'Registro de Eevee' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar Pokémon' }), { target: { value: 'inexistente' } })
    expect(screen.getByRole('heading', { name: 'Nenhum registro encontrado' })).toBeTruthy()
  })
})
