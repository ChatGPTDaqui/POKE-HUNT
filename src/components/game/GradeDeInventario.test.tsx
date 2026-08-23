// @vitest-environment jsdom
//
// PH-114 — a grade de inventario substituiu um `<select>`, entao ela precisa
// entregar o que o `<select>` entregava de graca.
//
// O QUE ESTE TESTE TRANCA
//
// Trocar elemento nativo por `<button>` pintado perde acessibilidade em
// silencio: o slot desenha uma IMAGEM, e imagem sem `aria-label` e um botao sem
// nome nenhum — quem usa leitor de tela passa a ouvir "botao, botao, botao" no
// lugar de uma lista de POKE. A tela continua bonita e o dado continua certo,
// entao nada denuncia.
//
// Tambem tranca a semantica de ESCOLHA UNICA (`radiogroup`/`radio` +
// `aria-checked`): sem ela, nada no DOM diz qual slot esta selecionado, e um
// refactor futuro que troque a borda por outra classe passaria batido.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { GradeDeInventario, type SlotDeInventario } from './GradeDeInventario'

const SLOTS: SlotDeInventario[] = [
  { id: 'poke-ball', rotulo: 'Poke Ball (x30)', contador: 30, conteudo: <img alt="" src="a.png" /> },
  { id: 'super-ball', rotulo: 'Super Ball (x4)', contador: 4, conteudo: <img alt="" src="b.png" /> },
  { id: 'pedra-fogo', rotulo: 'Pedra do Fogo', conteudo: <img alt="" src="c.png" /> },
]

afterEach(cleanup)

describe('GradeDeInventario (PH-114)', () => {
  it('cada slot e um radio com nome acessivel', () => {
    render(
      <GradeDeInventario rotuloDoGrupo="Item para anunciar" slots={SLOTS} selecionado={null} onSelecionar={vi.fn()} />,
    )
    // Pelo ROTULO, nao por indice: e o rotulo que some se alguem esquecer o
    // `aria-label`, e e ele que este teste existe pra proteger.
    expect(screen.getByRole('radio', { name: 'Poke Ball (x30)' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Super Ball (x4)' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Pedra do Fogo' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Item para anunciar' })).toBeTruthy()
  })

  it('clicar num slot devolve o id dele', () => {
    const onSelecionar = vi.fn()
    render(
      <GradeDeInventario rotuloDoGrupo="Item" slots={SLOTS} selecionado="poke-ball" onSelecionar={onSelecionar} />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Super Ball (x4)' }))
    expect(onSelecionar).toHaveBeenCalledWith('super-ball')
  })

  it('so o slot selecionado esta marcado', () => {
    render(
      <GradeDeInventario rotuloDoGrupo="Item" slots={SLOTS} selecionado="super-ball" onSelecionar={vi.fn()} />,
    )
    const marcados = screen.getAllByRole('radio').filter((el) => el.getAttribute('aria-checked') === 'true')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].getAttribute('aria-label')).toBe('Super Ball (x4)')
  })

  it('o contador aparece so em quem tem quantidade', () => {
    // Item unico nao leva "x1" pendurado: o numero existe pra dizer QUANTOS
    // sobraram, e "1" em cima de tudo e ruido em cada slot da grade.
    render(
      <GradeDeInventario rotuloDoGrupo="Item" slots={SLOTS} selecionado={null} onSelecionar={vi.fn()} />,
    )
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('4')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Pedra do Fogo' }).textContent).toBe('')
  })

  it('grade vazia nao explode', () => {
    // Chamador ja trata "mochila vazia" antes de montar a grade, mas o
    // componente nao pode depender disso pra nao quebrar.
    render(<GradeDeInventario rotuloDoGrupo="Item" slots={[]} selecionado={null} onSelecionar={vi.fn()} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })
})
