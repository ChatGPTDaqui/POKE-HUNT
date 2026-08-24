// Quais consumiveis o bot esta REALMENTE usando agora, e quais deles estao
// acabando.
//
// "Em uso" e a parte que importa: alertar sobre bolas com o auto-catch
// desligado, ou sobre a pocao de uma regra que nunca casa, treinaria o jogador
// a ignorar o alerta. So entra item que uma automacao LIGADA consumiria.
//
// ---------------------------------------------------------------------------
// FAMILIA, E NAO ITEM (PH-144)
// ---------------------------------------------------------------------------
// A primeira versao media item por item, e errava de duas formas que o jogador
// notou:
//
//  1. ITEM DESLIGADO contava. `autoStatusConfig` e um mapa por item — o jogador
//     pode tirar o Antidoto da lista do bot. O aviso empurrava TODA cura de
//     status assim mesmo, entao um Antidoto zerado e desmarcado gritava igual.
//  2. SUBSTITUTO EM ESTOQUE nao contava. `ids.push('revive')` era literal: quem
//     usa Max Revive via o aviso medir o estoque de um item que o bot nem
//     encosta.
//
// A unidade certa e a FAMILIA: o conjunto de itens que cumprem a mesma funcao.
// Ficar sem Antidoto nao e ficar sem suprimento se ha Full Heal na mochila.
//
// O molde ja existia — `BEST_POTION_OPTION` ("use a melhor pocao que eu tiver")
// ja era um id que representa um conjunto, e `estoqueDoItemDeRegra` ja somava o
// grupo dele. Aqui isso vira o caso geral, com sentinelas proprias.
//
// CURA DE STATUS E AGRUPADA POR STATUS, e nao numa familia so: Antidoto cura
// veneno e Despertar cura sono — eles NAO se substituem. Somar os seis
// esconderia "tenho 50 Despertar e nada pra veneno". Full Heal entra nas seis
// familias, porque cobre todas.
import { ITEMS } from '@/data/items'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'

import type { StatusCondition } from '@/data/generated/types'

/** Abaixo disto o consumivel em uso pisca em vermelho (pedido explicito). */
export const LIMIAR_ESTOQUE_BAIXO = 10

const POTION_IDS = Object.values(ITEMS).filter((i) => i.kind === 'potion').map((i) => i.id)
const REVIVE_IDS = Object.values(ITEMS).filter((i) => i.kind === 'revive').map((i) => i.id)

/** Id que representa a familia de revives (Revive, Max Revive, ...). */
export const FAMILIA_REVIVE = 'familia:revive'
/** Prefixo das familias de cura de status. Uma por status curavel. */
export const FAMILIA_STATUS = 'familia:status:'

/** `familia:status:poison` -> `poison`. Devolve null pra qualquer outro id. */
function statusDaFamilia(id: string): StatusCondition | null {
  return id.startsWith(FAMILIA_STATUS) ? (id.slice(FAMILIA_STATUS.length) as StatusCondition) : null
}

/**
 * Curas de status HABILITADAS que cobrem este status.
 *
 * `!== false` e nao `=== true`: ausente significa habilitado, mesmo default que
 * o bot usa em `autoSystem#melhorCuraDeStatus`. Ler diferente aqui faria o aviso
 * discordar de quem de fato consome.
 */
function curasHabilitadasPara(
  status: StatusCondition, autoStatusConfig: Record<string, boolean>,
): string[] {
  return Object.values(ITEMS)
    .filter((item) => (
      item.kind === 'status_heal'
      && Array.isArray(item.healsStatus)
      && item.healsStatus.includes(status)
      && autoStatusConfig[item.id] !== false
    ))
    .map((item) => item.id)
}

/** Os itens que este id representa. Id de item comum representa a si mesmo. */
export function idsDaFamilia(
  id: string, autoStatusConfig: Record<string, boolean> = {},
): string[] {
  if (id === BEST_POTION_OPTION) return POTION_IDS
  if (id === FAMILIA_REVIVE) return REVIVE_IDS
  const status = statusDaFamilia(id)
  if (status) return curasHabilitadasPara(status, autoStatusConfig)
  return [id]
}

/**
 * Estoque considerado para um id de regra — somando a FAMILIA quando o id
 * representa um conjunto.
 *
 * Contar so o item nomeado esconderia justamente o caso que o jogador reclamou:
 * zero Revive com cinquenta Max Revive na mochila.
 */
export function estoqueDoItemDeRegra(
  items: Record<string, number>,
  itemId: string,
  autoStatusConfig: Record<string, boolean> = {},
): number {
  return idsDaFamilia(itemId, autoStatusConfig)
    .reduce((soma, id) => soma + (items[id] ?? 0), 0)
}

/** Rotulo legivel de uma familia, ou null se o id for item comum. */
export function rotuloDaFamilia(id: string): string | null {
  if (id === BEST_POTION_OPTION) return 'Poções (total)'
  if (id === FAMILIA_REVIVE) return 'Revives'
  const status = statusDaFamilia(id)
  if (!status) return null
  const NOMES: Record<StatusCondition, string> = {
    poison: 'Cura de veneno',
    burn: 'Cura de queimadura',
    paralysis: 'Cura de paralisia',
    sleep: 'Cura de sono',
    freeze: 'Cura de congelamento',
    confusion: 'Cura de confusão',
  }
  return NOMES[status] ?? null
}

const TODOS_OS_STATUS: StatusCondition[] = [
  'poison', 'burn', 'paralysis', 'sleep', 'freeze', 'confusion',
]

/** Ids (de item ou de familia) que alguma automacao ligada consumiria. */
export function itensEmUso(estado: {
  autoToggles: { autoPot: boolean; autoCatch: boolean; autoRevive: boolean; autoStatus: boolean }
  autoPotRules: { itemId: string }[]
  autoCatchConfig: { ballId: string; shinyBallId: string; catchShinyEnabled: boolean }
  autoCatchRules: { ballItemId: string }[]
  autoStatusConfig: Record<string, boolean>
}): string[] {
  const ids: string[] = []
  if (estado.autoToggles.autoPot) ids.push(...estado.autoPotRules.map((r) => r.itemId))
  if (estado.autoToggles.autoCatch) {
    ids.push(estado.autoCatchConfig.ballId)
    if (estado.autoCatchConfig.catchShinyEnabled) ids.push(estado.autoCatchConfig.shinyBallId)
    ids.push(...estado.autoCatchRules.map((r) => r.ballItemId))
  }
  // A FAMILIA, e nao `'revive'`: o bot usa o revive mais barato que tiver (ver
  // autoSystem#melhorRevive), entao Max Revive na mochila conta.
  if (estado.autoToggles.autoRevive) ids.push(FAMILIA_REVIVE)
  if (estado.autoToggles.autoStatus) {
    // Uma familia por STATUS. Status cuja lista habilitada ficou vazia sai de
    // uso: o jogador desmarcou tudo que curava aquilo, e o bot nao vai tentar.
    for (const status of TODOS_OS_STATUS) {
      if (curasHabilitadasPara(status, estado.autoStatusConfig).length > 0) {
        ids.push(`${FAMILIA_STATUS}${status}`)
      }
    }
  }
  return [...new Set(ids)]
}

/** True se QUALQUER familia em uso estiver abaixo do limiar. */
export function useEstoqueBaixoNoAuto(): boolean {
  return useGameStateStore((s) =>
    itensEmUso(s).some((id) => estoqueDoItemDeRegra(s.items, id, s.autoStatusConfig) < LIMIAR_ESTOQUE_BAIXO),
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
      const quantidade = estoqueDoItemDeRegra(s.items, id, s.autoStatusConfig)
      if (quantidade < LIMIAR_ESTOQUE_BAIXO) {
        if (jaAvisados.has(id)) continue
        jaAvisados.add(id)
        const nome = rotuloDaFamilia(id) ?? ITEMS[id]?.name ?? id
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
