// Contabilidade de "quanto tempo real passou vs. quanto tempo de jogo foi
// de fato simulado" — a base do catch-up de segundo plano (ver App.tsx).
//
// A versao anterior (aqui e no js/main.js original) rastreava so "wall clock
// do ultimo tick ao vivo", o que e errado em qualquer navegador que faca
// THROTTLE dos timers em vez de congelar a pagina: Chrome/Edge derrubam o
// setInterval de uma aba oculta pra uma vez por MINUTO, o loop clampa cada
// um desses despertares em MAX_DELTA (1s), e o timestamp era atualizado toda
// vez — entao o gap sempre parecia <=60s e 59 de cada 60 segundos em segundo
// plano eram jogados fora silenciosamente. Dispositivos que congelam a pagina
// de vez (Safari/Chrome mobile, abas descartadas) continuavam certos, que e
// exatamente por que isso so quebrava "em alguns dispositivos".
//
// Comparando tempo de parede contra tempo simulado, a diferenca e o que o
// catch-up deve — seja qual for o motivo da perda (throttle de timer, clamp
// do MAX_DELTA, suspensao do sistema operacional).
//
// Modulo singleton de proposito: quem alimenta (useGameLoop, montado dentro
// do <GameCanvas>) e quem le (o catch-up, montado no <App>) sao componentes
// irmaos — passar isso por prop/contexto so acoplaria os dois sem ganho.
let lastSyncAt = Date.now()
let simulatedSinceSync = 0

/** Chamado pelo loop ao vivo com o tempo de jogo realmente avancado no tick. */
export function recordSimulatedSeconds(seconds: number): void {
  simulatedSinceSync += seconds
}

/**
 * Segundos de tempo real que passaram sem ter sido simulados. Pode vir
 * NEGATIVO se o relogio do dispositivo andar pra tras (resync de NTP,
 * usuario mudando a hora, dual boot) — quem chama trata esse caso.
 */
export function pendingDriftSeconds(): number {
  return (Date.now() - lastSyncAt) / 1000 - simulatedSinceSync
}

/** Zera o debito — chamado depois de um catch-up (ou pra re-ancorar o boot). */
export function resetDrift(): void {
  lastSyncAt = Date.now()
  simulatedSinceSync = 0
}
