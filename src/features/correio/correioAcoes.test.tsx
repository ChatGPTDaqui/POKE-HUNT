// @vitest-environment jsdom
//
// PH-74: as regras da caixa que so aparecem no botao.
//
// Duas delas nao sao cosmeticas — excluir mensagem com anexo nao coletado
// DESTRUIRIA o item (ele ja saiu do inventario de quem mandou, e a coleta e o
// unico caminho de volta), e excluir pedido de amizade pendente deixaria a
// outra ponta esperando resposta pra sempre. A RPC recusa os dois casos; estes
// testes garantem que o jogador descobre isso antes do erro.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MensagemCorreio } from '@/data/remote/servidor'
import { useGameStateStore } from '@/stores/gameStateStore'
import { LinhaDeMensagem } from './LinhaDeMensagem'
import { ComporMensagem } from './ComporMensagem'

function msg(over: Partial<MensagemCorreio> = {}): MensagemCorreio {
  return {
    id: 'm1',
    de_id: 'outro',
    de_nome: 'Ash',
    tipo: 'texto',
    assunto: 'Oi',
    corpo: 'tudo bem?',
    estado: 'pendente',
    created_at: '2026-08-22T10:00:00Z',
    ...over,
  }
}

const acoes = () => ({
  onMarcarLida: vi.fn(),
  onResponderPedido: vi.fn(),
  onColetar: vi.fn(),
  onResponder: vi.fn(),
  onExcluir: vi.fn(),
})

function renderLinha(m: MensagemCorreio, enviada = false) {
  const fns = acoes()
  render(
    <LinhaDeMensagem
      m={m}
      enviada={enviada}
      respondendo={false}
      coletando={false}
      excluindo={false}
      {...fns}
    />,
  )
  return fns
}

afterEach(cleanup)

describe('excluir mensagem', () => {
  it('fica travado enquanto ha anexo nao coletado — excluir destruiria o item', async () => {
    renderLinha(msg({ anexo_itens: [{ itemId: 'pokeball', quantity: 3 }], anexo_coletado_em: null }))
    const botao = screen.getByRole('button', { name: /Excluir Oi/i })
    expect(botao.hasAttribute('disabled')).toBe(true)
    expect(botao.getAttribute('title')).toContain('Colete o anexo')
  })

  it('libera depois que o anexo foi coletado', () => {
    renderLinha(msg({
      anexo_itens: [{ itemId: 'pokeball', quantity: 3 }],
      anexo_coletado_em: '2026-08-22T11:00:00Z',
    }))
    expect(screen.getByRole('button', { name: /Excluir Oi/i }).hasAttribute('disabled')).toBe(false)
  })

  it('fica travado em pedido de amizade pendente — a outra ponta espera resposta', () => {
    renderLinha(msg({ tipo: 'pedido_amizade', assunto: 'Pedido de amizade', estado: 'pendente' }))
    const botao = screen.getByRole('button', { name: /Excluir Pedido de amizade/i })
    expect(botao.hasAttribute('disabled')).toBe(true)
    expect(botao.getAttribute('title')).toContain('Responda ao pedido')
  })

  it('libera pedido ja respondido', () => {
    renderLinha(msg({ tipo: 'pedido_amizade', assunto: 'Pedido de amizade', estado: 'recusado' }))
    expect(screen.getByRole('button', { name: /Excluir Pedido de amizade/i }).hasAttribute('disabled')).toBe(false)
  })

  it('chama a acao com o id da mensagem', async () => {
    const fns = renderLinha(msg())
    await userEvent.click(screen.getByRole('button', { name: /Excluir Oi/i }))
    expect(fns.onExcluir).toHaveBeenCalledWith('m1')
  })
})

describe('responder', () => {
  it('nao aparece em pedido de amizade — ali a resposta sao Aceitar/Recusar', () => {
    renderLinha(msg({ tipo: 'pedido_amizade', assunto: 'Pedido de amizade' }))
    expect(screen.queryByRole('button', { name: /Responder a/i })).toBeNull()
    expect(screen.getByRole('button', { name: /Aceitar/i })).toBeTruthy()
  })

  it('nao aparece em aviso do sistema, que nao tem remetente', () => {
    renderLinha(msg({ tipo: 'sistema', de_id: null, de_nome: 'Sistema' }))
    expect(screen.queryByRole('button', { name: /Responder a/i })).toBeNull()
  })

  it('nao aparece na caixa de enviados', () => {
    renderLinha(msg({ para_nome: 'Misty' }), true)
    expect(screen.queryByRole('button', { name: /Responder a/i })).toBeNull()
  })
})

describe('caixa de enviados', () => {
  it('mostra o DESTINATARIO, nao o remetente', () => {
    renderLinha(msg({ para_nome: 'Misty' }), true)
    expect(screen.getByText(/para Misty/)).toBeTruthy()
    expect(screen.queryByText(/de Ash/)).toBeNull()
  })

  it('nao oferece Coletar no anexo — quem coleta e o outro lado', () => {
    renderLinha(msg({ para_nome: 'Misty', anexo_itens: [{ itemId: 'pokeball', quantity: 1 }] }), true)
    expect(screen.queryByRole('button', { name: /Coletar/i })).toBeNull()
    expect(screen.getByText('Nao coletado')).toBeTruthy()
  })
})

describe('anexar item ao escrever', () => {
  beforeEach(() => {
    useGameStateStore.setState({
      items: { pokeball: 10, superball: 4, masterball: 1 },
      lockedItems: { masterball: true },
    })
  })

  it('nao oferece item travado — a RPC recusa e a opcao so daria erro', () => {
    render(
      <ComporMensagem enviando={false} onCancelar={vi.fn()} onEnviar={vi.fn()} />,
    )
    const seletor = screen.getByLabelText('Item para anexar')
    const opcoes = within(seletor).getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(opcoes).toContain('pokeball')
    expect(opcoes).not.toContain('masterball')
  })

  it('tira o item da lista depois de anexado, pra nao entrar duas vezes', async () => {
    render(<ComporMensagem enviando={false} onCancelar={vi.fn()} onEnviar={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText('Item para anexar'), 'pokeball')
    await userEvent.click(screen.getByRole('button', { name: 'Anexar' }))

    // Duas entradas do mesmo item burlariam a checagem de saldo no servidor:
    // cada uma passaria sozinha contra o mesmo estoque.
    const opcoes = within(screen.getByLabelText('Item para anexar'))
      .getAllByRole('option').map((o) => o.getAttribute('value'))
    expect(opcoes).not.toContain('pokeball')
  })

  it('envia nick, assunto, corpo e anexos juntos', async () => {
    const onEnviar = vi.fn()
    render(<ComporMensagem enviando={false} onCancelar={vi.fn()} onEnviar={onEnviar} />)

    await userEvent.type(screen.getByPlaceholderText('Nome do treinador'), 'Misty')
    await userEvent.type(screen.getByPlaceholderText('Sobre o que e'), 'Presente')
    await userEvent.type(screen.getByPlaceholderText('Escreva aqui'), 'toma ai')
    await userEvent.selectOptions(screen.getByLabelText('Item para anexar'), 'superball')
    await userEvent.click(screen.getByRole('button', { name: 'Anexar' }))
    await userEvent.click(screen.getByRole('button', { name: /Enviar/i }))

    expect(onEnviar).toHaveBeenCalledWith({
      nick: 'Misty',
      assunto: 'Presente',
      corpo: 'toma ai',
      anexos: [{ itemId: 'superball', quantity: 1 }],
    })
  })

  it('nao deixa enviar sem destinatario nem sem assunto', async () => {
    render(<ComporMensagem enviando={false} onCancelar={vi.fn()} onEnviar={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Escreva aqui'), 'so o corpo')
    expect(screen.getByRole('button', { name: /Enviar/i }).hasAttribute('disabled')).toBe(true)
  })

  it('no modo resposta nao pede nick nem assunto, e nao oferece anexo', async () => {
    const onEnviar = vi.fn()
    render(
      <ComporMensagem
        respondendoA={{ id: 'm1', deNome: 'Ash', assunto: 'Oi' }}
        enviando={false}
        onCancelar={vi.fn()}
        onEnviar={onEnviar}
      />,
    )
    expect(screen.queryByPlaceholderText('Nome do treinador')).toBeNull()
    // Anexo fora da resposta de proposito: senao toda resposta rapida vira um
    // caminho de saida de item.
    expect(screen.queryByLabelText('Item para anexar')).toBeNull()
    expect(screen.getByText(/Re: Oi/)).toBeTruthy()

    await userEvent.type(screen.getByPlaceholderText('Escreva aqui'), 'tudo certo')
    await userEvent.click(screen.getByRole('button', { name: /Enviar/i }))
    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ corpo: 'tudo certo', anexos: [] }))
  })
})
