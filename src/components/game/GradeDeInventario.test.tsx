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
    // O evento vai junto do id desde o PH-118 — e ele que a Mochila le pra
    // saber se foi Shift+clique (linkar no chat) em vez de selecao.
    expect(onSelecionar).toHaveBeenCalledWith('super-ball', expect.anything())
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

  // PH-118 — a grade virou a forma de listar inventario no jogo inteiro, e a
  // venda em lote da Loja marca vários POKE de uma vez.
  describe('modo multiplo (PH-118)', () => {
    it('slot vira caixa de selecao, e o grupo deixa de ser radiogroup', () => {
      // Pintar checkbox com role de radio mentiria sobre poder marcar varios, e
      // `radiogroup` com filhos `checkbox` e ARIA invalido — o leitor de tela
      // para de anunciar a contagem.
      render(
        <GradeDeInventario
          rotuloDoGrupo="POKEs para vender" modo="multiplo"
          slots={SLOTS} selecionado={null} selecionados={new Set()} onSelecionar={vi.fn()}
        />,
      )
      expect(screen.getAllByRole('checkbox')).toHaveLength(3)
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.queryByRole('radiogroup')).toBeNull()
      expect(screen.getByRole('group', { name: 'POKEs para vender' })).toBeTruthy()
    })

    it('mais de um slot pode estar marcado', () => {
      // O caso que o modo existe pra permitir. No modo unico este numero e 1 por
      // construcao, entao sem este caso nada distingue os dois modos.
      render(
        <GradeDeInventario
          rotuloDoGrupo="POKEs" modo="multiplo"
          slots={SLOTS} selecionado={null}
          selecionados={new Set(['poke-ball', 'pedra-fogo'])} onSelecionar={vi.fn()}
        />,
      )
      const marcados = screen.getAllByRole('checkbox').filter((el) => el.getAttribute('aria-checked') === 'true')
      expect(marcados.map((el) => el.getAttribute('aria-label'))).toEqual(['Poke Ball (x30)', 'Pedra do Fogo'])
    })

    it('`selecionado` nao marca nada no modo multiplo', () => {
      // Os dois estados coexistem nas props. Se o modo multiplo lesse
      // `selecionado`, um chamador que passe os dois marcaria um slot fantasma.
      render(
        <GradeDeInventario
          rotuloDoGrupo="POKEs" modo="multiplo"
          slots={SLOTS} selecionado="super-ball" selecionados={new Set()} onSelecionar={vi.fn()}
        />,
      )
      expect(screen.getAllByRole('checkbox').filter((el) => el.getAttribute('aria-checked') === 'true')).toHaveLength(0)
    })
  })

  it('slot desabilitado nao dispara selecao', () => {
    // POKE trancado na venda em lote. Desabilitado e nao ausente: um POKE que
    // desaparece da grade manda o jogador procurar o que nao esta perdido.
    const onSelecionar = vi.fn()
    render(
      <GradeDeInventario
        rotuloDoGrupo="POKEs"
        slots={[{ id: 'travado', rotulo: 'Charmander (trancado)', desabilitado: true, conteudo: <img alt="" src="d.png" /> }]}
        selecionado={null} onSelecionar={onSelecionar}
      />,
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Charmander (trancado)' }))
    expect(onSelecionar).not.toHaveBeenCalled()
  })

  it('a marca de canto aparece dentro do slot', () => {
    // A grade esconde texto: numa lista o cadeado tinha coluna propria. Sem a
    // marca, "trancado" so apareceria depois de selecionar — e o jogador
    // descobriria a trava ao tentar vender.
    render(
      <GradeDeInventario
        rotuloDoGrupo="Itens"
        slots={[{ id: 'x', rotulo: 'Poke Ball (trancada)', marca: <span>TRAVA</span>, conteudo: <img alt="" src="e.png" /> }]}
        selecionado={null} onSelecionar={vi.fn()}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Poke Ball (trancada)' }).textContent).toContain('TRAVA')
  })

  it('grade vazia nao explode', () => {
    // Chamador ja trata "mochila vazia" antes de montar a grade, mas o
    // componente nao pode depender disso pra nao quebrar.
    render(<GradeDeInventario rotuloDoGrupo="Item" slots={[]} selecionado={null} onSelecionar={vi.fn()} />)
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })
})
