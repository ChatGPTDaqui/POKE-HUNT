// Traducao entre o formato do jogo (GameStateData, camelCase, aninhado) e as
// linhas do Postgres (snake_case, normalizado em 5 tabelas).
//
// Funcoes puras de proposito: sao a parte com mais chance de erro silencioso
// da migracao (um campo esquecido aqui = progresso perdido sem nenhum erro
// aparecer), entao ficam separadas do I/O para poderem ser conferidas e
// testadas sozinhas.
import type { Database } from '@/lib/database.types'
import type { GameStateData, AutoPotRule, AutoCatchConfig, AutoCatchRule, PerfStats, TrainerInfo, PokedexKillCount } from '@/stores/gameStateStore'
import type { ElementType } from '@/data/generated/types'
import { especialidadeNiveisDefault, type EspecialidadeNiveis } from '@/data/especialidades'
import { SPECIES, computeStatsAtLevel, type PokeInstance, type StatBlock } from '@/data/pokes'
import type { RarityKey } from '@/data/rarity'
import { NATURES_NEUTRAS, type NatureKey } from '@/data/natures'
import { activeAbilitiesPadrao, golpesAprendidosAte, sanearEscolhaDeGolpes } from '@/data/activeAbilities'
import type { StatusCondition } from '@/data/statusEffects'
import { chaveDaMissao, missaoDaChave } from '@/data/missoes'

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
export type MissaoReivindicadaRow = Tables['player_missoes_reivindicadas']['Row']
export type EspecialidadeRow = Tables['player_especialidades']['Row']

export interface PlayerSnapshot {
  player: PlayerRow
  pokemon: PokemonRow[]
  items: ItemRow[]
  pokedex: PokedexRow[]
  autoCatchRules: AutoCatchRuleRow[]
  missoesReivindicadas: MissaoReivindicadaRow[]
  especialidades: EspecialidadeRow[]
}

// --- DB -> jogo -------------------------------------------------------------

export function rowToPoke(row: PokemonRow): PokeInstance {
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
  // `nature` NULL vira uma das 5 NEUTRAS, escolhida pelo uuid da propria linha.
  //
  // POR QUE NAO `undefined`: os atributos ficariam certos de qualquer jeito
  // (`multiplicadorDeNatureza` devolve 1 pra chave ausente), mas a ficha do POKE
  // mostraria "Natureza —" pra sempre. E "pra sempre" nao e exagero: o snapshot
  // da sessao de hunt regrava a linha INTEIRA a cada flush, entao o POKE que
  // carregou sem natureza tambem GRAVA sem natureza, e o backfill da migration
  // e desfeito na primeira caçada. Medido em producao no Entei da conta de
  // teste, que voltou a `null` depois de um flush.
  //
  // Neutra, e nao sorteada entre as 25, pelo mesmo motivo da migration: um POKE
  // que ja existia nao pode acordar 10% pior num atributo. Derivada do uuid pra
  // ser ESTAVEL — sortear aqui daria natureza diferente a cada carga.
  const nature = (row.nature as NatureKey | null) ?? naturezaNeutraEstavel(row.id)
  const stats = species
    ? computeStatsAtLevel(species, row.level, ivs, row.rarity as RarityKey, row.is_shiny, nature)
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
    nature,
    // LIDO da coluna, como a natureza, e nao derivado da especie: e sorteio por
    // individuo. NULL cai no slot 1 da especie dentro de `traitDoPoke` — ver a
    // nota de backfill na migration.
    trait: row.trait ?? undefined,
    stats,
    // DERIVADO da especie, nao lido da coluna — mesmo argumento dos atributos
    // acima. O moveset e funcao de (especie, nivel), e todo caminho que cria ou
    // sobe um POKE ja monta esta lista exatamente assim. Ler a coluna crua
    // deixaria o save preso no learnset da versao em que o POKE foi criado.
    //
    // Deixou de ser teorico com a migracao para os dados de Pokemon Ultra Sun:
    // os learnsets mudaram inteiros e 15 chaves de golpe trocaram de grafia
    // (`solarbeam` -> `solar_beam`, `thundershock` -> `thunder_shock`,
    // `psychic_m` -> `psychic`, ...). Sem isto, todo POKE ja salvo perderia em
    // silencio os golpes renomeados — `getAbility` devolve null e o combate
    // simplesmente pula. A coluna continua sendo GRAVADA (pokeToRow) para
    // qualquer leitor externo e para nao virar um campo morto no schema.
    unlockedAbilities: species ? golpesAprendidosAte(species, row.level) : row.unlocked_abilities,
    // Coluna adicionada depois (migration 20260809150000): linha antiga volta
    // com o default `{}` do banco, entao nao ha migracao de dado a fazer.
    disabledAbilities: (row.disabled_abilities ?? {}) as Record<string, boolean>,
    // LIDO da coluna, ao contrario de `unlockedAbilities` logo acima: este e o
    // unico dos dois que nao e derivavel, e escolha do jogador.
    //
    // `null` (POKE anterior a migration 20260814120100, ou nunca configurado)
    // vira o padrao — os 4 ultimos golpes aprendidos. Array VAZIO e mantido
    // como esta: e a escolha valida de desligar tudo e lutar so com o Ataque
    // Basico, e o `??` nao a confunde com null.
    //
    // O filtro por especie desconhecida acompanha `unlockedAbilities`: sem
    // species nao ha padrao a montar.
    //
    // SANEADA na carga, e nao lida crua, pela MESMA regra que o combate usa
    // (`sanearEscolhaDeGolpes`). Sem isto a escolha gravada podia apontar pra
    // golpe que o learnset atual nao tem mais — e como a coluna
    // `unlocked_abilities` e reescrita com o recalculo acima em todo flush, a
    // RPC `definir_golpes_ativos` passava a recusar QUALQUER edicao daquele
    // POKE ("esse POKE nao conhece esse golpe"), inclusive remover outro
    // golpe: a tela mandava de volta a lista crua, com a chave orfa dentro.
    // Ver a nota inteira em data/activeAbilities.ts#sanearEscolhaDeGolpes.
    activeAbilities: species
      ? sanearEscolhaDeGolpes(
        row.active_abilities ?? activeAbilitiesPadrao(species, row.level),
        golpesAprendidosAte(species, row.level),
        species,
        row.level,
      )
      : (row.active_abilities ?? undefined),
    // Status NAO-VOLATIL. Sobrevive a sessao porque nos jogos ele sobrevive a
    // batalha — so item ou Centro Pokemon tiram. A confusao NAO vem daqui: e
    // volatil, mora na entidade de combate e some ao trocar de cena.
    status: row.status
      ? { tipo: row.status as StatusCondition, turnosRestantes: row.status_turns }
      : null,
    locked: row.locked,
    capturedAt: row.created_at,
    originalTrainer: row.original_trainer ?? undefined,
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

  // Parte de `especialidadeNiveisDefault()` (todo tipo em 0/0) e so
  // SOBRESCREVE os tipos com linha no banco — o jogador tipicamente tem
  // progresso em poucos dos 18, e a tabela so guarda o que ele de fato subiu.
  const especialidades: EspecialidadeNiveis = especialidadeNiveisDefault()
  for (const row of snap.especialidades) {
    especialidades[row.tipo as ElementType] = { dano: row.dano_nivel, defesa: row.defesa_nivel }
  }

  const autoCatchRules: AutoCatchRule[] = snap.autoCatchRules.map((r) => ({
    speciesId: r.species_id,
    ballItemId: r.ball_item_id,
  }))

  const missoesReivindicadas: Record<string, boolean> = {}
  for (const row of snap.missoesReivindicadas) {
    missoesReivindicadas[chaveDaMissao(row.tipo as ElementType, row.species_id)] = true
  }

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
    // MERGE com o default, nao substituicao. `fromJson` devolve o objeto do
    // banco inteiro quando ele existe, entao um toggle NOVO (a coluna e um
    // JSONB gravado antes de ele existir) voltaria `undefined` — falsy — e a
    // automacao nasceria desligada pra todo jogador antigo, sem nada no jogo
    // explicando por que. Foi o que aconteceria com `autoStatus`.
    autoToggles: { ...defaults.autoToggles, ...fromJson(p.auto_toggles, defaults.autoToggles) },
    autoPotRules: fromJson<AutoPotRule[]>(p.auto_pot_rules, defaults.autoPotRules),
    autoCatchConfig: fromJson<AutoCatchConfig>(p.auto_catch_config, defaults.autoCatchConfig),
    autoCatchRules,
    // MERGE com o default pelo mesmo motivo do `autoToggles` acima: linha
    // gravada antes desta coluna existir volta sem a chave, e um `undefined`
    // aqui faria `config.raridades.includes(...)` estourar dentro da simulacao.
    autoSellConfig: { ...defaults.autoSellConfig, ...fromJson(p.auto_sell_config, defaults.autoSellConfig) },
    // Item ausente do JSON = habilitado (o default e {}), entao nao precisa
    // do merge-com-default que `autoToggles` faz — ausencia ja E o estado
    // certo aqui.
    autoStatusConfig: fromJson<Record<string, boolean>>(p.auto_status_config, defaults.autoStatusConfig),
    perfStats: fromJson<PerfStats>(p.perf_stats, defaults.perfStats),
    trainer: { name: p.trainer_name, level: p.trainer_level, exp: p.trainer_exp } satisfies TrainerInfo,
    pokedexKills,
    missoesReivindicadas,
    especialidades,
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
    auto_sell_config: toJson(s.autoSellConfig),
    auto_status_config: toJson(s.autoStatusConfig),
    perf_stats: toJson(s.perfStats),
  }
}

/**
 * Uma das 5 naturezas NEUTRAS, sempre a mesma para o mesmo uuid.
 *
 * Espelha a expressao da migration 20260818140000 (hash do id, modulo 5) — nao
 * precisa dar o MESMO resultado que ela (nenhuma das 5 muda atributo nenhum),
 * mas precisa dar sempre o mesmo resultado pra si mesma: natureza que muda a
 * cada carga apareceria como um POKE trocando de personalidade sozinho.
 */
function naturezaNeutraEstavel(id: string): NatureKey {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return NATURES_NEUTRAS[h % NATURES_NEUTRAS.length]
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
    // `?? null` pelo mesmo motivo de `original_trainer` logo abaixo: com
    // undefined a chave sumiria do JSON do upsert e o PostgREST manteria o
    // valor antigo — que e justamente o caso que este par de colunas nao pode
    // ter (um POKE trocando de natureza em silencio).
    nature: poke.nature ?? null,
    trait: poke.trait ?? null,
    locked: poke.locked ?? false,
    // `?? null` e nao `?? undefined`: com undefined a chave sumiria do JSON do
    // upsert e o PostgREST manteria o valor antigo da linha. Aqui as duas
    // coisas coincidem hoje (o valor nunca e apagado), mas o upsert do
    // servidor reescreve a linha inteira e um campo que "some" e a forma
    // classica de perder dado sem erro nenhum aparecer.
    original_trainer: poke.originalTrainer ?? null,
    iv_hp: poke.ivs.hp, iv_atk_fis: poke.ivs.atkFis, iv_atk_esp: poke.ivs.atkEsp,
    iv_def: poke.ivs.def, iv_def_esp: poke.ivs.defEsp, iv_speed: poke.ivs.speed,
    stat_hp: poke.stats.hp, stat_atk_fis: poke.stats.atkFis, stat_atk_esp: poke.stats.atkEsp,
    stat_def: poke.stats.def, stat_def_esp: poke.stats.defEsp, stat_speed: poke.stats.speed,
    unlocked_abilities: poke.unlockedAbilities,
    // `?? null` pelo mesmo motivo de `original_trainer` acima. NULL aqui tem
    // significado proprio (nunca configurado) e nao pode virar '{}'.
    active_abilities: poke.activeAbilities ?? null,
    // Duas colunas em vez de um jsonb: `status` e um enum de 6 valores com
    // check no banco, e `status_turns` e um int. Guardar `{tipo, turnos}` como
    // JSON deixaria os dois sem validacao nenhuma do lado do Postgres.
    status: poke.status?.tipo ?? null,
    status_turns: poke.status?.turnosRestantes ?? null,
    // Sem esta linha o golpe desligado a mao voltava ligado no proximo
    // carregamento — o combate respeitava o campo, mas ninguem o gravava.
    disabled_abilities: poke.disabledAbilities ?? {},
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

// So insere, nunca "desreivindica" — a chave so entra em `missoesReivindicadas`
// via `setMissaoReivindicada` (gameStateStore.ts), que nunca remove chave.
export function gameStateToMissaoRows(userId: string, s: GameStateData): Tables['player_missoes_reivindicadas']['Insert'][] {
  return Object.keys(s.missoesReivindicadas)
    .filter((chave) => s.missoesReivindicadas[chave])
    .map((chave) => {
      const { tipo, speciesId } = missaoDaChave(chave)
      return { user_id: userId, tipo, species_id: speciesId }
    })
}

// So os tipos com progresso de verdade (dano OU defesa > 0) — o default tem
// os 18 tipos presentes em 0/0, e upsertar as 18 linhas em TODO save (mesmo
// pra quem nunca abriu a tela) seria escrita sem proposito, o mesmo raciocinio
// de `gameStateToItemRows` filtrar quantidade.
export function gameStateToEspecialidadeRows(userId: string, s: GameStateData): Tables['player_especialidades']['Insert'][] {
  return (Object.entries(s.especialidades) as [ElementType, { dano: number; defesa: number }][])
    .filter(([, v]) => v.dano > 0 || v.defesa > 0)
    .map(([tipo, v]) => ({
      user_id: userId,
      tipo,
      dano_nivel: v.dano,
      defesa_nivel: v.defesa,
    }))
}

export function gameStateToAutoCatchRuleRows(userId: string, s: GameStateData): Tables['player_auto_catch_rules']['Insert'][] {
  return s.autoCatchRules.map((r) => ({
    user_id: userId,
    species_id: r.speciesId,
    ball_item_id: r.ballItemId,
  }))
}
