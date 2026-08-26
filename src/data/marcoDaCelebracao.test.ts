// Quando a celebracao e grande (PH-192).
//
// Estas regras merecem teste proprio porque sao elas que decidem quantas vezes
// por sessao o jogador ve a versao grande — a 612 abates/hora, errar aqui e a
// diferenca entre recompensa e ruido. E porque uma delas tem um caso que o
// teste ingenuo perde:
//
// O TESTE E NO INTERVALO, nao no nivel final. Com cascata (um abate subindo
// varios niveis) e com coalescencia (abates seguidos no mesmo cartao), um cartao
// que vai de 33 a 36 ATRAVESSA o 35 — e `36 % 5` da 1. O marco se perderia
// exatamente no caso mais impressionante.
import { describe, expect, it } from 'vitest'
import {
  PASSO_DO_MARCO, PASSO_DO_MARCO_DO_TREINADOR, cruzouMultiplo, ehMarco, intensidadeDe,
} from './marcoDaCelebracao'
import type { Celebracao } from '@/stores/celebracaoStoreVanilla'

function nivel(de: number, ate: number, extra: Partial<Extract<Celebracao, { tipo: 'nivel' }>> = {}): Celebracao {
  return {
    tipo: 'nivel', especieId: 'charmeleon', nome: 'Charmeleon',
    nivelInicial: de, nivel: ate, ganhos: null, golpesNovos: [], isShiny: false,
    ...extra,
  }
}

describe('cruzouMultiplo (PH-192)', () => {
  it('acha o multiplo DENTRO do intervalo, nao so na ponta', () => {
    expect(cruzouMultiplo(33, 36, 5), '33->36 atravessa o 35').toBe(true)
    expect(cruzouMultiplo(38, 41, 5), '38->41 atravessa o 40').toBe(true)
  })

  it('nao inventa multiplo onde nao ha', () => {
    expect(cruzouMultiplo(36, 38, 5)).toBe(false)
    expect(cruzouMultiplo(31, 34, 5)).toBe(false)
  })

  it('intervalo vazio ou invertido nunca cruza', () => {
    expect(cruzouMultiplo(35, 35, 5)).toBe(false)
    expect(cruzouMultiplo(40, 35, 5)).toBe(false)
  })

  it('passo 1 faz TODO nivel cruzar — e por isso o treinador usa 1', () => {
    expect(cruzouMultiplo(7, 8, 1)).toBe(true)
    expect(cruzouMultiplo(8, 8, 1)).toBe(false)
  })
})

describe('nivel do POKE: marco a cada 5 (PH-192)', () => {
  const casos: [number, number, boolean, string][] = [
    [33, 34, false, 'sobe 1, nao cruza'],
    [34, 35, true, 'sobe 1, cruza o 35'],
    [35, 36, false, 'sobe 1, sai do 35'],
    [33, 36, true, 'cascata de 3, cruza o 35'],
    [36, 38, false, 'cascata de 2, nao cruza'],
    [38, 41, true, 'cascata de 3, cruza o 40'],
    [96, 100, true, 'chega no teto'],
    [100, 100, false, 'nao subiu'],
  ]

  it.each(casos)('%i -> %i = %s (%s)', (de, ate, esperado) => {
    expect(ehMarco(nivel(de, ate))).toBe(esperado)
  })

  it('golpe novo forca marco mesmo fora do multiplo', () => {
    // Mudou o que o POKE PODE FAZER — o jogador precisa ir ver a barra.
    expect(ehMarco(nivel(33, 34, { golpesNovos: ['Lança-Chamas'] }))).toBe(true)
  })

  it('o passo e 5', () => {
    // Fixa o valor escolhido: mudar isto e mudar a frequencia do jogo inteiro,
    // e merece ser uma decisao e nao um efeito colateral.
    expect(PASSO_DO_MARCO).toBe(5)
  })
})

describe('nivel do TREINADOR: sempre cartao (PH-192)', () => {
  const treinador = (de: number, ate: number): Celebracao =>
    ({ tipo: 'treinador', nome: 'Mark', nivelInicial: de, nivel: ate })

  it('todo nivel e marco', () => {
    for (const [de, ate] of [[1, 2], [7, 8], [26, 27], [99, 100]]) {
      expect(ehMarco(treinador(de, ate)), `${de}->${ate}`).toBe(true)
    }
  })

  it('nao subir nao e marco', () => {
    expect(ehMarco(treinador(27, 27))).toBe(false)
  })

  it('o passo do treinador e 1, e nao uma booleana', () => {
    // Fica como PASSO pra usar o MESMO mecanismo do POKE: se um dia isso
    // incomodar, virar 5 e trocar um numero, e nao escrever um caminho novo.
    expect(PASSO_DO_MARCO_DO_TREINADOR).toBe(1)
  })
})

describe('intensidade (PH-192)', () => {
  it('evolucao e shiny sao sempre CHEIO', () => {
    const evo: Celebracao = {
      tipo: 'evolucao', deId: 'charmeleon', paraId: 'charizard',
      deNome: 'Charmeleon', paraNome: 'Charizard', isShiny: false,
    }
    expect(intensidadeDe(evo)).toBe('cheio')
    expect(intensidadeDe({ tipo: 'shiny', especieId: 'charizard', nome: 'Charizard' })).toBe('cheio')
  })

  it('nivel do POKE alterna entre discreto e medio', () => {
    expect(intensidadeDe(nivel(33, 34))).toBe('discreto')
    expect(intensidadeDe(nivel(34, 35))).toBe('medio')
  })

  it('nivel do treinador e sempre medio', () => {
    expect(intensidadeDe({ tipo: 'treinador', nome: 'Mark', nivelInicial: 7, nivel: 8 })).toBe('medio')
  })
})
