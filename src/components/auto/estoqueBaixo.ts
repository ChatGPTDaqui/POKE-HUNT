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
  autoToggles: { autoPot: boolean; autoCatch: boolean; autoRevive: boolean; autoStatus: boolean }
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
  // Todos os itens de cura de status, e nao um escolhido: o bot pega o mais
  // barato que cobre o status do momento, entao qualquer um deles pode ser o
  // proximo a ser consumido.
  if (estado.autoToggles.autoStatus) {
    ids.push(...Object.values(ITEMS).filter((i) => i.kind === 'status_heal').map((i) => i.id))
  }
  return [...new Set(ids)]
}

/** True se QUALQUER consumivel em uso estiver abaixo do limiar. */
export function useEstoqueBaixoNoAuto(): boolean {
  return useGameStateStore((s) =>
    itensEmUso(s).some((id) => estoqueDoItemDeRegra(s.items, id) < LIMIAR_ESTOQUE_BAIXO),
  )
}

/**
 * Registra o aviso de estoque baixo TAMBEM no chat (aba Sistema), alem do
 * pisca-pisca no botao Auto.
 *
 * Pedido explicito. O motivo pratico: o alerta visual so existe enquanto o
 * jogador esta olhando pra tela — quem volta depois de uma hora nao tem como
 * saber que o bot ficou sem bola aos 10 minutos. A linha no chat fica.
 *
 * Dispara na BORDA (cruzou o limiar), nunca continuamente: o estado e checado a
 * cada mudanca do save, o que num combate ativo acontece varias vezes por
 * segundo. `jaAvisados` guarda quem ja gerou linha e libera de novo quando o
 * estoque volta a subir — assim comprar mais e gastar de novo avisa outra vez.
 */
const jaAvisados = new Set<string>()

export function observarEstoqueBaixo(
  avisar: (mensagem: string) => void,
): () => void {
  return useGameStateStore.subscribe((s) => {
    const emUso = new Set(itensEmUso(s))
    for (const id of emUso) {
      const quantidade = estoqueDoItemDeRegra(s.items, id)
      if (quantidade < LIMIAR_ESTOQUE_BAIXO) {
        if (jaAvisados.has(id)) continue
        jaAvisados.add(id)
        const nome = id === BEST_POTION_OPTION ? 'Poções' : ITEMS[id]?.name ?? id
        avisar(
          quantidade === 0
            ? `O bot ficou sem ${nome}.`
            : `${nome} acabando: restam ${quantidade}.`,
        )
      } else {
        jaAvisados.delete(id)
      }
    }
    // Item que saiu de uso (automacao desligada, regra removida) volta a poder
    // avisar quando entrar de novo.
    for (const id of [...jaAvisados]) if (!emUso.has(id)) jaAvisados.delete(id)
  })
}
