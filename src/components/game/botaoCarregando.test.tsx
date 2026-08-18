// @vitest-environment jsdom
//
// `carregando` no GameButton tem que DESABILITAR, nao so girar.
//
// O giro sozinho e decoracao. O que esses botoes protegem e round-trip sob
// autoridade do servidor: clicar tres vezes em "Comprar" manda tres intencoes,
// e cada uma cobra de verdade — e o defeito que `useAcaoPendente` existe pra
// impedir, ja tendo aparecido duas vezes (PH-8 e PH-13).
//
// O jeito de isso voltar sem ninguem perceber e trivial: `disabled` volta pro
// spread de props no GameButton, alguem reordena as linhas, e o botao continua
// girando bonito enquanto aceita clique. Nenhum teste de logica pega isso.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GameButton } from './controls'

// Sem `@testing-library/jest-dom` neste projeto: os matchers de DOM nao
// existem, entao a asserção le a propriedade do elemento direto.
function botao(): HTMLButtonElement {
  return screen.getByRole('button') as HTMLButtonElement
}

describe('GameButton com carregando', () => {
  afterEach(cleanup)

  it('desabilita enquanto carrega', () => {
    render(<GameButton carregando>Comprar</GameButton>)
    expect(botao().disabled).toBe(true)
    expect(botao().getAttribute('aria-busy')).toBe('true')
  })

  it('nao dispara onClick enquanto carrega', async () => {
    const onClick = vi.fn()
    render(<GameButton carregando onClick={onClick}>Comprar</GameButton>)
    await userEvent.click(botao(), { pointerEventsCheck: 0 })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('continua clicavel quando nao esta carregando', async () => {
    const onClick = vi.fn()
    render(<GameButton carregando={false} onClick={onClick}>Comprar</GameButton>)
    await userEvent.click(botao())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('mantem o rotulo no DOM — a largura do botao nao pode mudar', () => {
    // `invisible`, nao `hidden`: se o rotulo saisse do fluxo, o botao
    // encolheria no clique e a linha inteira da lista pularia. Layout que se
    // mexe sob o dedo e pior que nao ter indicador nenhum.
    render(<GameButton carregando>Colocar a venda</GameButton>)
    expect(screen.getByText('Colocar a venda')).toBeTruthy()
  })

  it('respeita um disabled proprio mesmo sem carregar', () => {
    render(<GameButton disabled carregando={false}>Comprar</GameButton>)
    expect(botao().disabled).toBe(true)
  })

  it('sem a prop, renderiza o filho direto — os botoes antigos nao mudam', () => {
    // A guarda contra regressao visual em massa: `carregando` ausente tem que
    // sair pelo mesmo caminho de antes, sem o <span> extra em volta do filho.
    const { container } = render(<GameButton>Fechar</GameButton>)
    expect(container.querySelector('button > span')).toBeNull()
    expect(botao().disabled).toBe(false)
  })
})
