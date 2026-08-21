// O que este arquivo tranca e a FALHA SILENCIOSA da bolha: verbete que sai com
// titulo e nada embaixo, ou com "NaN%"/"undefined" no meio da frase porque um
// numero veio de dado gerado e mudou de forma. Nada disso lanca excecao — a
// bolha simplesmente abre mentindo, ou vazia, e ninguem ve.
import { describe, expect, it } from 'vitest'
import { TYPE_COLORS } from './typeColors'
import { SPECIES } from './pokes'
import { TRAITS } from './traits'
import { RARITIES, type RarityKey } from './rarity'
import { STATUS_NAO_VOLATEIS, STATUS_VOLATEIS } from './statusEffects'
import { STAT_ORDER } from './statLabels'
import {
  GLOSSARIO,
  verbeteDaCaracteristica,
  verbeteDaNatureza,
  verbeteDaRaridade,
  verbeteDaTrait,
  verbeteDoStat,
  verbeteDoStatus,
  verbeteDoTipoDoGolpe,
  verbeteDosTiposDaEspecie,
  type Verbete,
} from './glossario'
import { NATURE_LIST } from './natures'
import { caracteristicaDe } from './characteristics'
import type { ElementType } from './generated/types'
import type { StatBlock } from './pokes'

// Qualquer um destes num texto de jogador e bug de interpolacao, nao conteudo.
const LIXO_DE_INTERPOLACAO = /NaN|undefined|null|Infinity|\[object|\$\{/

function conferir(v: Verbete, onde: string) {
  expect(v.titulo.trim(), `${onde}: titulo vazio`).not.toBe('')
  expect(v.corpo.length, `${onde}: bolha sem corpo`).toBeGreaterThan(0)
  for (const paragrafo of v.corpo) {
    expect(paragrafo.trim(), `${onde}: paragrafo vazio`).not.toBe('')
    expect(paragrafo, `${onde}: lixo de interpolacao em "${paragrafo}"`).not.toMatch(LIXO_DE_INTERPOLACAO)
  }
  expect(v.titulo, `${onde}: lixo no titulo`).not.toMatch(LIXO_DE_INTERPOLACAO)
  conferirTamanho(v, onde)
}

const IVS_ZERADOS: StatBlock = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 }

// Bolha nao e pagina de Wiki. Os dois limites saem de medicao no celular
// emulado (390x844): com 4 paragrafos a bolha da natureza cobria dois tercos da
// tela, tapando a propria ficha que ela explicava.
const MAXIMO_DE_PARAGRAFOS = 4
const MAXIMO_DE_CARACTERES = 210

function conferirTamanho(v: Verbete, onde: string) {
  expect(v.corpo.length, `${onde}: bolha longa demais (${v.corpo.length} paragrafos)`)
    .toBeLessThanOrEqual(MAXIMO_DE_PARAGRAFOS)
  for (const paragrafo of v.corpo) {
    expect(paragrafo.length, `${onde}: paragrafo de ${paragrafo.length} caracteres`)
      .toBeLessThanOrEqual(MAXIMO_DE_CARACTERES)
  }
}

describe('glossario', () => {
  it('todo verbete estatico tem titulo e corpo utilizaveis', () => {
    const ids = Object.keys(GLOSSARIO) as (keyof typeof GLOSSARIO)[]
    expect(ids.length).toBeGreaterThan(5)
    for (const id of ids) conferir(GLOSSARIO[id], id)
  })

  it('as 25 naturezas saem com o multiplicador do proprio POKE', () => {
    expect(NATURE_LIST).toHaveLength(25)
    for (const def of NATURE_LIST) {
      const v = verbeteDaNatureza(def.key)
      conferir(v, `natureza ${def.key}`)
      expect(v.titulo).toContain(def.nome)
      // Neutra NAO pode prometer alteracao de atributo: era o erro mais facil
      // de cometer aqui (as 5 neutras tem `sobe`/`desce` nulos).
      if (!def.sobe) expect(v.corpo[0]).toMatch(/neutras/)
      else expect(v.corpo[0]).toMatch(/x1\.1/)
    }
  })

  it('natureza ausente ou desconhecida cai no conceito, sem quebrar', () => {
    conferir(verbeteDaNatureza(null), 'natureza null')
    conferir(verbeteDaNatureza(undefined), 'natureza undefined')
    // Save antigo com chave que nao existe mais.
    conferir(verbeteDaNatureza('inventada' as never), 'natureza invalida')
  })

  it('toda habilidade do catalogo tem bolha, e a inerte diz que e inerte', () => {
    const ids = Object.keys(TRAITS)
    expect(ids.length).toBeGreaterThan(50)
    for (const id of ids) {
      const v = verbeteDaTrait(id)
      conferir(v, `trait ${id}`)
    }
    conferir(verbeteDaTrait(null), 'trait null')
  })

  it('habilidade oculta e dita em voz alta', () => {
    const algum = Object.keys(TRAITS)[0]
    expect(verbeteDaTrait(algum, true).corpo.join(' ')).toMatch(/oculta/)
    expect(verbeteDaTrait(algum, false).corpo.join(' ')).not.toMatch(/oculta/)
  })

  it('as 30 caracteristicas apontam o atributo certo', () => {
    for (const stat of STAT_ORDER) {
      for (let iv = 0; iv <= 31; iv++) {
        const ivs: StatBlock = { ...IVS_ZERADOS, [stat]: iv }
        const c = caracteristicaDe(ivs)
        const v = verbeteDaCaracteristica(c)
        conferir(v, `caracteristica ${stat} iv${iv}`)
      }
    }
    conferir(verbeteDaCaracteristica(null), 'caracteristica null')
  })

  it('todo status tem bolha que diz o que ele FAZ, nao so o nome', () => {
    for (const tipo of [...STATUS_NAO_VOLATEIS, ...STATUS_VOLATEIS]) {
      const v = verbeteDoStatus(tipo)
      conferir(v, `status ${tipo}`)
      // Duas linhas no minimo: o efeito e a linha de volatil/nao-volatil. Uma
      // linha so significa que a regra gerada deixou de descrever o efeito.
      expect(v.corpo.length, `status ${tipo} sem efeito descrito`).toBeGreaterThan(1)
      conferir(verbeteDoStatus({ tipo, turnosRestantes: 3 }), `status ${tipo} com turnos`)
      conferir(verbeteDoStatus({ tipo, turnosRestantes: null }), `status ${tipo} sem prazo`)
    }
  })

  // O ROTULO na tela ("Natureza") abre o conceito; o VALOR ("Hardy") abre o
  // efeito daquele sorteio. Duas bolhas, duas respostas. Se alguem reemendar o
  // conceito dentro do verbete do individuo, as duas viram a MESMA bolha e o
  // jogador le o conceito de novo a cada toque — sem erro, sem log.
  it('verbete do individuo nao repete o conceito do rotulo', () => {
    const paresDeNatureza = NATURE_LIST.map((def) => verbeteDaNatureza(def.key))
    for (const v of paresDeNatureza) {
      expect(v.titulo, 'titulo do individuo igual ao do conceito').not.toBe(GLOSSARIO.natureza.titulo)
      for (const conceito of GLOSSARIO.natureza.corpo) {
        expect(v.corpo, `natureza ${v.titulo} repetindo o conceito`).not.toContain(conceito)
      }
    }
    for (const id of Object.keys(TRAITS)) {
      const v = verbeteDaTrait(id)
      expect(v.titulo).not.toBe(GLOSSARIO.habilidade.titulo)
      for (const conceito of GLOSSARIO.habilidade.corpo) {
        expect(v.corpo, `trait ${id} repetindo o conceito`).not.toContain(conceito)
      }
    }
    const c = caracteristicaDe({ ...IVS_ZERADOS, speed: 31 })
    const vc = verbeteDaCaracteristica(c)
    expect(vc.titulo).toBe(c!.texto)
    for (const conceito of GLOSSARIO.caracteristica.corpo) {
      expect(vc.corpo).not.toContain(conceito)
    }
  })

  it('os 6 atributos tem papel escrito', () => {
    for (const stat of STAT_ORDER) conferir(verbeteDoStat(stat), `stat ${stat}`)
  })

  it('as 6 raridades citam multiplicador e chance', () => {
    for (const key of Object.keys(RARITIES) as RarityKey[]) {
      const v = verbeteDaRaridade(key)
      conferir(v, `raridade ${key}`)
      expect(v.corpo[0]).toContain(`x${RARITIES[key].statMultiplier}`)
    }
  })

  it('os 18 tipos tem bolha ofensiva, inclusive os sem vantagem de 2x', () => {
    const tipos = Object.keys(TYPE_COLORS) as ElementType[]
    expect(tipos).toHaveLength(18)
    for (const tipo of tipos) conferir(verbeteDoTipoDoGolpe(tipo), `tipo ${tipo}`)
  })

  it('toda especie do catalogo tem bolha defensiva', () => {
    // NORMAL puro nao e fraco a quase nada e IMUNE a nada relevante: e o caso
    // que produzia bolha vazia antes do fallback.
    for (const species of Object.values(SPECIES)) {
      conferir(verbeteDosTiposDaEspecie(species), `especie ${species.id}`)
    }
  })
})
