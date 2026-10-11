// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChatsCircle } from '@phosphor-icons/react'
import { Painel } from './Painel'
import { JourneyDestination } from './JourneyDestination'
import { GameButton } from './controls'
import { useUiStore } from '@/stores/uiStore'

beforeEach(() => {
  const camada = document.createElement('div')
  camada.id = 'camada-hud'
  document.body.append(camada)
  useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, coarsePointer: true,
    footerHeight: 160, navHeight: 64 })
})
afterEach(() => {
  cleanup()
  document.getElementById('camada-hud')?.remove()
})

describe('fundação Jornada opt-in', () => {
  it.each([390, 1366])('preserva legado e encaminha aparência em %ipx', (width) => {
    useUiStore.setState({ viewportWidth: width, viewportHeight: 844, coarsePointer: width < 900 })
    const props = { winKey: 'panel' as const, widthEm: 28, zIndex: 31, onClose: vi.fn(), title: 'Mais' }
    const view = render(<Painel {...props} appearance="legacy">Conteúdo</Painel>)
    expect(document.querySelector('[data-window]')?.getAttribute('data-appearance')).toBe('legacy')
    view.rerender(<Painel {...props}>Conteúdo</Painel>)
    expect(document.querySelector('[data-window]')?.getAttribute('data-appearance')).toBe('journey')
    expect(screen.getByText('Conteúdo')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('mantém snap curto acima do rodapé medido, sem capturar toques da navegação', () => {
    const fechar = vi.fn()
    render(<Painel appearance="journey" winKey="panel" widthEm={28} zIndex={31} snap="conteudo" onClose={fechar} title="Mais">
      <button data-keep-open>Destino</button>
    </Painel>)
    const sheet = document.querySelector<HTMLElement>('[data-window]')!
    expect(sheet.style.bottom).toContain('160px')
    expect(sheet.style.bottom).toContain('0.5em')
    expect(sheet.style.height).toBe('')
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Destino' }))
    expect(fechar).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    expect(fechar).toHaveBeenCalledTimes(1)
  })

  it('ajusta por conteúdo por padrão sem impedir expansão explícita', () => {
    const props = { winKey: 'profile' as const, widthEm: 28, zIndex: 46, onClose: vi.fn(), title: 'Ficha' }
    const view = render(<Painel {...props}>Ficha curta</Painel>)
    const sheet = document.querySelector<HTMLElement>('[data-window]')!
    expect(sheet.style.top).toBe('')
    expect(sheet.style.height).toBe('')
    expect(sheet.style.maxHeight).toContain('calc(')
    view.rerender(<Painel {...props} snap="cheia">Lista longa</Painel>)
    expect(sheet.style.top).not.toBe('')
    expect(sheet.style.bottom).toContain('64px')
  })

  it('mantém mensagem, contador acessível e ação de um destino', () => {
    const abrir = vi.fn()
    render(<JourneyDestination label="Social" Icon={ChatsCircle} badge={3} detalhe="2 mensagens · 1 anexo" onClick={abrir} />)
    expect(screen.getByRole('status').getAttribute('aria-label')).toBe('Social: 2 mensagens · 1 anexo')
    fireEvent.click(screen.getByRole('button'))
    expect(abrir).toHaveBeenCalledTimes(1)
  })

  it('não transforma cadeado em botão inerte: mantém explicação no toque', () => {
    const explicar = vi.fn()
    render(<JourneyDestination label="Social" Icon={ChatsCircle} trancado="estagio_2" onClick={explicar} />)
    const button = screen.getByRole('button')
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.getAttribute('data-locked')).toBe('true')
    fireEvent.click(button)
    expect(explicar).toHaveBeenCalledTimes(1)
  })

  it('mantém carregamento e bloqueio dos controles ao acrescentar o gancho visual', () => {
    const acao = vi.fn()
    render(<GameButton variant="primary" carregando onClick={acao}>Confirmar</GameButton>)
    const button = screen.getByRole('button')
    expect(button.getAttribute('data-game-button')).toBe('primary')
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(acao).not.toHaveBeenCalled()
  })
})
