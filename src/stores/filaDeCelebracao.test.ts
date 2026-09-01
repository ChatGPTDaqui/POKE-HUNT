// PH-398: a fila de celebracao com UM CARTAO POR NIVEL.
//
// A coalescencia de level-up de POKE saiu (pedido explicito: um splash por
// nivel), e ela era o que impedia a fila de virar uma parede de cartoes num jogo
// que faz 612 abates/hora. O que faz esse trabalho agora e `TETO_DA_FILA` — e o
// jeito como ele descarta importa: cai o mais ANTIGO em espera, nunca o mais
// novo, porque o mais novo carrega o nivel mais alto (a informacao que o jogador
// quer conferir) e nunca o que esta na tela, que seria um cartao piscando.
//
// O cartao do TREINADOR continua coalescendo, e isso tambem esta trancado aqui:
// ele nao tem stats por nivel (so diz o nivel) e sobe muito mais devagar, entao
// juntar nao esconde nada.
import { describe, expect, it, beforeEach } from 'vitest'

import { celebracaoStore, TETO_DA_FILA, type Celebracao } from './celebracaoStoreVanilla'

const ZERO = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 }

function nivel(n: number, especieId = 'charmander'): Celebracao {
  return {
    tipo: 'nivel',
    especieId,
    nome: 'Charmander',
    nivelInicial: n - 1,
    nivel: n,
    ganhos: { ...ZERO, hp: 1 },
    golpesNovos: [],
    isShiny: false,
  }
}

function treinador(n: number): Celebracao {
  return { tipo: 'treinador', nome: 'Treinador', nivelInicial: n - 1, nivel: n }
}

const niveisNaFila = () => celebracaoStore.getState().fila
  .map((f) => (f.celebracao.tipo === 'nivel' || f.celebracao.tipo === 'treinador' ? f.celebracao.nivel : -1))

beforeEach(() => celebracaoStore.getState().limpar())

describe('level-up de POKE nao coalesce mais (PH-398)', () => {
  it('dois niveis do MESMO POKE viram dois cartoes', () => {
    celebracaoStore.getState().celebrar(nivel(11))
    celebracaoStore.getState().celebrar(nivel(12))

    expect(niveisNaFila()).toEqual([11, 12])
  })

  it('cada cartao guarda os ganhos DELE, sem somar com o vizinho', () => {
    celebracaoStore.getState().celebrar({ ...nivel(11), ganhos: { ...ZERO, hp: 3 } } as Celebracao)
    celebracaoStore.getState().celebrar({ ...nivel(12), ganhos: { ...ZERO, hp: 5 } } as Celebracao)

    const fila = celebracaoStore.getState().fila
    const g0 = fila[0].celebracao.tipo === 'nivel' ? fila[0].celebracao.ganhos : null
    const g1 = fila[1].celebracao.tipo === 'nivel' ? fila[1].celebracao.ganhos : null
    expect(g0?.hp).toBe(3)
    expect(g1?.hp).toBe(5)
  })

  it('cada cartao tem id proprio — sem isso a animacao nao reinicia', () => {
    celebracaoStore.getState().celebrar(nivel(11))
    celebracaoStore.getState().celebrar(nivel(12))
    const [a, b] = celebracaoStore.getState().fila
    expect(a.id).not.toBe(b.id)
  })
})

describe('teto de fila (PH-398)', () => {
  it('nao passa de TETO_DA_FILA em espera, alem do que esta na tela', () => {
    for (let n = 11; n <= 11 + TETO_DA_FILA + 5; n++) celebracaoStore.getState().celebrar(nivel(n))

    expect(celebracaoStore.getState().fila.length).toBe(TETO_DA_FILA + 1)
  })

  it('quem cai e o mais ANTIGO em espera — o visivel e o mais novo ficam', () => {
    // 11 fica na tela; 12..17 disputam as tres vagas de espera.
    for (let n = 11; n <= 17; n++) celebracaoStore.getState().celebrar(nivel(n))

    const naFila = niveisNaFila()
    // O da tela nunca e interrompido...
    expect(naFila[0]).toBe(11)
    // ...e o ultimo em espera e o nivel mais alto, que e o que o jogador quer
    // conferir. Descartar o mais novo mostraria um nivel que o POKE ja passou.
    expect(naFila[naFila.length - 1]).toBe(17)
    expect(naFila).toEqual([11, 15, 16, 17])
  })

  it('encerrar a da frente libera a fila em ordem', () => {
    for (let n = 11; n <= 14; n++) celebracaoStore.getState().celebrar(nivel(n))
    celebracaoStore.getState().encerrarAtual()

    expect(niveisNaFila()[0]).toBe(12)
  })
})

describe('o cartao do treinador CONTINUA coalescendo (PH-398)', () => {
  it('dois niveis de treinador viram um cartao com o intervalo inteiro', () => {
    celebracaoStore.getState().celebrar(treinador(5))
    celebracaoStore.getState().celebrar(treinador(6))

    const fila = celebracaoStore.getState().fila
    expect(fila).toHaveLength(1)
    const c = fila[0].celebracao
    expect(c.tipo).toBe('treinador')
    if (c.tipo === 'treinador') {
      expect(c.nivelInicial).toBe(4)
      expect(c.nivel).toBe(6)
    }
  })

  it('coalescer o treinador MANTEM o id, pra o cartao na tela nao piscar', () => {
    celebracaoStore.getState().celebrar(treinador(5))
    const id = celebracaoStore.getState().fila[0].id
    celebracaoStore.getState().celebrar(treinador(6))
    expect(celebracaoStore.getState().fila[0].id).toBe(id)
  })
})

describe('evolucao e shiny seguem sem coalescer', () => {
  it('duas evolucoes viram dois cartoes', () => {
    const evo = (de: string): Celebracao => ({
      tipo: 'evolucao', deId: de, paraId: 'charizard', deNome: de, paraNome: 'Charizard', isShiny: false,
    })
    celebracaoStore.getState().celebrar(evo('charmander'))
    celebracaoStore.getState().celebrar(evo('charmeleon'))
    expect(celebracaoStore.getState().fila).toHaveLength(2)
  })
})
