// @vitest-environment jsdom
//
// PH-109 — abrir o ConfirmDialog nao pode fechar a janela de tras.
//
// O QUE ESTE TESTE TRANCA
//
// `GameWindow` fecha em qualquer `pointerdown` cujo alvo nao esteja dentro de
// `[data-window]` ou `[data-keep-open]`. O ConfirmDialog e montado como IRMAO
// da arvore de janelas (em `JogoCarregado`), entao sem marcador todo clique
// nele conta como "fora": vender um POKE Shiny na Loja fechava a Loja, e
// clicar em "Cancelar" fechava tambem.
//
// Nao testa o atributo, testa o COMPORTAMENTO. Um teste que asseverasse
// `data-keep-open` no DOM passaria mesmo se `GameWindow` trocasse o nome do
// marcador — e e justamente essa combinacao que traz o bug de volta.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { GameWindow } from '@/components/game/GameWindow'
import { ConfirmDialog } from './ConfirmDialog'
import { useConfirmDialogStore } from '@/stores/confirmDialogStore'

function montarLojaComDialogo(onClose: () => void) {
  return render(
    <>
      <GameWindow winKey="panel" zIndex={31} backdrop={{ zIndex: 30 }} onClose={onClose} title="Loja">
        <button type="button">Vender Shiny</button>
      </GameWindow>
      <ConfirmDialog />
    </>,
  )
}

describe('ConfirmDialog nao fecha a janela de tras (PH-109)', () => {
  beforeEach(() => {
    useConfirmDialogStore.setState({ request: null })
  })
  afterEach(() => {
    cleanup()
    useConfirmDialogStore.setState({ request: null })
  })

  it('confirmar a venda executa a acao e mantem a janela aberta', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    montarLojaComDialogo(onClose)

    act(() => {
      useConfirmDialogStore.getState().confirm({
      title: 'Vender POKE Shiny?',
      message: 'Essa acao nao pode ser desfeita.',
      confirmLabel: 'Vender',
      onConfirm,
      })
    })

    const botao = screen.getByRole('button', { name: 'Vender' })
    // `pointerDown` ANTES do clique, na ordem real do navegador: e o
    // `pointerdown` que o listener de fora-de-clique escuta, e era ele que
    // fechava a Loja antes do `onClick` sequer rodar.
    fireEvent.pointerDown(botao)
    fireEvent.click(botao)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose, 'a Loja fechou ao confirmar a venda').not.toHaveBeenCalled()
  })

  it('cancelar tambem mantem a janela aberta', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    montarLojaComDialogo(onClose)

    act(() => {
      useConfirmDialogStore.getState().confirm({
      title: 'Vender POKE Shiny?',
      message: 'Essa acao nao pode ser desfeita.',
      onConfirm,
      })
    })

    const botao = screen.getByRole('button', { name: 'Cancelar' })
    fireEvent.pointerDown(botao)
    fireEvent.click(botao)

    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose, 'a Loja fechou ao cancelar a confirmacao').not.toHaveBeenCalled()
  })

  it('o fundo escurecido do dialogo fecha SO o dialogo', () => {
    const onClose = vi.fn()
    montarLojaComDialogo(onClose)

    act(() => {
      useConfirmDialogStore.getState().confirm({
      title: 'Vender POKE Shiny?',
      message: 'Essa acao nao pode ser desfeita.',
      onConfirm: vi.fn(),
      })
    })

    const dialogo = screen.getByRole('dialog')
    fireEvent.pointerDown(dialogo)

    expect(useConfirmDialogStore.getState().request, 'o dialogo nao fechou').toBeNull()
    expect(onClose, 'a Loja fechou junto com o dialogo').not.toHaveBeenCalled()
  })

  it('clicar fora de TUDO continua fechando a janela', () => {
    // A contraprova. Sem ela, marcar o documento inteiro como
    // `data-keep-open` passaria nos tres casos acima e mataria o
    // fechamento por toque fora sem ninguem notar.
    const onClose = vi.fn()
    montarLojaComDialogo(onClose)

    fireEvent.pointerDown(document.body)

    expect(onClose, 'o fechamento por toque fora foi perdido').toHaveBeenCalled()
  })
})
