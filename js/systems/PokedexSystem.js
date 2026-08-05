// Per-species kill counters for the Pokedex menu (js/ui/panels/PokedexMenu.js).
// Recorded unconditionally from main.js#handleEnemyDefeated — both the live
// 60fps loop and the silent catch-up/Farm Offline paths funnel through that
// one function, so background farming counts kills here exactly like actual
// play does (same reasoning as StatsTracker.js's recordKill/recordBatch).
export function recordPokedexKill(gameState, speciesId, isShiny) {
  const entry = gameState.pokedexKills[speciesId] || { normal: 0, shiny: 0 };
  if (isShiny) entry.shiny += 1;
  else entry.normal += 1;
  gameState.pokedexKills[speciesId] = entry;
}

// `shinyOnly` toggles between the "unidades derrotadas" total (both normal
// and shiny kills combined) and the shiny-exclusive count — see the ✨ toggle
// in PokedexMenu.js.
export function pokedexKillCount(gameState, speciesId, shinyOnly) {
  const entry = gameState.pokedexKills[speciesId];
  if (!entry) return 0;
  return shinyOnly ? entry.shiny : entry.normal + entry.shiny;
}
