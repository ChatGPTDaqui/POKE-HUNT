// Port de js/systems/PokedexSystem.js — contadores de kill por-especie pro
// menu Pokedex. Registrado incondicionalmente por handleEnemyDefeated
// (controller.ts) — tanto o loop ao vivo quanto os caminhos de catch-up
// silencioso/Farm Offline passam por ali.
import type { GameStateStore } from '@/stores/gameStateStore'

export function recordPokedexKill(gameState: GameStateStore, speciesId: string, isShiny: boolean): void {
  const entry = gameState.pokedexKills[speciesId] || { normal: 0, shiny: 0 }
  const next = isShiny ? { ...entry, shiny: entry.shiny + 1 } : { ...entry, normal: entry.normal + 1 }
  gameState.setPokedexKillEntry(speciesId, next)
}

// `shinyOnly` alterna entre o total "unidades derrotadas" (normal+shiny
// combinados) e a contagem so-shiny.
export function pokedexKillCount(gameState: GameStateStore, speciesId: string, shinyOnly: boolean): number {
  const entry = gameState.pokedexKills[speciesId]
  if (!entry) return 0
  return shinyOnly ? entry.shiny : entry.normal + entry.shiny
}
