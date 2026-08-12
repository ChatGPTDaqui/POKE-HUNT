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
