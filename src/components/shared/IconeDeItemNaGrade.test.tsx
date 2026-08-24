// @vitest-environment jsdom
//
// PH-123 — item SEM arte na grade de inventario.
//
// O QUE ESTE TESTE TRANCA
//
// `Good Rod` e `Old Rod` nao tem icone no acervo. Na lista antiga isso nao
// importava: o nome estava escrito do lado. Na grade o slot virou um quadrado
// anonimo — e o defeito nao quebra nada, so deixa o jogador sem saber o que tem
// na mochila (visto ao vivo, e o motivo desta issue).
//
// A sigla e decoracao pra leitor de tela, e por isso ela e `aria-hidden`: o nome
// completo ja esta no `aria-label` do slot, e sem isso o leitor diria
// "GR Good Rod".
import { describe, expect, it, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { IconeDeItemNaGrade, siglaDoItem } from './IconeDeItemNaGrade'

vi.mock('@/data/sprites', () => ({
  itemIconUrl: (id: string) => (id === 'sem_arte' ? null : 'assets/item-icons/x.png'),
  itemIconBorderColor: () => null,
}))

afterEach(cleanup)

describe('sigla de item sem arte (PH-123)', () => {
  it('duas palavras viram iniciais; uma palavra vira tres letras', () => {
    expect(siglaDoItem('Good Rod')).toBe('GR')
    expect(siglaDoItem('Antidote')).toBe('ANT')
    expect(siglaDoItem('  Max   Revive ')).toBe('MR')
  })

  it('nome vazio nao estoura', () => {
    // Item com nome vazio nao deveria existir, mas um catalogo gerado errado nao
    // pode derrubar a mochila inteira.
    expect(siglaDoItem('')).toBe('?')
  })

  it('sem arte, desenha a sigla', () => {
    render(<IconeDeItemNaGrade itemId="sem_arte" nome="Good Rod" />)
    expect(screen.getByText('GR')).toBeTruthy()
  })

  it('com arte, nao desenha texto nenhum', () => {
    const { container } = render(<IconeDeItemNaGrade itemId="poke_ball" nome="Poke Ball" />)
    expect(container.textContent).toBe('')
    expect(container.querySelector('img')).toBeTruthy()
  })
})
