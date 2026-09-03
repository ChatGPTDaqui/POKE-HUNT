// PH-223 trancava aqui a ORDEM canonica dos 12 biomas, porque ela era o eixo do
// gate sequencial: vencer o Lord do bioma N liberava o N+1, e a ordem so
// existia como tabela no vault — qualquer sessao futura podia "inventar" outra,
// ou usar `BIOMAS` (ordem arbitraria de insercao) por engano.
//
// ESSE EIXO MORREU NA PH-430. Os 12 biomas nascem abertos e o progresso e por
// bioma, independente. A ordem sobreviveu em UM lugar so — a traducao do save
// antigo, onde o numero gravado em `faixa1` e um indice nela — e la ela e
// CONGELADA (`progressoDeBioma.ts#ORDEM_LEGADA_DOS_BIOMAS`), com teste proprio
// em `progressoDeBioma.test.ts`. Congelada e o oposto do que este arquivo fazia:
// aqui a ordem era viva e o teste a mantinha sincronizada com `BIOMAS`; la ela
// precisa NAO mudar, porque save de ontem se le com a regra de ontem.
//
// O que sobra pra este arquivo sao os invariantes de FORMA dos 12 biomas, que
// nenhum outro teste cobre e cuja falha e silenciosa: bioma sem sub-bioma nao
// spawna nada, e chave duplicada faz `BIOMA_POR_CHAVE` perder um.
import { describe, expect, it } from 'vitest'

import { BIOMAS, BIOMA_POR_CHAVE } from './biomas'

describe('os 12 biomas', () => {
  it('sao 12, com chave unica', () => {
    expect(BIOMAS.length).toBe(12)
    expect(new Set(BIOMAS.map((b) => b.chave)).size).toBe(12)
  })

  it('o indice por chave cobre todos, sem perder nenhum', () => {
    // `BIOMA_POR_CHAVE` e construido por `Object.fromEntries`: chave repetida
    // nao daria erro, so faria a segunda sobrescrever a primeira em silencio.
    expect(Object.keys(BIOMA_POR_CHAVE).length).toBe(BIOMAS.length)
    for (const bioma of BIOMAS) {
      expect(BIOMA_POR_CHAVE[bioma.chave], bioma.chave).toBe(bioma)
    }
  })

  it('todo bioma tem pelo menos um sub-bioma, e todo sub-bioma tem peso positivo', () => {
    // Bioma sem sub-bioma nao estoura: ele so nunca sorteia sala nenhuma, e o
    // jogador entra num mapa que nao spawna nada.
    for (const bioma of BIOMAS) {
      expect(bioma.subBiomas.length, `${bioma.chave} sem sub-bioma`).toBeGreaterThan(0)
      for (const sub of bioma.subBiomas) {
        expect(sub.peso, `${bioma.chave}/${sub.chave}`).toBeGreaterThan(0)
      }
    }
  })

  it('nenhuma chave de sub-bioma se repete entre biomas', () => {
    // `SUB_BIOMA_POR_CHAVE` mapeia sub-bioma -> bioma. Uma chave em dois biomas
    // faria a sala de um deles reportar o bioma errado — e o protetor, o loot e
    // a arte sairiam do lugar errado junto.
    const todas = BIOMAS.flatMap((b) => b.subBiomas.map((s) => s.chave))
    expect(new Set(todas).size).toBe(todas.length)
  })
})
