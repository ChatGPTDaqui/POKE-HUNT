import { LIMIAR_OFFLINE_SEGUNDOS, OFFLINE_FARM_MAX_HOURS } from '@/engine/simulation'

// Farm Offline (aba fechada / PC desligado) — porta o bloco de boot do
// js/main.js. Roda uma vez, no primeiro mount, e so quando o save diz que o
// jogador estava DENTRO de uma hunt (`currentMapId`) e ficou fora por mais de
// MIN_OFFLINE_GAP_SECONDS (evita disparar em todo F5 de desenvolvimento).
// So o modo dev-sem-servidor pode confiar no relogio do proprio DISPOSITIVO
// pra calcular o farm offline. Em producao, adiantar o relogio do aparelho
// creditaria ouro/XP/capturas ficticios sem nenhuma verificacao externa —
// exportada separada do hook (que usa store/efeito, dificil de testar
// isolado) pra esse gate ter cobertura direta (PH-14).
export function farmOfflineSemServidorEhConfiavel(producao: boolean): boolean {
  return !producao
}

// Mesmo limiar que o servidor usa no flush (`LIMIAR_OFFLINE_SEGUNDOS`,
// compartilhado via engine/simulation.ts) — exportada separada do hook pelo
// mesmo motivo de `farmOfflineSemServidorEhConfiavel` acima: cobertura direta
// sem precisar montar store/efeito (PH-15).
export function deveSerPessimista(elapsedSeconds: number): boolean {
  return elapsedSeconds > LIMIAR_OFFLINE_SEGUNDOS
}

// Teto de segundos que o catch-up de aba em segundo plano pode replayar,
// mesmo teto do farm offline oficial — exportada separada pelo mesmo motivo
// das duas acima: sem isso, tampa fechada por dias simulava o gap inteiro
// de uma vez (PH-16).
export function segundosCatchUpEfetivos(gapSeconds: number): number {
  return Math.min(gapSeconds, OFFLINE_FARM_MAX_HOURS * 3600)
}

/**
 * Decide se o boot deve REENTRAR na hunt em que o jogador estava, em vez de
 * montar o Hospital (PH-93).
 *
 * O mapa nunca se perdeu num F5: o servidor grava `game_sessions.map_id` e o
 * assentamento devolve `estado.currentMapId = resumo.stoppedEarly ? null :
 * sessao.map_id`. Quem jogava o dado fora era o cliente, que montava
 * `buildHospitalWorld` incondicionalmente — e num jogo idle isso e o modo de
 * falha mais caro que existe: o jogador acha que deixou farmando e volta horas
 * depois pra descobrir que ficou parado no Hospital.
 *
 * Exportada separada do boot (que mistura promessa, store e efeito) pelo mesmo
 * motivo de `farmOfflineSemServidorEhConfiavel` e `deveSerPessimista` acima:
 * a REGRA tem cobertura direta, sem precisar montar meia arvore de React.
 *
 * `stoppedEarly` e checado apesar de o servidor ja zerar o mapa nesse caminho.
 * Nao e redundancia inutil: sao duas pontas independentes (a coluna vem de um
 * request, a flag de outro), e reentrar com POKE caido nao da erro nenhum —
 * so queima relogio creditando 0,1s de jogo por flush, que e exatamente o tipo
 * de falha que ninguem percebe.
 */
export function deveRetomarHunt(params: {
  mapId: string | null
  stoppedEarly: boolean
  /** HP do POKE no slot ativo; `null` quando o slot esta vazio. */
  hpDoPokeAtivo: number | null
}): boolean {
  if (params.mapId == null) return false
  if (params.stoppedEarly) return false
  if (params.hpDoPokeAtivo == null) return false
  return params.hpDoPokeAtivo > 0
}
