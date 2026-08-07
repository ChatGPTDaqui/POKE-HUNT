// Carrega o progresso do jogador, simula, grava. E aqui que a autoridade mora.
import {
  buildMapWorld, stepWorld, simulateWorldSeconds, createRng,
  snapshotToGameState, gameStateToPlayerRow, gameStateToPokemonRows,
  gameStateToItemRows, gameStateToPokedexRows, defaultGameStateData,
  OFFLINE_SIM_STEP_SECONDS,
  type GameStateData, type PlayerSnapshot, type OfflineSimSummary,
} from '#engine'
import { ErroHttp, selecionarTudo, selecionar, atualizar, inserir, apagar, type Config } from './db.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'

// Teto de quanto tempo um unico flush pode creditar. NAO e uma regra de
// balanceamento — e o limite que impede um relogio maluco (ou uma sessao
// esquecida aberta por uma semana) de virar uma simulacao de dias num request.
// O Farm Offline do cliente ja tinha um teto proprio pelo mesmo motivo.
export const MAX_SEGUNDOS_POR_FLUSH = 6 * 3600

export interface LinhaSessao {
  id: string
  user_id: string
  map_id: string
  poke_uid: string
  seed: number | string
  last_flush_at: string
  simulated_seconds: number | string
  closed_at: string | null
}

export async function carregarEstado(cfg: Config, userId: string): Promise<GameStateData> {
  const [player, pokemon, items, pokedex, autoCatchRules] = await Promise.all([
    selecionar<PlayerSnapshot['player']>(cfg, `players?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['pokemon'][number]>(cfg, `pokemon_instances?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['items'][number]>(cfg, `player_items?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['pokedex'][number]>(cfg, `player_pokedex?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['autoCatchRules'][number]>(cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=*`),
  ])
  if (!player[0]) throw new ErroHttp(404, 'jogador sem linha em `players`')
  return snapshotToGameState(
    { player: player[0], pokemon, items, pokedex, autoCatchRules },
    defaultGameStateData(),
  )
}

export async function gravarEstado(cfg: Config, userId: string, estado: GameStateData): Promise<void> {
  await atualizar(cfg, `players?user_id=eq.${userId}`, gameStateToPlayerRow(userId, estado))

  const linhasPoke = gameStateToPokemonRows(userId, estado)
  const idsAgora = new Set(linhasPoke.map((l) => l.id))
  // Diff de remocao: POKE vendido/liberado durante a simulacao tem que sumir do
  // banco, senao ressuscita no proximo load. Comparado contra o que esta LA, e
  // nao contra um cache em memoria — o servidor nao guarda estado entre
  // requests (pra poder rodar em serverless).
  const noBanco = await selecionarTudo<{ id: string }>(cfg, `pokemon_instances?user_id=eq.${userId}&select=id`)
  const remover = noBanco.map((l) => l.id).filter((id) => !idsAgora.has(id))
  if (remover.length) {
    await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&id=in.(${remover.join(',')})`)
  }
  if (linhasPoke.length) await inserir(cfg, 'pokemon_instances', linhasPoke, { upsert: 'id' })

  const linhasItens = gameStateToItemRows(userId, estado)
  if (linhasItens.length) await inserir(cfg, 'player_items', linhasItens, { upsert: 'user_id,item_id' })

  const linhasDex = gameStateToPokedexRows(userId, estado)
  if (linhasDex.length) await inserir(cfg, 'player_pokedex', linhasDex, { upsert: 'user_id,species_id' })
}

export interface ResultadoFlush {
  segundosCreditados: number
  truncado: boolean
  resumo: OfflineSimSummary
  estado: GameStateData
}

/**
 * O coracao da Fase D: simula do ultimo flush ate agora e grava.
 *
 * Repare no que NAO entra aqui: nada vindo do cliente. Nem quanto tempo passou
 * (sai de `now()` menos `last_flush_at`), nem quantos kills houve, nem quanto
 * ouro. O cliente so declarou, na abertura da sessao, em qual hunt esta.
 */
export async function aplicarFlush(cfg: Config, userId: string, sessao: LinhaSessao): Promise<ResultadoFlush> {
  const agora = Date.now()
  const desde = new Date(sessao.last_flush_at).getTime()
  const bruto = (agora - desde) / 1000

  // Relogio pra tras (resync de NTP, maquina com hora errada) daria intervalo
  // negativo. Nao creditar e so re-ancorar — creditar seria pagar por tempo que
  // nao passou, e um `while` com segundos negativos nao termina.
  const segundos = Math.max(0, Math.min(bruto, MAX_SEGUNDOS_POR_FLUSH))
  const truncado = bruto > MAX_SEGUNDOS_POR_FLUSH

  const dados = await carregarEstado(cfg, userId)
  const { store, dados: estado } = criarEstadoDoJogador(dados)

  const ativo = estado.team.find((p) => p.uid === sessao.poke_uid)
  if (!ativo) throw new ErroHttp(409, 'o POKE desta sessao nao esta mais na equipe')
  store.setActiveIndex(estado.team.indexOf(ativo))

  // A semente da sessao alimenta a sequencia inteira. O cliente nunca escolhe:
  // e ela que decide shiny, IV, raridade e crit (ver core/rng.ts).
  const semente = Number(sessao.seed)
  const world = buildMapWorld(sessao.map_id, ativo, {
    rng: createRng(semente),
    counters: { entity: 1, effect: 1, pendingHit: 1 },
  })

  const resumo = simulateWorldSeconds({
    world,
    gameState: store,
    seconds: segundos,
    stepSeconds: OFFLINE_SIM_STEP_SECONDS,
    stepFn: (w, dt, opts) => stepWorld(w, dt, store, opts),
  })

  estado.currentMapId = sessao.map_id
  await gravarEstado(cfg, userId, estado)

  // `last_flush_at` avanca pra AGORA, nao pra `desde + segundos`: o tempo
  // descartado pelo teto foi tempo real que passou, e credita-lo depois daria
  // ao jogador o direito de acumular semanas paradas e sacar tudo de uma vez.
  await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, {
    last_flush_at: new Date(agora).toISOString(),
    simulated_seconds: Number(sessao.simulated_seconds) + segundos,
  })

  return { segundosCreditados: segundos, truncado, resumo, estado }
}
