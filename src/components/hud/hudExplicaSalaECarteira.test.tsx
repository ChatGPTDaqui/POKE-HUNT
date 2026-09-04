// @vitest-environment jsdom
// PH-165 — o chip de sala e a carteira passam a explicar o que mostram, e a
// explicacao abre NO DEDO.
//
// Os dois eram os exemplos dos dois padroes errados que o inventario
// (`docs/19-explicacao-flutuante.md`) enumera:
//
//   SALA      nao tinha explicacao NENHUMA. "Sala 3/10 Relvado 24 restam" nao
//             diz de quantas salas um estagio e feito, que cada uma pede 30 abates, nem o
//             que acontece ao limpar a decima.
//   CARTEIRA  tinha `title=` nativo com o valor cheio. No celular, onde o numero
//             aparece ABREVIADO ("1B"), o valor exato simplesmente nao existia —
//             o `title` e hover, e dedo nao faz hover.
//
// O caso do toque e o que costuma apodrecer, entao ele e testado nos dois: o
// mecanismo do `Explicacao` separa dedo de mouse pelo `pointerType` do evento
// real, e uma bolha que so abre no hover volta a ser o defeito de origem sem
// quebrar nada.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import {
  ABATES_POR_SALA, SUB_BIOMA_POR_CHAVE, BIOMAS,
} from '@/data/biomas'
import { SALAS_POR_ESTAGIO } from '@/data/estagios'
import { SalaChip } from './SalaChip'
import { Carteira } from './Carteira'

/** Abre a bolha pelo caminho do DEDO, que e o que o `title=` nunca teve. */
function tocar(elemento: HTMLElement): void {
  fireEvent.pointerDown(elemento, { pointerType: 'touch' })
  fireEvent.click(elemento)
}

/**
 * Uma chave de sub-bioma DE VERDADE, do primeiro bioma da ordem.
 *
 * `protetorDaSala` resolve o bioma por `SUB_BIOMA_POR_CHAVE[sala.chave]` e cai
 * em `null` pra chave desconhecida — com uma chave inventada o caso "sala sem
 * protetor" passaria por acidente, medindo a chave errada em vez da regra.
 */
const CHAVE = Object.keys(SUB_BIOMA_POR_CHAVE)
  .find((k) => SUB_BIOMA_POR_CHAVE[k].bioma.chave === BIOMAS[0].chave)!

function porNaSala(indice: number, abates: number, ciclos = 0) {
  useWorldStore.setState({
    sala: { indice, abates, ciclos, chave: CHAVE },
    mapDef: { levelRange: [1, 30] },
  } as never, false)
}

/** O nome que o chip escreve pra `CHAVE` — o gatilho da bolha nos casos abaixo. */
const NOME_DA_SALA = SUB_BIOMA_POR_CHAVE[CHAVE].sub.nome

describe('o chip de sala explica o que e uma sala (PH-165)', () => {
  beforeEach(() => porNaSala(2, 6))
  afterEach(() => {
    cleanup()
    useWorldStore.setState({ sala: null, mapDef: null } as never, false)
  })

  it('o chip sozinho nao carrega a explicacao — ela vive na bolha', () => {
    render(<SalaChip />)
    expect(screen.getByText(/Sala/)).toBeTruthy()
    expect(screen.queryByText(new RegExp(`${ABATES_POR_SALA} abates`))).toBeNull()
  })

  it('tocar no chip abre os numeros da hunt, e eles saem da MESMA fonte do motor', () => {
    render(<SalaChip />)
    tocar(screen.getByText(NOME_DA_SALA))

    // `SALAS_POR_ESTAGIO` e `ABATES_POR_SALA` importados: se o ritmo da hunt mudar
    // e o texto ficar pra tras, este caso fica vermelho em vez de a bolha passar
    // a mentir em silencio — que e o modo de falha da regra 3 do glossario.
    expect(screen.getByText(new RegExp(`de ${SALAS_POR_ESTAGIO[0]} a ${SALAS_POR_ESTAGIO[SALAS_POR_ESTAGIO.length - 1]} salas`))).toBeTruthy()
    expect(screen.getByText(new RegExp(`${ABATES_POR_SALA} abates pra limpar`))).toBeTruthy()
  })

  it('a bolha diz o que o chip nao coube dizer: faixa de nivel e abates que faltam', () => {
    render(<SalaChip embutido />)
    tocar(screen.getByText(NOME_DA_SALA))
    expect(screen.getByText(/selvagens de Lv/)).toBeTruthy()
    expect(screen.getByText(new RegExp(`faltam ${ABATES_POR_SALA - 6} de ${ABATES_POR_SALA}`))).toBeTruthy()
  })

  it('a regra do protetor so entra quando a sala PAROU por causa dele', () => {
    // DOIS CORTES QUE NAO SERVEM, e por que:
    //
    //   "a sala tem protetor" — em bioma da ordem TODA sala tem
    //   (`protetorDaSala` devolve `guardian` ate a nona e `lord` na decima).
    //   Nao corta nada.
    //
    //   "o protetor esta vivo" — verdadeiro desde o primeiro segundo da sala.
    //   Tambem nao corta: visto na tela, a sala 9 recem-entrada, com 0 de 30
    //   abates, ja ensinava a regra do Lord.
    //
    // O corte tem de ser a QUOTA FECHADA, o mesmo predicado do aviso "Derrote o
    // Guardiao" que o chip ja mostra. Ele importa porque a soma dos dois
    // verbetes passa de 12 linhas e, em 390px, cobre o campo de jogo inteiro —
    // e nenhuma regra do glossario pega isso: cada verbete respeita "1 a 3
    // frases", quem estoura e a soma.
    useWorldStore.setState({ protetorResolvido: false } as never, false)

    // Sala em andamento, protetor vivo: a regra AINDA nao aparece.
    render(<SalaChip />)
    tocar(screen.getByText(NOME_DA_SALA))
    expect(screen.queryByText(/Guardião e Lord/)).toBeNull()

    // Quota fechada e sala parada: agora sim, e e a resposta pra "por que 30/30
    // nao avanca".
    cleanup()
    porNaSala(2, ABATES_POR_SALA)
    render(<SalaChip />)
    tocar(screen.getByText(NOME_DA_SALA))
    expect(screen.getByText(/Guardião e Lord/)).toBeTruthy()

    // Mesma sala fechada, protetor ja derrubado: a regra sai e a bolha encolhe.
    cleanup()
    useWorldStore.setState({ protetorResolvido: true } as never, false)
    render(<SalaChip />)
    tocar(screen.getByText(NOME_DA_SALA))
    expect(screen.queryByText(/Guardião e Lord/)).toBeNull()
    // O verbete de sala continua — quem saiu foi so o segundo.
    expect(screen.getByText(new RegExp(`de ${SALAS_POR_ESTAGIO[0]} a ${SALAS_POR_ESTAGIO[SALAS_POR_ESTAGIO.length - 1]} salas`))).toBeTruthy()
  })

  it('fora de hunt nao ha chip nenhum', () => {
    useWorldStore.setState({ sala: null } as never, false)
    const { container } = render(<SalaChip />)
    expect(container.firstChild).toBeNull()
  })
})

describe('a carteira mostra o valor exato sem `title=` (PH-165)', () => {
  beforeEach(() => {
    useGameStateStore.setState({ wallet: { gold: 1_002_017_245, diamonds: 1_234_567 } } as never, false)
  })
  afterEach(cleanup)

  it('abreviada na tela, exata na bolha', () => {
    const { container } = render(<Carteira abreviada />)
    // Abreviado e o que cabe no trilho de 390px — 13 digitos ja empurraram o
    // avatar do treinador pra fora da tela uma vez.
    expect(container.textContent).toContain('1B')
    expect(container.textContent).not.toContain('1.002.017.245')

    tocar(screen.getByText(/1B/))
    expect(screen.getByText(/1\.002\.017\.245 ouro/)).toBeTruthy()
    expect(screen.getByText(/1\.234\.567 diamantes/)).toBeTruthy()
  })

  it('a bolha tambem diz o que cada moeda e', () => {
    render(<Carteira abreviada />)
    tocar(screen.getByText(/1B/))
    expect(screen.getByText(/Ouro sai de abate/)).toBeTruthy()
    expect(screen.getByText(/não cai de abate/)).toBeTruthy()
  })

  it('nenhum `title=` sobrou no elemento', () => {
    // O atributo em si: se alguem reintroduzir o `title` "pra garantir", ele
    // volta a competir com a bolha pelo mesmo gesto no PC.
    const { container } = render(<Carteira abreviada />)
    expect(container.querySelector('[title]')).toBeNull()
  })
})
