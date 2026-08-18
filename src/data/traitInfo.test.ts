// A tabela de texto das habilidades tem que COBRIR o catalogo, e so ele.
//
// Falha silenciosa que isto tranca: `descricaoDaTrait` cai no NOME da
// habilidade quando nao ha descricao. Uma chave que falta nao lanca nada — a
// ficha do POKE mostra "Technician" onde deveria explicar o que ela faz, e
// ninguem nota. Uma chave a MAIS e pior: e texto que nunca aparece na tela,
// escrito pra uma habilidade que nao existe (grafia errada, kebab em vez de
// snake).
import { describe, expect, it } from 'vitest'

import { TRAITS, traitsDaEspecie } from './traits'
import { SPECIES } from './pokes'
import { DESCRICAO_DA_TRAIT, MOTIVO_SEM_EFEITO, traitEstaAtiva, descricaoDaTrait } from './traitInfo'

const CHAVES_DO_CATALOGO = Object.keys(TRAITS)

describe('texto das habilidades', () => {
  it('toda habilidade do catalogo tem descricao em portugues', () => {
    expect(CHAVES_DO_CATALOGO.filter((k) => !DESCRICAO_DA_TRAIT[k])).toEqual([])
  })

  it('nenhuma descricao aponta pra habilidade que nao existe', () => {
    expect(Object.keys(DESCRICAO_DA_TRAIT).filter((k) => !TRAITS[k])).toEqual([])
  })

  it('todo motivo de "sem efeito" aponta pra habilidade que existe', () => {
    expect(Object.keys(MOTIVO_SEM_EFEITO).filter((k) => !TRAITS[k])).toEqual([])
  })

  it('a maioria das habilidades do elenco esta ATIVA', () => {
    const ativas = CHAVES_DO_CATALOGO.filter(traitEstaAtiva)
    // Numero medido em 2026-08-18: 102 de 133. O teste guarda o PISO, nao o
    // valor exato — implementar mais uma nao pode quebrar o teste, mas
    // desligar dez sem querer tem que quebrar.
    expect(ativas.length).toBeGreaterThanOrEqual(100)
  })

  it('descricaoDaTrait nunca devolve string vazia pra chave valida', () => {
    for (const k of CHAVES_DO_CATALOGO) expect(descricaoDaTrait(k).length).toBeGreaterThan(0)
  })

  // O que de fato chega ao jogador: a habilidade de uma especie que ele pode
  // capturar. Uma chave orfa no catalogo e inofensiva; uma chave sem texto num
  // POKE do time e um buraco na ficha.
  it('toda habilidade que alguma especie do elenco pode ter tem texto', () => {
    const usadas = new Set<string>()
    for (const id of Object.keys(SPECIES)) {
      const t = traitsDaEspecie(id)
      if (!t) continue
      for (const k of t.normais) usadas.add(k)
      if (t.oculta) usadas.add(t.oculta)
    }
    expect([...usadas].filter((k) => !DESCRICAO_DA_TRAIT[k])).toEqual([])
  })
})
