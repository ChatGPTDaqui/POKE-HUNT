// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatLog } from './ChatLog'
import { useUiStore } from '@/stores/uiStore'
import { useToastStore } from '@/stores/toastStore'
import { useChatStore } from '@/stores/chatStore'

vi.mock('@/features/social/usePedirAmizade', () => ({
  usePedirAmizade: () => ({ pedir() {}, enviando: false, souEu: () => false }),
}))
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  useUiStore.setState({ chatOpen: true, chatTab: 'log', winPos: {}, footerHeight: 120 })
  useChatStore.setState({ iniciarAoVivo: () => () => {}, rascunho: 'Minha mensagem ainda não enviada', mensagens: [] })
  useToastStore.setState({ chatLines: {
    log: [{ id: 'log', seq: 2, message: 'Abate recente', type: 'gold' }],
    sistema: [{ id: 'system', seq: 1, message: 'Aviso anterior', type: 'info' }], trade: [],
  } })
})
afterEach(cleanup)

describe('comunicador compacto Jornada', () => {
  it('mostra três canais sem repetir o título Chat na janela aberta', () => {
    render(<ChatLog />)
    for (const name of ['Log', 'Mundo', 'Comércio']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByText('Chat', { exact: true })).toBeNull()
  })
  it('preserva avisos do sistema no Log em ordem de chegada, sem modificar as stores', () => {
    render(<ChatLog />)
    const anterior = screen.getByText('Aviso anterior')
    const recente = screen.getByText('Abate recente')
    expect(anterior.compareDocumentPosition(recente) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(useToastStore.getState().chatLines.log).toHaveLength(1)
    expect(useToastStore.getState().chatLines.sistema).toHaveLength(1)
  })
  it('minimiza e restaura canal, histórico e rascunho', () => {
    const view = render(<ChatLog embedded />)
    fireEvent.click(screen.getByRole('button', { name: 'Mundo' }))
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('Minha mensagem ainda não enviada')
    fireEvent.click(screen.getByRole('button', { name: 'Recolher chat' }))
    expect(screen.getByText('Chat')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Expandir chat' }))
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('Minha mensagem ainda não enviada')
    view.unmount()
    render(<ChatLog embedded />)
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('Minha mensagem ainda não enviada')
    expect(useToastStore.getState().chatLines.log).toHaveLength(1)
  })
  it('amplia só quando solicitado e fica no fluxo do rodapé mobile', () => {
    render(<ChatLog embedded />)
    const janela = document.querySelector<HTMLElement>('[data-window="chat"]')!
    expect(janela.style.position).toBe('relative')
    expect(janela.style.width).toBe('calc(100% - 56px)')
    const altura = janela.style.height
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar chat' }))
    expect(janela.style.height).not.toBe(altura)
    fireEvent.click(screen.getByRole('button', { name: 'Reduzir chat' }))
    expect(janela.style.height).toBe(altura)
  })
})
