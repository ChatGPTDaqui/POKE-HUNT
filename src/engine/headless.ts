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
export { OFFLINE_SIM_STEP_SECONDS, LIVE_SIM_STEP_SECONDS, OFFLINE_FARM_MAX_HOURS, LIMIAR_OFFLINE_SEGUNDOS } from './simulation'
export type { SequenciaDeSorteio } from './simulation'

export { simulateWorldSeconds, createEmptySummary } from './systems/offlineSimSystem'
export type { OfflineSimSummary, KillResult } from './systems/offlineSimSystem'

export { createRng, restoreRng, deriveRng, nextFloat, randomSeed } from '@/core/rng'
export type { Rng } from '@/core/rng'

export { createPokeInstance, SPECIES, computeStatsAtLevel, totalExpForLevel, averageIvPercent } from '@/data/pokes'
export type { PokeInstance } from '@/data/pokes'
export { MAPS, getMap } from '@/data/maps'
export { POOL_POR_SALA } from '@/data/huntSpawnOverrides'
// A sala INICIAL da sessao e decidida na abertura, pelo servidor (ver
// authority/src/appSessao.ts#abrirSessao): se ela nascesse no primeiro flush, o
// cliente entraria com uma sala sorteada por ele e trocaria de sub-bioma
// (com aviso na tela) 30 segundos depois de entrar na hunt.
export { novaSala, temSalas, solicitarAvancoDeSala, SALA_TRANSITION_COUNTDOWN } from './systems/salaSystem'
export type { AvancoDeSala } from './systems/salaSystem'
// PH-140: o servidor resolve o clima de ambiente e manda pro cliente, que nao
// tem a semente da sessao pra derivar o dele.
export { climaDaSala } from './systems/climaAmbiente'
export {
  BIOMAS, FAIXAS, FAIXAS_INICIAIS, GRUPOS_DO_LANCE, SALAS_POR_HUNT, ABATES_POR_SALA,
  BIOMA_POR_CHAVE, SUB_BIOMA_POR_CHAVE, huntId, biomaDoMapId, indiceDoBiomaNoMapId,
  ORDEM_DOS_BIOMAS, biomaProgressDefault,
} from '@/data/biomas'
export type { BiomaDef, SubBiomaDef, FaixaDef, FaixaId, BiomaProgress } from '@/data/biomas'
export { getEncounter } from '@/data/enemies'
export { ITEMS, getItem } from '@/data/items'
export {
  MAX_ACTIVE_ABILITIES, activeAbilitiesPadrao, ehGolpeAoeDeNivel50, golpesUtilizaveis,
} from '@/data/activeAbilities'

export type { WorldState, WorldCounters, SalaAtiva, ClimaTipo, BossPendente } from './types'

// Regras de economia e progressao usadas pelas ACOES do jogador (comprar,
// vender, desbloquear, evoluir). O servidor chama exatamente estas — nao ha uma
// versao "do servidor" das regras de preco, senao o primeiro reajuste de
// balanceamento faria cliente e servidor discordarem sobre quanto custa uma
// Pokebola.
export {
  buyItem, sellItem, sellAllItems, sellBagPoke, sellAllBagPokes,
  unlockMap, pokemonSellValue,
} from './systems/economySystem'
export { evolvePokeInstance, grantExp } from './systems/progressionSystem'
export { isDead } from './entity'
export { recordBatch } from './systems/farmRates'

// O contrato que o motor exige de "estado do jogador". No navegador quem
// satisfaz isso e a store zustand; no servidor sera um objeto sobre as linhas do
// Postgres. Exportar o TIPO aqui e o que garante que o adaptador do servidor
// nao esqueca um metodo — se esquecer, o type-check quebra em vez de o jogo
// falhar em runtime no meio de uma simulacao de 6 horas.
export type { GameStateStore } from '@/stores/gameStateStore'
export type { GameStateData } from '@/stores/gameStateDefaults'
export { defaultGameStateData, MAX_TEAM_SIZE } from '@/stores/gameStateDefaults'

// Traducao linha-do-Postgres <-> estado de jogo. Reexportada, e nao
// reimplementada no servidor, pelo mesmo motivo do motor: duas implementacoes
// divergem no primeiro campo novo, e o servidor passaria a gravar um formato
// que o cliente nao le. O modulo e puro (so imports de tipo), entao entra no
// bundle sem arrastar o cliente Supabase do navegador junto.
export {
  snapshotToGameState, gameStateToPlayerRow, gameStateToPokemonRows,
  gameStateToItemRows, gameStateToPokedexRows, gameStateToAutoCatchRuleRows,
  rowToPoke,
} from '@/data/remote/playerMapper'
export type { PlayerSnapshot, PokemonRow } from '@/data/remote/playerMapper'
