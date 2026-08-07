// Porta de entrada do motor pra quem NAO e o navegador.
//
// Existe pra o servidor da Fase D poder simular o jogo de verdade — mesmo
// codigo, mesmas formulas, mesmo catalogo. Nao ha uma "segunda implementacao
// das regras" no servidor: duas implementacoes divergem no primeiro ajuste de
// balanceamento, e a divergencia vira exatamente o buraco que a autoridade no
// servidor deveria fechar.
//
// Empacotado com `npm run build:engine` (vite build --ssr), que resolve os
// aliases `@/` e produz um ESM que o Node importa direto. Nada aqui pode puxar
// `gameStateStore` como VALOR — ver a nota de topo de simulation.ts.
export { buildMapWorld, buildHospitalWorld, stepWorld, handleEnemyDefeated } from './simulation'
export { OFFLINE_SIM_STEP_SECONDS, OFFLINE_FARM_MAX_HOURS } from './simulation'
export type { SequenciaDeSorteio } from './simulation'

export { simulateWorldSeconds } from './systems/offlineSimSystem'
export type { OfflineSimSummary, KillResult } from './systems/offlineSimSystem'

export { createRng, deriveRng, nextFloat, randomSeed } from '@/core/rng'
export type { Rng } from '@/core/rng'

export { createPokeInstance, SPECIES, computeStatsAtLevel, totalExpForLevel } from '@/data/pokes'
export type { PokeInstance } from '@/data/pokes'
export { MAPS, getMap } from '@/data/maps'
export { getEncounter } from '@/data/enemies'
export { ITEMS, getItem } from '@/data/items'

export type { WorldState, WorldCounters } from './types'

// O contrato que o motor exige de "estado do jogador". No navegador quem
// satisfaz isso e a store zustand; no servidor sera um objeto sobre as linhas do
// Postgres. Exportar o TIPO aqui e o que garante que o adaptador do servidor
// nao esqueca um metodo — se esquecer, o type-check quebra em vez de o jogo
// falhar em runtime no meio de uma simulacao de 6 horas.
export type { GameStateStore, GameStateData } from '@/stores/gameStateStore'
export { defaultGameStateData } from '@/stores/gameStateStore'

// Traducao linha-do-Postgres <-> estado de jogo. Reexportada, e nao
// reimplementada no servidor, pelo mesmo motivo do motor: duas implementacoes
// divergem no primeiro campo novo, e o servidor passaria a gravar um formato
// que o cliente nao le. O modulo e puro (so imports de tipo), entao entra no
// bundle sem arrastar o cliente Supabase do navegador junto.
export {
  snapshotToGameState, gameStateToPlayerRow, gameStateToPokemonRows,
  gameStateToItemRows, gameStateToPokedexRows,
} from '@/data/remote/playerMapper'
export type { PlayerSnapshot } from '@/data/remote/playerMapper'
