// PH-294 — a sigla do golpe nunca mostra caractere que nao seja letra ou digito.
//
// O BUG, e por que ele nao era raro
//
// `siglaDoGolpe` quebrava o nome em `[\s-]+` e pegava a inicial de cada pedaco.
// O golpe AoE por tipo se chama "Explosao Elemental (FIRE)": tres pedacos, e a
// inicial do terceiro e o PARENTESE. A barra mostrava `EE(`.
//
// TODA especie recebe o AoE do proprio tipo (`typedAoeMoves`, aplicado em
// `data/pokes.ts`), e a sigla so aparece quando o tipo se REPETE na barra
// (PH-193, item 6) — ou seja, o caso do bug e exatamente o cenario que motivou
// a sigla existir: o Charmeleon com tres golpes Fire. Visto na tela em 30/08,
// com Entei: `ERU`, `LP`, `EE(`.
import { describe, expect, it } from 'vitest'
import { siglaDoGolpe } from './AbilityHud'
import { ABILITIES } from '@/data/abilities'

describe('siglaDoGolpe (PH-294)', () => {
  it('o AoE por tipo perde o parenteses e vira EE', () => {
    expect(siglaDoGolpe('Explosao Elemental (FIRE)')).toBe('EE')
    expect(siglaDoGolpe('Explosao Elemental (WATER)')).toBe('EE')
  })

  it('nenhum golpe do catalogo produz sigla com caractere estranho', () => {
    // A varredura e sobre o catalogo INTEIRO, e nao sobre uma lista escrita a
    // mao: o nome problematico nao veio de um golpe especial, veio da forma do
    // nome. Outro golpe com pontuacao entra sozinho nesta rede.
    const nomes = Object.values(ABILITIES).map((a) => a.name)
    expect(nomes.length, 'catalogo de golpes vazio — o teste rodaria no vacuo').toBeGreaterThan(100)

    const ruins = nomes
      .map((nome) => [nome, siglaDoGolpe(nome)] as const)
      .filter(([, sigla]) => sigla === '' || !/^[\p{L}\p{N}]+$/u.test(sigla))
      .map(([nome, sigla]) => `${nome} -> "${sigla}"`)

    expect(ruins, `sigla com caractere que nao e letra nem digito:\n${ruins.join('\n')}`).toEqual([])
  })

  it('os casos que ja funcionavam continuam iguais', () => {
    // Regressao. O hifen tem que continuar separando palavra (foi o motivo de
    // `siglaDoGolpe` existir em vez de reusar `shortLabel`), e nome de palavra
    // unica continua caindo nas tres primeiras letras.
    expect(siglaDoGolpe('Lava Plume')).toBe('LP')
    expect(siglaDoGolpe('Lanca-Chamas')).toBe('LC')
    expect(siglaDoGolpe('Eruption')).toBe('ERU')
    expect(siglaDoGolpe('Extrasensory')).toBe('EXT')
  })

  it('corta em 3 letras quando ha muitas palavras', () => {
    expect(siglaDoGolpe('Um Dois Tres Quatro')).toBe('UDT')
  })

  it('nome so de pontuacao nao estoura', () => {
    // Nao existe no catalogo, e por isso mesmo: o fallback tem que devolver
    // alguma coisa em vez de quebrar o render da barra inteira.
    expect(() => siglaDoGolpe('!!!')).not.toThrow()
  })
})
