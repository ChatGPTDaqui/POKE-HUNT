// @vitest-environment jsdom
//
// PH-494: a janela de chat ENCOSTA na borda esquerda da tela.
//
// Pedido do dono do projeto: "mover o chat do jogo para a esquerda, tocando a
// tela". Ela já morava no canto inferior esquerdo, mas com `left: .8em` — um
// vão pequeno o bastante para ninguém chamar de bug e grande o bastante para a
// janela ler como solta sobre o campo de jogo, com cenário aparecendo dos dois
// lados dela.
//
// POR QUE ISTO PRECISA DE TESTE, sendo "uma linha de CSS". Duas razões, e as
// duas já morderam este projeto:
//
//   1. É POSIÇÃO, e a suíte deste repo tem histórico de deixar passar defeito de
//      posição — a lição do PH-485, em que o selo de atributo caiu em cima da
//      placa de nome e nenhum teste olhava coordenada. Perguntar "renderizou?"
//      não responde "onde?".
//   2. A REGRA TEM DOIS RAMOS, e o segundo é o que se perde numa refatoração:
//      a janela ARRASTADA tem que continuar ganhando da posição padrão. Um
//      `left: 0` escrito direto no `className` (em vez de no ramo certo do
//      ternário) prenderia a janela na borda para sempre, e o arrasto viraria
//      um gesto que não faz nada.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'

import { ChatLog } from './ChatLog'
import { useUiStore } from '@/stores/uiStore'

// A aba Mundo abre um canal ao vivo no `useEffect` de montagem. Aqui não há
// rede nem sessão, e o que este arquivo mede é a caixa da janela — não o
// conteúdo dela.
vi.mock('@/stores/chatStore', () => ({
  useChatStore: Object.assign(
    (seletor: (s: unknown) => unknown) => seletor({
      mensagens: [],
      rascunho: '',
      setRascunho() {},
      enviar() {},
      carregando: false,
      erro: null,
      iniciarAoVivo: () => () => {},
    }),
    { getState: () => ({}) },
  ),
}))

vi.mock('@/features/social/usePedirAmizade', () => ({
  usePedirAmizade: () => ({ pedir() {}, enviando: false, souEu: () => false }),
}))

// `scrollIntoView` não existe no jsdom, e o chat rola até a última mensagem ao
// montar. Sem o stub o `useEffect` estoura e a árvore inteira desmonta — e o
// teste falharia por ambiente, não por posição.
Element.prototype.scrollIntoView = () => {}

/** A janela em si — `data-window="chat"` é como o próprio arrasto a acha. */
function janela(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-window="chat"]')
  if (!el) throw new Error('a janela de chat não renderizou')
  return el
}

describe('a janela de chat encosta na esquerda (PH-494)', () => {
  beforeEach(() => {
    useUiStore.setState({ winPos: {}, chatOpen: true } as never, false)
  })
  afterEach(cleanup)

  it('no lugar padrao ela fica em left: 0, sem vao nenhum', () => {
    render(<ChatLog />)
    expect(janela().style.left).toBe('0px')
  })

  it('e ancorada por BAIXO, nao por cima — o rodape continua sendo respeitado', () => {
    // A margem só sumiu na horizontal. Encostar embaixo também poria a janela
    // por cima da doca (Equipe, Mochila), que é o defeito que o cálculo de
    // `bottom` existe pra evitar. Sem este caso, trocar `bottom` por `top: 0`
    // passaria no teste de cima.
    render(<ChatLog />)
    expect(janela().style.bottom, 'a ancoragem vertical sumiu').not.toBe('')
    expect(janela().style.top).toBe('')
  })

  it('os cantos da ESQUERDA ficam retos enquanto ela esta encostada', () => {
    // Canto arredondado contra a borda da tela deixa passar uma lasca de
    // cenário dentro do que devia ser a moldura — é ela que denuncia que a
    // janela não encosta de verdade.
    render(<ChatLog />)
    expect(janela().className).toContain('rounded-r-xl')
    expect(janela().className).not.toContain('rounded-xl ')
  })

  it('ARRASTADA, a posicao do jogador ganha — e os quatro cantos voltam', () => {
    // O ramo que se perde numa refatoração. Se `left: 0` for parar no
    // `className`, o arrasto vira um gesto que não faz nada.
    useUiStore.setState({ winPos: { chat: { x: 320, y: 90 } } } as never, false)
    render(<ChatLog />)
    expect(janela().style.left).toBe('320px')
    expect(janela().style.top).toBe('90px')
    expect(janela().style.bottom, 'janela arrastada nao pode ficar presa ao rodape').toBe('')
    expect(janela().className).toContain('rounded-xl')
  })
})
