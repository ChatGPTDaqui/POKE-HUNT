// Port de js/systems/StatsTracker.js — rastreador de taxa de farm em tempo
// real pro painel inferior-esquerdo. Totais vivem em gameState.perfStats
// (persistido) — so resetStats (botao "Resetar" do proprio painel) limpa.
import type { GameStateStore } from '@/stores/gameStateStore'

export function recordKill(gameState: GameStateStore, { gold, xp, isShiny }: { gold: number; xp: number; isShiny?: boolean }): void {
  gameState.incrementPerfStats({ gold, xp, mobs: 1, shinys: isShiny ? 1 : 0 })
}

// Mesma acumulacao de recordKill, mas pra um lote inteiro de kills de uma
// vez — usado pra dobrar o resumo agregado de um catch-up silencioso de
// segundo plano (ver main.js's visibilitychange handler + OfflineSimSystem)
// no painel de uma vez, em vez de pular ele por completo.
export function recordBatch(gameState: GameStateStore, { gold, xp, mobs, shinys }: { gold: number; xp: number; mobs: number; shinys: number }): void {
  gameState.incrementPerfStats({ gold, xp, mobs, shinys })
}

export function resetStats(gameState: GameStateStore): void {
  gameState.resetPerfStats()
}

export interface PerfStatsView {
  goldPerHour: number
  xpPerHour: number
  mobsPerHour: number
  shinys: number
}

export function getPerfStats(gameState: GameStateStore): PerfStatsView {
  const stats = gameState.perfStats
  const elapsedHours = Math.max(1 / 3600, (Date.now() - stats.since) / 3600000)
  return {
    goldPerHour: Math.round(stats.gold / elapsedHours),
    xpPerHour: Math.round(stats.xp / elapsedHours),
    mobsPerHour: Math.round(stats.mobs / elapsedHours),
    shinys: stats.shinys,
  }
}
