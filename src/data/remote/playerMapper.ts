// Traducao entre o formato do jogo (GameStateData, camelCase, aninhado) e as
// linhas do Postgres (snake_case, normalizado em 5 tabelas).
//
// Funcoes puras de proposito: sao a parte com mais chance de erro silencioso
// da migracao (um campo esquecido aqui = progresso perdido sem nenhum erro
// aparecer), entao ficam separadas do I/O para poderem ser conferidas e
// testadas sozinhas.
import type { Database } from '@/lib/database.types'
import type { GameStateData, AutoPotRule, AutoCatchConfig, AutoCatchRule, PerfStats, TrainerInfo, PokedexKillCount } from '@/stores/gameStateStore'
import { SPECIES, computeStatsAtLevel, type PokeInstance, type StatBlock } from '@/data/pokes'
import type { RarityKey } from '@/data/rarity'

type Json = Database['public']['Tables']['players']['Row']['auto_toggles']
type Tables = Database['public']['Tables']

// Fronteira do JSONB: o Postgres devolve JSON sem tipo, entao o cast e
// inevitavel aqui. Centralizado nestes dois helpers em vez de espalhado, e
// com uma guarda de forma — um valor corrompido/nulo cai no default do jogo
// em vez de virar `undefined` circulando por dentro do estado.
function fromJson<T>(value: Json, fallback: T): T {
  if (value == null || typeof value !== 'object') return fallback
  return value as unknown as T
}

function toJson<T>(value: T): Json {
  return value as unknown as Json
}
export type PlayerRow = Tables['players']['Row']
export type PokemonRow = Tables['pokemon_instances']['Row']
export type ItemRow = Tables['player_items']['Row']
export type PokedexRow = Tables['player_pokedex']['Row']
export type AutoCatchRuleRow = Tables['player_auto_catch_rules']['Row']

export interface PlayerSnapshot {
  player: PlayerRow
  pokemon: PokemonRow[]
  items: ItemRow[]
  pokedex: PokedexRow[]
  autoCatchRules: AutoCatchRuleRow[]
}

// --- DB -> jogo -------------------------------------------------------------

function rowToPoke(row: PokemonRow): PokeInstance {
  const ivs: StatBlock = {
    hp: row.iv_hp, atkFis: row.iv_atk_fis, atkEsp: row.iv_atk_esp,
    def: row.iv_def, defEsp: row.iv_def_esp, speed: row.iv_speed,
  }
  // Atributos sao RECALCULADOS na carga em vez de lidos das colunas
  // `stat_*`. Eles sao deterministicos a partir de (especie, nivel, IVs,
  // raridade, shiny) — tudo que a linha ja guarda — entao as colunas sao
  // cache, nao verdade.
  //
  // O motivo de nao confiar no cache: todo ajuste de balanceamento que mexe
  // no multiplicador (raridade, shiny, formula da planilha) so valeria pros
  // POKEs criados DEPOIS. O jogador ficaria com dois shinys identicos e
  // atributos diferentes, sem nada no jogo explicando por que. Recalcular
  // aqui faz a mudanca alcancar o time inteiro na proxima carga, sem
  // migration nem backfill.
  //
  // Especie desconhecida (save antigo referenciando especie renomeada/
  // removida no sync) cai nas colunas gravadas em vez de estourar — a
  // alternativa seria o jogo inteiro nao abrir por causa de um POKE.
  const gravados: StatBlock = {
    hp: row.stat_hp, atkFis: row.stat_atk_fis, atkEsp: row.stat_atk_esp,
    def: row.stat_def, defEsp: row.stat_def_esp, speed: row.stat_speed,
  }
  const species = SPECIES[row.species_id]
  const stats = species
    ? computeStatsAtLevel(species, row.level, ivs, row.rarity as RarityKey, row.is_shiny)
    : gravados
  return {
    // O uid do jogo passa a SER o uuid do Postgres. Antes era um contador de
    // modulo (`poke-1`), que nao sobrevive a recarga nem serve de PK — ver
    // nota em createPokeInstance.
    uid: row.id,
    speciesId: row.species_id,
    level: row.level,
    exp: row.exp,
    // Recalcular pra baixo pode deixar o HP salvo acima do novo maximo — a
    // barra passaria de 100% e o auto-pot nunca dispararia.
    hp: Math.min(row.hp, stats.hp),
    isShiny: row.is_shiny,
    rarity: row.rarity as RarityKey,
    ivs,
    stats,
    unlockedAbilities: row.unlocked_abilities,
    locked: row.locked,
    capturedAt: row.created_at,
  }
}

export function snapshotToGameState(snap: PlayerSnapshot, defaults: GameStateData): GameStateData {
  const p = snap.player

  // `team_slot` e a ordem real da equipe no banco; ordenar aqui evita que o
  // POKE ativo mude sozinho conforme a ordem que o Postgres devolveu.
  const team = snap.pokemon
    .filter((r) => r.location === 'team')
    .sort((a, b) => (a.team_slot ?? 0) - (b.team_slot ?? 0))
    .map(rowToPoke)

  const bagPokes = snap.pokemon.filter((r) => r.location === 'bag').map(rowToPoke)

  const items: Record<string, number> = {}
  const lockedItems: Record<string, boolean> = {}
  for (const row of snap.items) {
    // Quantidade zero nao vira chave: o resto do jogo trata "ausente" e "0" do
    // mesmo jeito (`items[id] || 0`), e manter a chave faria a Mochila listar
    // item que o jogador nao tem.
    if (row.quantity > 0) items[row.item_id] = row.quantity
    if (row.locked) lockedItems[row.item_id] = true
  }

  const pokedexKills: Record<string, PokedexKillCount> = {}
  for (const row of snap.pokedex) {
    pokedexKills[row.species_id] = { normal: row.normal_kills, shiny: row.shiny_kills }
  }

  const autoCatchRules: AutoCatchRule[] = snap.autoCatchRules.map((r) => ({
    speciesId: r.species_id,
    ballItemId: r.ball_item_id,
  }))

  return {
    team,
    bagPokes,
    // Um save pode ter activeIndex apontando pra fora da equipe (POKE removido
    // noutro device). Clampar aqui e mais barato que um null-check em todo
    // lugar que le o POKE ativo.
    activeIndex: Math.max(0, Math.min(p.active_team_index, Math.max(0, team.length - 1))),
    items,
    lockedItems,
    wallet: { gold: p.gold, diamonds: p.diamonds },
    unlockedMaps: p.unlocked_maps,
    unlockedContinents: p.unlocked_continents,
    currentMapId: p.current_map_id,
    // Campos JSONB: ver `fromJson` — valor ausente ou corrompido cai no
    // default do jogo em vez de propagar undefined.
    autoToggles: fromJson(p.auto_toggles, defaults.autoToggles),
    autoPotRules: fromJson<AutoPotRule[]>(p.auto_pot_rules, defaults.autoPotRules),
    autoCatchConfig: fromJson<AutoCatchConfig>(p.auto_catch_config, defaults.autoCatchConfig),
    autoCatchRules,
    perfStats: fromJson<PerfStats>(p.perf_stats, defaults.perfStats),
    trainer: { name: p.trainer_name, level: p.trainer_level, exp: p.trainer_exp } satisfies TrainerInfo,
    pokedexKills,
  }
}

// --- jogo -> DB -------------------------------------------------------------

export function gameStateToPlayerRow(userId: string, s: GameStateData): Tables['players']['Update'] & { user_id: string } {
  return {
    user_id: userId,
    trainer_name: s.trainer.name,
    trainer_level: s.trainer.level,
    trainer_exp: s.trainer.exp,
    gold: s.wallet.gold,
    diamonds: s.wallet.diamonds,
    active_team_index: s.activeIndex,
    current_map_id: s.currentMapId,
    unlocked_maps: s.unlockedMaps,
    unlocked_continents: s.unlockedContinents,
    auto_toggles: toJson(s.autoToggles),
    auto_pot_rules: toJson(s.autoPotRules),
    auto_catch_config: toJson(s.autoCatchConfig),
    perf_stats: toJson(s.perfStats),
  }
}

export function pokeToRow(userId: string, poke: PokeInstance, location: 'team' | 'bag', teamSlot: number | null): Tables['pokemon_instances']['Insert'] {
  return {
    id: poke.uid,
    user_id: userId,
    species_id: poke.speciesId,
    location,
    team_slot: teamSlot,
    level: poke.level,
    exp: poke.exp,
    hp: Math.round(poke.hp),
    is_shiny: poke.isShiny,
    rarity: poke.rarity,
    locked: poke.locked ?? false,
    iv_hp: poke.ivs.hp, iv_atk_fis: poke.ivs.atkFis, iv_atk_esp: poke.ivs.atkEsp,
    iv_def: poke.ivs.def, iv_def_esp: poke.ivs.defEsp, iv_speed: poke.ivs.speed,
    stat_hp: poke.stats.hp, stat_atk_fis: poke.stats.atkFis, stat_atk_esp: poke.stats.atkEsp,
    stat_def: poke.stats.def, stat_def_esp: poke.stats.defEsp, stat_speed: poke.stats.speed,
    unlocked_abilities: poke.unlockedAbilities,
  }
}

export function gameStateToPokemonRows(userId: string, s: GameStateData): Tables['pokemon_instances']['Insert'][] {
  return [
    ...s.team.map((p, i) => pokeToRow(userId, p, 'team', i)),
    ...s.bagPokes.map((p) => pokeToRow(userId, p, 'bag', null)),
  ]
}

export function gameStateToItemRows(userId: string, s: GameStateData): Tables['player_items']['Insert'][] {
  // Uniao das chaves: um item pode estar travado com quantidade 0 (o jogador
  // gastou tudo mas manteve o cadeado), e nesse caso a trava tem que
  // sobreviver — por isso nao basta iterar `items`.
  const ids = new Set([...Object.keys(s.items), ...Object.keys(s.lockedItems)])
  return [...ids].map((itemId) => ({
    user_id: userId,
    item_id: itemId,
    quantity: s.items[itemId] ?? 0,
    locked: Boolean(s.lockedItems[itemId]),
  }))
}

export function gameStateToPokedexRows(userId: string, s: GameStateData): Tables['player_pokedex']['Insert'][] {
  return Object.entries(s.pokedexKills).map(([speciesId, k]) => ({
    user_id: userId,
    species_id: speciesId,
    normal_kills: k.normal,
    shiny_kills: k.shiny,
  }))
}

export function gameStateToAutoCatchRuleRows(userId: string, s: GameStateData): Tables['player_auto_catch_rules']['Insert'][] {
  return s.autoCatchRules.map((r) => ({
    user_id: userId,
    species_id: r.speciesId,
    ball_item_id: r.ballItemId,
  }))
}
