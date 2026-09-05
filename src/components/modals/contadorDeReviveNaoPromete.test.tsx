// @vitest-environment jsdom
//
// PH-510 — a contagem do Auto-Revive nao afirma o que ela pode nao cumprir.
//
// ---------------------------------------------------------------------------
// O QUE ACONTECIA
// ---------------------------------------------------------------------------
// `autoSystem.ts:161` comeca a contagem olhando so o toggle e o desmaio, nunca
// o inventario. Com o toggle ligado e ZERO item da familia revive, o modal
// dizia "POKE desmaiado! Auto-Revive em... 5", contava ate zero e SUMIA sem
// fazer nada — o POKE seguia no chao e nada na tela dizia por que.
//
// A CONTAGEM SEM ITEM FICOU, e o teste `autoRevive.test.ts` prova por que: ela
// e uma JANELA DE GRACA pra o jogador correr na Loja (que fica na barra durante
// a cacada) e comprar um Revive antes do prazo. La esta o caso que compra no
// meio da contagem e reanima ao chegar a zero.
//
// Ou seja: o defeito nunca foi o contador rodar, e sim o TEXTO prometer. Este
// arquivo tranca o texto; o outro tranca a mecanica que o justifica. Um sem o
// outro deixa metade da decisao sem prova.
//
// ---------------------------------------------------------------------------
// POR QUE OLHAR O TEXTO, E NAO SO "renderizou"
// ---------------------------------------------------------------------------
// Um teste que so perguntasse "o modal aparece?" passaria verde com a frase
// errada — que e exatamente o estado anterior. O que muda entre os dois casos e
// UMA FRASE, entao e a frase que precisa ser afirmada.
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

import { ITEMS, type GeneratedItem } from '@/data/items'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { ReviveCountdownModal } from './ReviveCountdownModal'

const REVIVES = Object.values(ITEMS)
  .filter((i): i is GeneratedItem => 'kind' in i && i.kind === 'revive' && i.reviveHpPercent != null)
  .sort((a, b) => a.buyPrice - b.buyPrice)

/** O revive MAIS CARO — normalmente o Max Revive, que foi o caso da PH-508. */
const CARO = REVIVES[REVIVES.length - 1]

function comContagem(segundos: number | null) {
  useWorldStore.setState({ reviveCountdown: segundos } as never, false)
}

describe('o contador de revive nao promete o que nao pode cumprir (PH-510)', () => {
  beforeEach(() => {
    cleanup()
    useGameStateStore.getState().resetToDefaults()
    useGameStateStore.setState({ items: {} })
  })

  it('sem nenhum revive, avisa que falta o item em vez de prometer o revive', () => {
    comContagem(5)
    render(<ReviveCountdownModal />)

    expect(screen.getByText(/Sem Revive na mochila/)).toBeTruthy()
    // A frase antiga NAO pode sobrar: era ela que mentia.
    expect(screen.queryByText(/Auto-Revive em/)).toBeNull()
    // E o jogador precisa saber o que FAZER com os 5 segundos, senao o aviso so
    // troca uma frase inutil por outra.
    expect(screen.getByText(/Compre um na Loja/)).toBeTruthy()
  })

  it('com revive na mochila, a mensagem e a de sempre', () => {
    useGameStateStore.setState({ items: { [CARO.id]: 3 } })
    comContagem(5)
    render(<ReviveCountdownModal />)

    expect(screen.getByText(/Auto-Revive em/)).toBeTruthy()
    expect(screen.queryByText(/Sem Revive na mochila/)).toBeNull()
  })

  // ESTE CASO E A PH-508 OLHADA PELA TELA, e nao redundancia.
  //
  // O bug de producao foi um jogador com 149 Max Revive e ZERO Revive comum
  // sendo tratado como se nao tivesse revive nenhum. Se o modal reconstruisse a
  // pergunta com `hasItem('revive')` em vez de usar `melhorRevive`, ele
  // repetiria o mesmo erro numa camada nova — e diria "Sem Revive na mochila"
  // pra quem tem 149.
  it('Max Revive conta como revive tambem (o caso da PH-508)', () => {
    useGameStateStore.setState({ items: { max_revive: 149, revive: 0 } })
    comContagem(5)
    render(<ReviveCountdownModal />)

    expect(screen.getByText(/Auto-Revive em/)).toBeTruthy()
    expect(screen.queryByText(/Sem Revive na mochila/)).toBeNull()
  })

  it('sem contagem em andamento nao desenha nada', () => {
    comContagem(null)
    const { container } = render(<ReviveCountdownModal />)
    expect(container.textContent).toBe('')
  })
})
