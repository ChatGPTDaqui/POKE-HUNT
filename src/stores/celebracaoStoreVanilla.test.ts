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

describe('coalescencia de nivel do POKE (PH-192)', () => {
  it('tres abates seguidos viram UM cartao com o intervalo somado', () => {
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))
    celebrar(nivel(35, 36))

    expect(fila()).toHaveLength(1)
    const c = frente() as Extract<Celebracao, { tipo: 'nivel' }>
    expect(c.nivelInicial).toBe(33)
    expect(c.nivel).toBe(36)
  })

  it('os atributos SOMAM, e nao viram o maximo', () => {
    // Sao deltas de atributo: somar e a operacao certa. `Math.max` mostraria
    // "+3 HP" depois de tres niveis que deram 9.
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))
    celebrar(nivel(35, 36))

    const c = frente() as Extract<Celebracao, { tipo: 'nivel' }>
    expect(c.ganhos).toEqual({ hp: 9, atkFis: 6, atkEsp: 3, def: 6, defEsp: 3, speed: 3 })
  })

  it('os golpes novos concatenam sem repetir', () => {
    celebrar(nivel(33, 34, { golpesNovos: ['Brasa'] }))
    celebrar(nivel(34, 35, { golpesNovos: ['Brasa', 'Lança-Chamas'] }))

    const c = frente() as Extract<Celebracao, { tipo: 'nivel' }>
    expect(c.golpesNovos).toEqual(['Brasa', 'Lança-Chamas'])
  })

  it('coalesce no que ESTA NA TELA, nao so na fila de tras', () => {
    // O cartao visivel precisa acompanhar: dizer "Nv 34" com o POKE ja em 35 e
    // informacao desatualizada, que e pior que cartao repetido.
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))
    expect(fila()).toHaveLength(1)
    expect((frente() as Extract<Celebracao, { tipo: 'nivel' }>).nivel).toBe(35)
  })

  it('POKE DIFERENTE nao coalesce', () => {
    // Trocar de POKE em campo no meio de uma sequencia: dois cartoes, porque
    // sao dois POKE. Juntar diria que um deles subiu niveis que nao subiu.
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

  it('nivel que chega durante uma EVOLUCAO vai pra fila, e coalesce entre si', () => {
    // A evolucao fica na tela; os dois niveis atras dela viram UM cartao, e nao
    // dois enfileirados.
    celebrar(EVOLUCAO)
    celebrar(nivel(33, 34))
    celebrar(nivel(34, 35))

    expect(fila()).toHaveLength(2)
    expect(frente().tipo).toBe('evolucao')
    const atras = frente(1) as Extract<Celebracao, { tipo: 'nivel' }>
    expect([atras.nivelInicial, atras.nivel]).toEqual([33, 35])
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

  it('o id NAO muda na coalescencia', () => {
    // De proposito: juntar niveis atualiza o cartao que ja esta na tela, e
    // trocar a `key` ali faria o cartao PISCAR a cada abate de uma sequencia.
    celebrar(nivel(33, 34))
    const idInicial = fila()[0].id
    celebrar(nivel(34, 35))
    celebrar(nivel(35, 36))
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
