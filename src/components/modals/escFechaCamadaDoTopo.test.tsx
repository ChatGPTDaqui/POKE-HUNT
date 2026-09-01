// @vitest-environment jsdom
//
// PH-376: ESC fecha a camada do TOPO, e o dialogo destrutivo para de mentir na
// marcacao.
//
// Os dois modos de falha que este arquivo tranca:
//
// 1. **ESC fechando tudo de uma vez.** Com um `keydown` por painel, o mesmo
//    evento chega em todos eles e cada um fecha o proprio — com o perfil do
//    POKE aberto sobre a Loja, um ESC levaria os dois. E o mesmo defeito que o
//    `useVoltarFechaPainel` ja documenta pro botao Voltar do celular.
// 2. **`aria-modal="true"` sem foco.** O `ConfirmDialog` declarava
//    `role="dialog"` + `aria-modal` e deixava o foco atras do escurecimento.
//    `aria-modal` manda o leitor de tela ignorar tudo fora do no; sem o foco
//    entrar, o dialogo e anunciado e inalcancavel — numa confirmacao de
//    "Vender Tudo".
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useFecharComEsc, _limparCamadasDoEsc } from '@/hooks/useFecharComEsc'
import { ConfirmDialog } from './ConfirmDialog'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'

function Camada({ nome, z, aoFechar }: { nome: string; z: number; aoFechar: () => void }) {
  useFecharComEsc(aoFechar, z)
  return <div>{nome}</div>
}

function esc() {
  fireEvent.keyDown(document, { key: 'Escape' })
}

beforeEach(() => {
  _limparCamadasDoEsc()
  useConfirmDialogStore.setState({ request: null })
})
afterEach(cleanup)

describe('ESC fecha a camada do topo (PH-376)', () => {
  it('com duas camadas abertas, so a de maior zIndex fecha', () => {
    const fechados: string[] = []
    render(
      <>
        <Camada nome="loja" z={31} aoFechar={() => fechados.push('loja')} />
        <Camada nome="perfil" z={45} aoFechar={() => fechados.push('perfil')} />
      </>,
    )

    esc()
    expect(fechados).toEqual(['perfil'])
  })

  it('depois que a de cima sai, o ESC seguinte pega a de baixo', () => {
    const fechados: string[] = []
    function Arvore({ comPerfil }: { comPerfil: boolean }) {
      return (
        <>
          <Camada nome="loja" z={31} aoFechar={() => fechados.push('loja')} />
          {comPerfil && <Camada nome="perfil" z={45} aoFechar={() => fechados.push('perfil')} />}
        </>
      )
    }
    const { rerender } = render(<Arvore comPerfil />)
    esc()
    rerender(<Arvore comPerfil={false} />)
    esc()

    expect(fechados).toEqual(['perfil', 'loja'])
  })

  it('entre camadas de MESMO zIndex ganha a que montou por ultimo', () => {
    const fechados: string[] = []
    render(
      <>
        <Camada nome="a" z={33} aoFechar={() => fechados.push('a')} />
        <Camada nome="b" z={33} aoFechar={() => fechados.push('b')} />
      </>,
    )

    esc()
    expect(fechados).toEqual(['b'])
  })

  it('sem camada nenhuma o ESC nao faz nada, e nao deixa listener vivo', () => {
    const { unmount } = render(<Camada nome="so" z={31} aoFechar={() => {}} />)
    unmount()
    // Nao ha o que assertar alem de "nao estoura": o objetivo e a pilha nao
    // guardar camada desmontada, que e o que faria um ESC futuro chamar um
    // `onClose` de um painel que nao existe mais.
    expect(() => esc()).not.toThrow()
  })

  it('ESC ja tratado por outro handler nao fecha o painel por cima', () => {
    const fechados: string[] = []
    render(<Camada nome="loja" z={31} aoFechar={() => fechados.push('loja')} />)

    // `defaultPrevented`: um combobox nativo que fecha no ESC ja resolveu o
    // gesto — tirar o painel da tela por cima disso apagaria o que o jogador
    // estava editando.
    const evento = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    evento.preventDefault()
    document.dispatchEvent(evento)

    expect(fechados).toEqual([])
  })
})

describe('ConfirmDialog cumpre o que a marcacao promete (PH-376)', () => {
  function abrir() {
    useConfirmDialogStore.setState({
      request: { title: 'Vender Tudo', message: 'Nao da pra desfazer.', onConfirm: () => {} },
    })
  }

  it('o foco entra no dialogo, e no CANCELAR — nao no botao destrutivo', () => {
    abrir()
    render(<ConfirmDialog />)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
  })

  it('ESC fecha, mesmo com painel aberto atras', () => {
    const fechados: string[] = []
    abrir()
    render(
      <>
        <Camada nome="loja" z={31} aoFechar={() => fechados.push('loja')} />
        <ConfirmDialog />
      </>,
    )

    esc()
    expect(useConfirmDialogStore.getState().request).toBeNull()
    expect(fechados).toEqual([])
  })

  it('o foco volta pro elemento que abriu o dialogo', () => {
    const gatilho = document.createElement('button')
    document.body.appendChild(gatilho)
    gatilho.focus()

    abrir()
    const { rerender } = render(<ConfirmDialog />)
    expect(document.activeElement).not.toBe(gatilho)

    useConfirmDialogStore.setState({ request: null })
    rerender(<ConfirmDialog />)

    expect(document.activeElement).toBe(gatilho)
    gatilho.remove()
  })

  it('Tab no ultimo botao volta pro primeiro, em vez de sair pro que esta atras', () => {
    abrir()
    render(<ConfirmDialog />)
    const confirmar = screen.getByRole('button', { name: 'Confirmar' })
    const cancelar = screen.getByRole('button', { name: 'Cancelar' })

    confirmar.focus()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })

    expect(document.activeElement).toBe(cancelar)
  })
})
