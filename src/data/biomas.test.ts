// PH-223: ORDEM_DOS_BIOMAS e a unica fonte da ordem de progressao do gate
// sequencial (PH-226/227). Antes dela so existia como tabela no vault —
// qualquer sessao/dev futuro podia "inventar" a ordem de novo, ou usar
// `BIOMAS` (ordem arbitraria de insercao) por engano. Este teste tranca a
// ordem exata contra regressao silenciosa.
import { describe, expect, it } from 'vitest'

import { BIOMAS, BIOMA_POR_CHAVE, ORDEM_DOS_BIOMAS } from './biomas'

describe('ORDEM_DOS_BIOMAS', () => {
  it('e exatamente a sequencia documentada no vault (16/08)', () => {
    expect(ORDEM_DOS_BIOMAS).toEqual([
      'campo_aberto',
      'subterraneo',
      'marinho',
      'industrial',
      'mata',
      'aguas_interiores',
      'urbano',
      'gelido',
      'aridos',
      'sagrado',
      'sombrio',
      'igneo',
    ])
  })

  it('cobre TODOS os biomas de BIOMAS, sem duplicar e sem faltar', () => {
    expect(ORDEM_DOS_BIOMAS.length).toBe(BIOMAS.length)
    expect(new Set(ORDEM_DOS_BIOMAS).size).toBe(ORDEM_DOS_BIOMAS.length)
    for (const chave of ORDEM_DOS_BIOMAS) {
      expect(BIOMA_POR_CHAVE[chave], `${chave} nao existe em BIOMAS`).toBeTruthy()
    }
  })

  it('igneo (piloto do boss) e o ULTIMO da ordem', () => {
    // Nao e coincidencia: o gate sequencial so tem efeito de verdade porque
    // igneo (o unico bioma com boss ate PH-225) e o ultimo — os 11 antes dele
    // "destravam sozinhos" ate ganharem boss de verdade tambem.
    expect(ORDEM_DOS_BIOMAS.at(-1)).toBe('igneo')
  })
})
