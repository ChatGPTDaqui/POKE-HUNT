// PH-142 — o filtro da venda erra em silêncio de dois jeitos, e os dois
// terminam com o jogador achando que não tem o que tem:
//
//   1. busca que não normaliza acento/caixa — ele digita o nome certo, não acha
//      nada, e conclui que não possui o item;
//   2. filtro que recorta demais — a lista fica vazia e "vazio" é
//      indistinguível de "não tenho nada para vender".
//
// Nenhum dos dois dá erro. Por isso a regra mora fora do JSX: embutida num
// `.filter()` da tela, ela não teria teste.
import { describe, expect, it } from 'vitest'

import { createRng } from '@/core/rng'
import { createPokeInstance, SPECIES } from '@/data/pokes'
import { ITEMS } from '@/data/items'

import {
  filtrarPokes, filtrarItens, categoriasPresentes,
  FILTRO_DE_POKE_VAZIO, FILTRO_DE_ITEM_VAZIO,
} from './filtrosDaVenda'

import type { PokeInstance } from '@/data/pokes'

const rng = createRng(7)

function poke(especie: string, nivel: number, over: Partial<PokeInstance> = {}): PokeInstance {
  return { ...createPokeInstance(rng, especie, nivel), ...over }
}

/** Uma mochila com variedade suficiente para os recortes significarem algo. */
function mochila(): PokeInstance[] {
  return [
    poke('charmander', 12),
    poke('squirtle', 40),
    poke('bulbasaur', 25),
    poke('pikachu', 33, { isShiny: true }),
    poke('geodude', 8),
  ]
}

describe('filtro neutro não recorta nada (PH-142)', () => {
  it('sem filtro, todos passam', () => {
    // Guarda anti-teste-vácuo: se a lista base viesse vazia, todo caso abaixo
    // passaria por vacuidade.
    const todos = mochila()
    expect(todos.length).toBeGreaterThan(3)
    expect(filtrarPokes(todos, FILTRO_DE_POKE_VAZIO)).toHaveLength(todos.length)
  })
})

describe('busca por nome (PH-142)', () => {
  it('ignora a CAIXA', () => {
    const achados = filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, busca: 'CHARMANDER' })
    expect(achados.map((p) => p.speciesId)).toEqual(['charmander'])
  })

  it('acha por trecho, e não só por nome inteiro', () => {
    // Quem procura "char" não quer digitar "Charmander" inteiro — é o ponto de
    // ter busca.
    expect(filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, busca: 'char' })).toHaveLength(1)
  })

  it('ignora ACENTO na busca de item', () => {
    // O caso que transforma o campo numa armadilha: o jogador digita "poção",
    // o catálogo tem "Pocao" (ou o contrário), e a busca devolve nada.
    const comAcento = Object.values(ITEMS).find((i) => /[áéíóúâêôãõç]/i.test(i.name))
    if (!comAcento) return // catálogo sem acento nenhum: nada a afirmar
    const semAcento = comAcento.name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    expect(filtrarItens([comAcento.id], { ...FILTRO_DE_ITEM_VAZIO, busca: semAcento })).toEqual([comAcento.id])
  })

  it('busca que não casa devolve lista vazia, e não a lista inteira', () => {
    // Falhar "aberto" (devolver tudo) seria pior que devolver nada: o jogador
    // pensaria que a busca não funciona e voltaria a caçar na lista inteira.
    expect(filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, busca: 'zzzz' })).toHaveLength(0)
  })
})

describe('recortes de POKE (PH-142)', () => {
  it('shiny separa os dois lados', () => {
    const todos = mochila()
    const shinys = filtrarPokes(todos, { ...FILTRO_DE_POKE_VAZIO, shiny: 'shiny' })
    const normais = filtrarPokes(todos, { ...FILTRO_DE_POKE_VAZIO, shiny: 'normal' })
    expect(shinys.every((p) => p.isShiny)).toBe(true)
    expect(normais.every((p) => !p.isShiny)).toBe(true)
    expect(shinys.length + normais.length).toBe(todos.length)
  })

  it('tipo casa também com o SEGUNDO tipo', () => {
    // Geodude é ROCK/GROUND. Filtrar só pelo primeiro esconderia metade do
    // elenco de qualquer tipo secundário — e o jogador não tem como saber que a
    // regra é essa.
    const geodude = SPECIES.geodude
    expect(geodude.type2).toBeTruthy()
    const porSegundo = filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, tipo: geodude.type2! })
    expect(porSegundo.map((p) => p.speciesId)).toContain('geodude')
  })

  it('filtros combinam entre si', () => {
    // Cada um sozinho já é útil; o pedido era poder cruzar.
    const todos = mochila()
    const cruzado = filtrarPokes(todos, {
      ...FILTRO_DE_POKE_VAZIO, shiny: 'shiny', busca: 'pika',
    })
    expect(cruzado.map((p) => p.speciesId)).toEqual(['pikachu'])
  })
})

describe('ordenação (PH-142)', () => {
  it('nível: maior primeiro', () => {
    // Quem vende procura o melhor que tem, não o pior.
    const niveis = filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, ordem: 'nivel' }).map((p) => p.level)
    expect(niveis).toEqual([...niveis].sort((a, b) => b - a))
  })

  it('nome: alfabética', () => {
    const nomes = filtrarPokes(mochila(), { ...FILTRO_DE_POKE_VAZIO, ordem: 'nome' })
      .map((p) => SPECIES[p.speciesId].name)
    expect(nomes).toEqual([...nomes].sort((a, b) => a.localeCompare(b)))
  })

})

describe('itens (PH-142)', () => {
  const ids = Object.values(ITEMS).filter((i) => 'kind' in i && i.kind).map((i) => i.id).slice(0, 40)

  it('a categoria recorta de verdade', () => {
    const categorias = categoriasPresentes(ids)
    expect(categorias.length).toBeGreaterThan(1)
    const alvo = categorias[0]
    const filtrados = filtrarItens(ids, { ...FILTRO_DE_ITEM_VAZIO, categoria: alvo })
    expect(filtrados.length).toBeGreaterThan(0)
    expect(filtrados.length).toBeLessThan(ids.length)
    expect(filtrados.every((id) => 'kind' in ITEMS[id] && ITEMS[id].kind === alvo)).toBe(true)
  })

  it('só oferece categoria que EXISTE no que o jogador tem', () => {
    // Menu com categoria vazia é um beco: o jogador escolhe, não vem nada, e
    // não sabe se filtrou errado ou se não tem.
    const soUmaBola = ids.filter((id) => 'kind' in ITEMS[id] && ITEMS[id].kind === 'ball').slice(0, 1)
    expect(categoriasPresentes(soUmaBola)).toEqual(['ball'])
  })

  it('id fora do catálogo é descartado, não quebra', () => {
    expect(filtrarItens(['nao_existe'], FILTRO_DE_ITEM_VAZIO)).toEqual([])
  })
})
