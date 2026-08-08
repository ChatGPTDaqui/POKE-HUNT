// Quais consumiveis o bot esta REALMENTE usando agora, e quais deles estao
// acabando.
//
// "Em uso" e a parte que importa: alertar sobre bolas com o auto-catch
// desligado, ou sobre a pocao de uma regra que nunca casa, treinaria o jogador
// a ignorar o alerta. So entra item que uma automacao LIGADA consumiria.
import { ITEMS } from '@/data/items'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

/** Abaixo disto o consumivel em uso pisca em vermelho (pedido explicito). */
export const LIMIAR_ESTOQUE_BAIXO = 10

const POTION_IDS = Object.values(ITEMS).filter((i) => i.kind === 'potion').map((i) => i.id)

/**
 * Estoque considerado para um id de item de regra.
 *
 * `BEST_POTION_OPTION` nao e um item: e "use a melhor pocao que eu tiver".
 * O estoque relevante nele e a SOMA de todas as pocoes — contar zero (ou pular
 * a regra) esconderia justamente o caso de o jogador estar ficando sem nenhuma.
 */
export function estoqueDoItemDeRegra(items: Record<string, number>, itemId: string): number {
  if (itemId !== BEST_POTION_OPTION) return items[itemId] ?? 0
  return POTION_IDS.reduce((soma, id) => soma + (items[id] ?? 0), 0)
}

/** Ids (ou `BEST_POTION_OPTION`) que alguma automacao ligada consumiria. */
export function itensEmUso(estado: {
  autoToggles: { autoPot: boolean; autoCatch: boolean; autoRevive: boolean }
  autoPotRules: { itemId: string }[]
  autoCatchConfig: { ballId: string; shinyBallId: string; catchShinyEnabled: boolean }
  autoCatchRules: { ballItemId: string }[]
}): string[] {
  const ids: string[] = []
  if (estado.autoToggles.autoPot) ids.push(...estado.autoPotRules.map((r) => r.itemId))
  if (estado.autoToggles.autoCatch) {
    ids.push(estado.autoCatchConfig.ballId)
    if (estado.autoCatchConfig.catchShinyEnabled) ids.push(estado.autoCatchConfig.shinyBallId)
    ids.push(...estado.autoCatchRules.map((r) => r.ballItemId))
  }
  if (estado.autoToggles.autoRevive) ids.push('revive')
  return [...new Set(ids)]
}

/** True se QUALQUER consumivel em uso estiver abaixo do limiar. */
export function useEstoqueBaixoNoAuto(): boolean {
  return useGameStateStore((s) =>
    itensEmUso(s).some((id) => estoqueDoItemDeRegra(s.items, id) < LIMIAR_ESTOQUE_BAIXO),
  )
}
