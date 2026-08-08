// Shift + clique esquerdo num item ou POKE injeta um "link" no Chat Mundo.
//
// Fica num helper compartilhado (e nao repetido em cada tela) por dois motivos
// praticos: o gesto tem que ser IDENTICO em Mochila, Equipe e Loja, e ele
// precisa cancelar a acao normal do clique — sem o `stopPropagation`, Shift +
// clique num card da Mochila tambem abriria o perfil do POKE por cima do chat.
import type { MouseEvent } from 'react'
import { useChatStore, rotuloDeAnexo } from '@/stores/chatStore'
import { useUiStore } from '@/stores/uiStore'
import { averageIvPercent, type PokeInstance, type Species } from '@/data/pokes'
import type { AnyItem } from '@/data/items'
import type { AnexoChat } from '@/data/remote/servidor'

function anexar(anexo: AnexoChat): void {
  useChatStore.getState().anexar(anexo, rotuloDeAnexo(anexo))
  // Abre o chat na aba certa: o link nao serve de nada dentro de uma caixa
  // recolhida, e o jogador acabou de dizer que quer falar sobre aquilo.
  useUiStore.getState().setChatTab('mundo')
  useUiStore.getState().setChatOpen(true)
}

export function linkarPoke(poke: PokeInstance, species: Species): void {
  anexar({
    kind: 'poke',
    id: poke.uid,
    nome: species.name,
    speciesId: species.id,
    level: poke.level,
    rarity: poke.rarity ?? 'comum',
    isShiny: poke.isShiny,
    ivPercent: Math.round(averageIvPercent(poke.ivs)),
  })
}

export function linkarItem(item: AnyItem, quantidade: number): void {
  anexar({ kind: 'item', id: item.id, nome: item.name, quantidade })
}

/**
 * Envolve um handler de clique: com Shift pressionado, linka no chat e ENGOLE
 * o clique; sem Shift, deixa passar.
 *
 * Devolve `true` quando consumiu o evento, pra quem chama poder sair cedo.
 */
export function tratouComoLink(e: MouseEvent, aoLinkar: () => void): boolean {
  if (!e.shiftKey) return false
  e.preventDefault()
  e.stopPropagation()
  aoLinkar()
  return true
}
