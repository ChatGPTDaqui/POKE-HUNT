// A fila de celebracao coalesce o que precisa e nao junta o que nao pode
// (PH-192).
//
// Sem coalescencia, dois abates seguidos que dao nivel enfileiram dois cartoes e
// travam a tela por 2x a duracao — dizendo quase a mesma coisa. E a juncao tem
// que entrar no que JA ESTA NA TELA (indice 0), nao so na fila de tras: mesclar
// so o que espera deixaria o cartao dizendo "Nv 33" enquanto o POKE ja esta em
// 35, e informacao desatualizada na tela e pior que cartao repetido.
import { beforeEach, describe, expect, it } from 'vitest'
import { celebracaoStore, type Celebracao } from './celebracaoStoreVanilla'
import type { StatBlock } from '@/data/pokes'

const GANHO: StatBlock = { hp: 3, atkFis: 2, atkEsp: 1, def: 2, defEsp: 1, speed: 1 }

function nivel(de: number, ate: number, extra: Partial<Extract<Celebracao, { tipo: 'nivel' }>> = {}): Celebracao {
  return {
    tipo: 'nivel', especieId: 'charmeleon', nome: 'Charmeleon',
    nivelInicial: de, nivel: ate, ganhos: GANHO, golpesNovos: [], isShiny: false,
    ...extra,
  }
}

const EVOLUCAO: Celebracao = {
  tipo: 'evolucao', deId: 'charmeleon', paraId: 'charizard',
  deNome: 'Charmeleon', paraNome: 'Charizard', isShiny: false,
}

const fila = () => celebracaoStore.getState().fila
/** A celebracao da posicao, sem o envelope de id. */
const frente = (i = 0) => celebracaoStore.getState().fila[i]?.celebracao
const celebrar = (c: Celebracao) => celebracaoStore.getState().celebrar(c)

beforeEach(() => celebracaoStore.getState().limpar())

// A COALESCENCIA DE NIVEL DE POKE FOI REVERTIDA (PH-398), e este bloco mudou de
// lado por isso.
//
// Ele trancava o contrario: "tres abates seguidos viram UM cartao com o intervalo
// somado", "os atributos SOMAM". Era a decisao da PH-192, e ela tinha medicao por
// tras — a 612 abates/hora, celebracao repetida vira ruido.
//
// O dono do projeto pediu o oposto, explicitamente: um splash POR NIVEL, com os
// stats DAQUELE nivel, 4 segundos cada. Os casos antigos nao "quebraram": eles
// afirmavam uma regra que deixou de valer, e apagar sem registro deixaria a
// proxima pessoa achando que a coalescencia nunca existiu.
//
// A protecao que a coalescencia dava (fila que nao vira parede de cartao) mudou
// de mecanismo, nao desapareceu — ver `TETO_DA_FILA` e
// `stores/filaDeCelebracao.test.ts`.
describe('nivel do POKE NAO coalesce mais (PH-398, revertendo PH-192)', () => {
  it('tres abates seguidos viram TRES cartoes', () => {
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))
    celebrar(nivel(35, 36))

    expect(fila()).toHaveLength(3)
    expect(fila().map((f) => (f.celebracao as Extract<Celebracao, { tipo: 'nivel' }>).nivel))
      .toEqual([34, 35, 36])
  })

  it('cada cartao mantem os ganhos DELE, sem somar', () => {
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))

    // `GANHO` e o mesmo objeto nos dois: o que se prova aqui e que ninguem
    // somou 3+3 em `hp`.
    for (const item of fila()) {
      expect((item.celebracao as Extract<Celebracao, { tipo: 'nivel' }>).ganhos).toEqual(GANHO)
    }
  })

  it('o cartao na tela nao e reescrito pelo nivel seguinte', () => {
    // Era o oposto: a PH-192 atualizava o cartao visivel pra ele nao mostrar
    // nivel defasado. Com um cartao por nivel, o visivel esta correto por
    // construcao — ele e o nivel dele.
    celebrar(nivel(33, 34))
    const idDaFrente = fila()[0].id
    celebrar(nivel(34, 35))

    expect(fila()[0].id).toBe(idDaFrente)
    expect((frente() as Extract<Celebracao, { tipo: 'nivel' }>).nivel).toBe(34)
  })

  it('POKE diferente tambem vira cartao proprio', () => {
    celebrar(nivel(33, 34))
    celebrar(nivel(10, 11, { especieId: 'pikachu', nome: 'Pikachu' }))
    expect(fila()).toHaveLength(2)
  })
})

describe('coalescencia de nivel do treinador (PH-192)', () => {
  const treinador = (de: number, ate: number): Celebracao =>
    ({ tipo: 'treinador', nome: 'Mark', nivelInicial: de, nivel: ate })

  it('dois niveis seguidos viram um cartao', () => {
    celebrar(treinador(7, 8))
    celebrar(treinador(8, 9))
    expect(fila()).toHaveLength(1)
    const c = frente() as Extract<Celebracao, { tipo: 'treinador' }>
    expect([c.nivelInicial, c.nivel]).toEqual([7, 9])
  })

  it('treinador NAO coalesce com nivel de POKE', () => {
    // Sao dois marcos diferentes e o cartao diz coisas diferentes.
    celebrar(nivel(33, 34))
    celebrar(treinador(7, 8))
    expect(fila()).toHaveLength(2)
  })
})

describe('o que NAO pode coalescer (PH-192)', () => {
  it('evolucao nunca junta com nada', () => {
    celebrar(EVOLUCAO)
    celebrar(EVOLUCAO)
    expect(fila()).toHaveLength(2)
  })

  it('shiny nunca junta com nada', () => {
    const shiny: Celebracao = { tipo: 'shiny', especieId: 'charizard', nome: 'Charizard' }
    celebrar(shiny)
    celebrar(shiny)
    expect(fila()).toHaveLength(2)
  })

  it('nivel que chega durante uma EVOLUCAO vai pra fila, um cartao por nivel', () => {
    // ERA "e coalesce entre si" (PH-192): os dois niveis atras da evolucao
    // viravam UM cartao. Com a reversao da PH-398 eles sao dois, e o que garante
    // que isso nao vire fila infinita e o `TETO_DA_FILA`.
    //
    // O que continua igual, e e o ponto deste caso: a evolucao NAO e absorvida
    // nem empurrada — ela fica na frente e os niveis esperam atras.
    celebrar(EVOLUCAO)
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))

    expect(fila()).toHaveLength(3)
    expect(frente().tipo).toBe('evolucao')
    expect(frente(1).tipo).toBe('nivel')
    expect((frente(1) as Extract<Celebracao, { tipo: 'nivel' }>).nivel).toBe(34)
    expect((frente(2) as Extract<Celebracao, { tipo: 'nivel' }>).nivel).toBe(35)
  })
})

describe('consumo da fila (PH-192)', () => {
  it('encerrarAtual tira a da frente e revela a proxima', () => {
    celebrar(EVOLUCAO)
    celebrar(nivel(33, 34))
    expect(frente().tipo).toBe('evolucao')

    celebracaoStore.getState().encerrarAtual()
    expect(fila()).toHaveLength(1)
    expect(frente().tipo).toBe('nivel')

    celebracaoStore.getState().encerrarAtual()
    expect(fila()).toHaveLength(0)
  })

  it('encerrar com a fila vazia nao estoura', () => {
    expect(() => celebracaoStore.getState().encerrarAtual()).not.toThrow()
    expect(fila()).toHaveLength(0)
  })
})

describe('identidade da celebracao, pra a animacao reiniciar (PH-192)', () => {
  // BUG REAL, achado ao vivo: sem `key` por celebracao o React reusa o no do
  // DOM entre duas, a animacao CSS nao reinicia, e a segunda aparece JA no fim
  // do fade. Medido: opacity 0 aos 700ms de uma animacao de 2600ms. O `id`
  // daqui e o que alimenta essa `key`.
  it('celebracoes diferentes recebem ids diferentes', () => {
    celebrar(EVOLUCAO)
    celebrar({ tipo: 'shiny', especieId: 'charizard', nome: 'Charizard' })
    expect(fila()[0].id).not.toBe(fila()[1].id)
  })

  it('o id NAO muda na coalescencia — e ela agora e SO do treinador', () => {
    // De proposito: juntar niveis atualiza o cartao que ja esta na tela, e
    // trocar a `key` ali faria o cartao PISCAR a cada nivel de uma sequencia.
    //
    // O caso mudou de TIPO na PH-398: com nivel de POKE ele passaria verde pelo
    // motivo errado (o cartao da frente nunca e tocado porque nao ha mais
    // coalescencia de POKE), e um teste que passa pelo motivo errado e pior que
    // teste nenhum. O treinador continua coalescendo, entao e ele que exercita
    // isto de verdade.
    celebrar({ tipo: 'treinador', nome: 'Mark', nivelInicial: 4, nivel: 5 })
    const idInicial = fila()[0].id
    celebrar({ tipo: 'treinador', nome: 'Mark', nivelInicial: 5, nivel: 6 })
    celebrar({ tipo: 'treinador', nome: 'Mark', nivelInicial: 6, nivel: 7 })

    expect(fila()).toHaveLength(1)
    expect(fila()[0].id).toBe(idInicial)
  })

  it('id nao se repete depois que a fila esvazia', () => {
    // Reciclar id faria a `key` repetir e o React reusar o no de novo — o mesmo
    // defeito por outro caminho.
    celebrar(EVOLUCAO)
    const primeiro = fila()[0].id
    celebracaoStore.getState().encerrarAtual()
    celebrar(EVOLUCAO)
    expect(fila()[0].id).not.toBe(primeiro)
  })
})
