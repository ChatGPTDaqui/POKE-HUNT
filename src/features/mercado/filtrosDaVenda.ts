// Filtro e ordenação das telas de VENDA do Mercado (PH-142).
//
// ---------------------------------------------------------------------------
// POR QUE MÓDULO SEPARADO DA TELA
// ---------------------------------------------------------------------------
// A regra de "o que casa com este filtro" é a única parte disto que pode errar
// em silêncio: filtro que não casa com nada devolve lista vazia, e lista vazia
// é indistinguível de "não tenho nada para vender". Separada da tela, ela tem
// teste; embutida no `.filter()` do JSX, não teria.
//
// A ORDENAÇÃO É PARTE DO FILTRO, e não um detalhe visual: a reclamação original
// era "tenho que caçar o POKE na lista inteira", e caçar não é só sobre esconder
// o que não interessa — é sobre o que interessa aparecer primeiro.
import { SPECIES, averageIvPercent, type PokeInstance } from '@/data/pokes'
import { rarityOf } from '@/data/rarity'
import { ITEMS } from '@/data/items'

import type { RarityKey } from '@/data/rarity'
import type { ElementType } from '@/data/generated/types'

export type OrdemDePoke = 'nivel' | 'iv' | 'nome' | 'raridade'
export type ShinyFiltro = 'todos' | 'shiny' | 'normal'

export interface FiltroDePoke {
  /** Trecho do nome da espécie. Sem acento e sem caixa — ver `normalizar`. */
  busca: string
  tipo: ElementType | 'todos'
  raridade: RarityKey | 'todos'
  shiny: ShinyFiltro
  ordem: OrdemDePoke
}

export const FILTRO_DE_POKE_VAZIO: FiltroDePoke = {
  busca: '', tipo: 'todos', raridade: 'todos', shiny: 'todos', ordem: 'nivel',
}

export interface FiltroDeItem {
  busca: string
  /** `kind` do catálogo (`ball`, `potion`, ...) ou todos. */
  categoria: string
}

export const FILTRO_DE_ITEM_VAZIO: FiltroDeItem = { busca: '', categoria: 'todos' }

/**
 * Caixa e acento fora, para "pikachu" achar "Pikachu" e "poção" achar "Pocao".
 *
 * Sem isto o campo de busca vira uma armadilha: o jogador digita o nome certo,
 * não acha nada, e conclui que não tem o item.
 */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function filtrarPokes(pokes: PokeInstance[], filtro: FiltroDePoke): PokeInstance[] {
  const busca = normalizar(filtro.busca)
  const casam = pokes.filter((p) => {
    const especie = SPECIES[p.speciesId]
    // Espécie fora do catálogo não é filtrada, é DESCARTADA: sem ela não há
    // nome, tipo nem sprite, e a tela quebraria ao desenhar o slot.
    if (!especie) return false
    if (busca && !normalizar(especie.name).includes(busca)) return false
    if (filtro.tipo !== 'todos' && especie.type !== filtro.tipo && especie.type2 !== filtro.tipo) return false
    if (filtro.raridade !== 'todos' && rarityOf(p).key !== filtro.raridade) return false
    if (filtro.shiny === 'shiny' && !p.isShiny) return false
    if (filtro.shiny === 'normal' && p.isShiny) return false
    return true
  })
  return ordenarPokes(casam, filtro.ordem)
}

const PESO_DA_RARIDADE: Record<RarityKey, number> = {
  comum: 0, incomum: 1, raro: 2, ultra: 3, legendary: 4, mythic: 5,
}

function ordenarPokes(pokes: PokeInstance[], ordem: OrdemDePoke): PokeInstance[] {
  // Cópia defensiva. No caminho de hoje ela é redundante — quem chama é
  // `filtrarPokes`, e `filter()` já devolve array novo —, mas `sort` muta, e um
  // chamador futuro que passasse a lista do store direto mutaria o estado do
  // zustand sem ele perceber.
  //
  // Registrado porque a primeira versão deste arquivo tinha um TESTE afirmando
  // que a origem não é mutada, e ele passava com a cópia removida: o `filter` já
  // protegia. Teste que não sabe reprovar é pior que teste nenhum, então ele
  // saiu e ficou este comentário.
  const lista = [...pokes]
  switch (ordem) {
    case 'nome':
      return lista.sort((a, b) => SPECIES[a.speciesId].name.localeCompare(SPECIES[b.speciesId].name))
    case 'iv':
      return lista.sort((a, b) => averageIvPercent(b.ivs) - averageIvPercent(a.ivs))
    case 'raridade':
      return lista.sort((a, b) => PESO_DA_RARIDADE[rarityOf(b).key] - PESO_DA_RARIDADE[rarityOf(a).key])
    case 'nivel':
    default:
      // Maior primeiro nos três numéricos: quem vende procura o melhor que tem,
      // não o pior.
      return lista.sort((a, b) => b.level - a.level)
  }
}

export function filtrarItens(
  ids: string[], filtro: FiltroDeItem,
): string[] {
  const busca = normalizar(filtro.busca)
  return ids.filter((id) => {
    const item = ITEMS[id]
    if (!item) return false
    if (busca && !normalizar(item.name).includes(busca)) return false
    if (filtro.categoria !== 'todos' && ('kind' in item ? item.kind : '') !== filtro.categoria) return false
    return true
  })
}

/** Categorias presentes nos ids dados, para a tela só oferecer o que existe. */
export function categoriasPresentes(ids: string[]): string[] {
  const kinds = new Set<string>()
  for (const id of ids) {
    const item = ITEMS[id]
    if (item && 'kind' in item && item.kind) kinds.add(item.kind)
  }
  return [...kinds].sort()
}

export const NOME_DA_CATEGORIA: Record<string, string> = {
  ball: 'Bolas',
  potion: 'Poções',
  revive: 'Revives',
  status_heal: 'Curas de status',
  rod: 'Varas',
}
