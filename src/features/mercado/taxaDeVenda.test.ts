// PH-98: a conta da taxa no cliente tem que dar EXATAMENTE o mesmo numero que a
// do servidor.
//
// Os dois calculam a mesma coisa em idiomas diferentes:
//
//   SQL  ->  (p_valor * percentual) / 100     -- divisao INTEIRA em bigint
//   TS   ->  Math.floor((valor * percentual) / 100)
//
// Divisao inteira em Postgres TRUNCA, e truncar positivo e o mesmo que floor.
// Sem fixar isso em teste, a primeira pessoa a "melhorar" o cliente com
// `Math.round` faz a tela prometer 1 de ouro que o banco nao credita — e o
// sintoma e o jogador conferindo o saldo e achando que falta, que e a classe de
// reclamacao mais cara de diagnosticar.
//
// O caso que pega isso e o valor BAIXO: 5% de 19 e 0,95. `floor` da 0 (o
// vendedor fica com 19 inteiros), `round` daria 1.
import { describe, expect, it } from 'vitest'

import { taxaDeVenda, type RegraDeTaxa } from './useTaxaDoMercado'

const REGRA: RegraDeTaxa = { percentual: 5, moedasIsentas: ['diamond'] }

describe('taxaDeVenda espelha a conta do servidor (PH-98)', () => {
  it('5% de um valor redondo', () => {
    expect(taxaDeVenda(1000, 'gold', REGRA)).toBe(50)
    expect(taxaDeVenda(20, 'gold', REGRA)).toBe(1)
  })

  it('trunca pra baixo, nunca arredonda', () => {
    // 5% de 19 = 0,95. `round` daria 1 e divergiria do banco.
    expect(taxaDeVenda(19, 'gold', REGRA)).toBe(0)
    // 5% de 39 = 1,95.
    expect(taxaDeVenda(39, 'gold', REGRA)).toBe(1)
    // 5% de 1 = 0,05: o vendedor de uma unidade barata nao paga nada.
    expect(taxaDeVenda(1, 'gold', REGRA)).toBe(0)
  })

  it('diamante e isento', () => {
    expect(taxaDeVenda(1000000, 'diamond', REGRA)).toBe(0)
  })

  it('moeda desconhecida NAO e isenta', () => {
    // A isencao e uma lista do que esta FORA, nao uma lista do que esta dentro.
    // Uma moeda nova entra taxada por padrao — errar pra taxar e recuperavel
    // (devolve-se), errar pra isentar abre um caminho de transferencia sem
    // atrito, que e metade do motivo desta issue existir.
    expect(taxaDeVenda(1000, 'moeda_futura', REGRA)).toBe(50)
  })

  it('valor zero ou negativo nao gera taxa', () => {
    expect(taxaDeVenda(0, 'gold', REGRA)).toBe(0)
    expect(taxaDeVenda(-100, 'gold', REGRA)).toBe(0)
  })

  it('regra ainda nao carregada mostra o valor CHEIO como liquido', () => {
    // O fallback e percentual 0, e nao 5, de propósito: chutar um desconto que
    // talvez nao exista e inventar numero. Ver a nota em useTaxaDoMercado.
    expect(taxaDeVenda(1000, 'gold', { percentual: 0, moedasIsentas: [] })).toBe(0)
  })

  it('percentual diferente continua batendo', () => {
    // Se o percentual mudar por deploy, o cliente le o novo de
    // `taxa_do_mercado()` — nao ha nada pra editar aqui. Este caso existe pra
    // provar que a conta nao tem o 5 embutido.
    expect(taxaDeVenda(1000, 'gold', { percentual: 15, moedasIsentas: [] })).toBe(150)
  })
})
