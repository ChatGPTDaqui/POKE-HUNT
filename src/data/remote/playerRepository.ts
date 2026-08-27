// Unico ponto do app que conversa com o Postgres sobre progresso do jogador.
// Tudo o mais continua lendo/escrevendo via `gameStateStore` — essa costura e
// o que permite a Fase D trocar "cliente escreve no banco" por "cliente manda
// intent pro servidor" sem espalhar mudanca pelo codigo inteiro.
import { supabase } from '@/lib/supabase'
import type { GameStateData } from '@/stores/gameStateStore'
import {
  snapshotToGameState,
  gameStateToPlayerRow,
  gameStateToPokemonRows,
  gameStateToItemRows,
  gameStateToPokedexRows,
  gameStateToAutoCatchRuleRows,
  gameStateToMissaoRows,
  type PlayerSnapshot,
} from './playerMapper'

export interface LoadResult {
  data: GameStateData
  /** `players.updated_at` em ms — o Farm Offline usa isso pra medir o tempo fora. */
  savedAt: number
}

/** Erro distinto do genérico de rede — quem chama sabe que é conflito, não falha de I/O. */
export class ConflitoDeEscrita extends Error {
  constructor() {
    super('Progresso salvo em outra aba/dispositivo enquanto esta aba tentava gravar.')
    this.name = 'ConflitoDeEscrita'
  }
}

export async function loadPlayerState(userId: string, defaults: GameStateData): Promise<LoadResult | null> {
  // Uma ida por tabela, em paralelo. Um `select` aninhado do PostgREST traria
  // tudo numa request so, mas devolveria o progresso inteiro embutido na linha
  // de `players`, o que complica o mapeamento sem ganho real: sao 5 requests
  // pequenas, disparadas juntas, uma unica vez no login.
  const [player, pokemon, items, pokedex, autoCatchRules, missoesReivindicadas] = await Promise.all([
    supabase.from('players').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('pokemon_instances').select('*').eq('user_id', userId),
    supabase.from('player_items').select('*').eq('user_id', userId),
    supabase.from('player_pokedex').select('*').eq('user_id', userId),
    supabase.from('player_auto_catch_rules').select('*').eq('user_id', userId),
    supabase.from('player_missoes_reivindicadas').select('*').eq('user_id', userId),
  ])

  const erro = player.error ?? pokemon.error ?? items.error ?? pokedex.error ?? autoCatchRules.error ?? missoesReivindicadas.error
  if (erro) throw new Error(`Falha ao carregar progresso: ${erro.message}`)

  // Sem linha em `players` = a trigger `handle_new_user` ainda nao rodou (ou
  // falhou). Devolver null em vez de inventar estado — quem chama decide
  // esperar/repetir, em vez de o jogador comecar com um save fantasma que
  // sobrescreveria o real depois.
  if (!player.data) return null

  const snap: PlayerSnapshot = {
    player: player.data,
    pokemon: pokemon.data ?? [],
    items: items.data ?? [],
    pokedex: pokedex.data ?? [],
    autoCatchRules: autoCatchRules.data ?? [],
    missoesReivindicadas: missoesReivindicadas.data ?? [],
  }

  // Ancora o diff de exclusao do proximo save (ver `definirIdsConhecidos`).
  definirIdsConhecidos(userId, snap.pokemon.map((r) => r.id))
  // Ancora o CAS otimista do proximo save (PH-18) — string bruta do Postgres,
  // nao `new Date(...).getTime()` reconstruido: `timestamptz` tem precisao de
  // microssegundo, `Date` so de milissegundo, e o filtro abaixo compara igualdade
  // exata.
  updatedAtEsperadoPorUsuario.set(userId, player.data.updated_at)

  return {
    data: snapshotToGameState(snap, defaults),
    savedAt: new Date(player.data.updated_at).getTime(),
  }
}

// Ids que a ultima leitura/escrita deixou no banco. Serve pra apagar apenas o
// que de fato sumiu, em vez de mandar `delete ... not in (<lista inteira>)`:
// com uma mochila grande aquela lista vira uma URL de milhares de caracteres
// a cada save, e servidores/proxies cortam URL longa.
//
// Escopado por `userId` (nao um singleton de modulo compartilhado): login e
// logout sao navegacao SPA sem reload de pagina, entao o modulo sobrevive a
// troca de conta na mesma aba. Um `Set` global era sobrescrito pelo save
// pendente da conta anterior resolvendo DEPOIS do login da proxima, fazendo
// o diff de exclusao comparar contra os ids errados e um POKE removido de
// verdade "reaparecer" numa leitura futura (PH-19).
const idsNoBancoPorUsuario = new Map<string, Set<string>>()

/** Chamado pelo load e por quem importa um save, pra ancorar o diff. */
export function definirIdsConhecidos(userId: string, ids: Iterable<string>): void {
  idsNoBancoPorUsuario.set(userId, new Set(ids))
}

// `players.updated_at` que este cliente acredita ser o atual — CAS otimista
// do proximo save (PH-18). `undefined`/ausente na Map = ainda nao carregou
// nem salvou esta conta nesta aba; nesse caso o primeiro save nao tem o que
// comparar e so grava (mesmo comportamento de sempre). Mesma razao do Map
// acima pra nao ser singleton de modulo: senao o save pendente de uma conta
// resolvendo apos o login de outra sobrescrevia o CAS token da conta nova
// com o da antiga, e o proximo save dela levava um `ConflitoDeEscrita` falso
// (PH-19).
const updatedAtEsperadoPorUsuario = new Map<string, string | null>()

export async function savePlayerState(userId: string, state: GameStateData): Promise<void> {
  const pokemonRows = gameStateToPokemonRows(userId, state)
  const itemRows = gameStateToItemRows(userId, state)
  const pokedexRows = gameStateToPokedexRows(userId, state)
  const ruleRows = gameStateToAutoCatchRuleRows(userId, state)
  const missaoRows = gameStateToMissaoRows(userId, state)

  const idsNoBanco = idsNoBancoPorUsuario.get(userId) ?? new Set<string>()
  const vivos = new Set(pokemonRows.map((r) => r.id as string))
  const removidos = [...idsNoBanco].filter((id) => !vivos.has(id))

  // CAS otimista: sem isso, duas abas do MESMO jogador cada uma com seu
  // proprio debounce de `setItem` fazem update/upsert sem checar conflito — a
  // que grava por ultimo sobrescreve o ouro/hunt atual que a outra ja tinha
  // persistido, e nada detecta ou avisa (PH-18). `updated_at` e mantido pelo
  // trigger `players_set_updated_at` (toda escrita bem sucedida avanca a
  // versao), entao comparar contra o valor lido no load/save anterior e
  // suficiente pra detectar quem perdeu a corrida.
  const updatedAtEsperado = updatedAtEsperadoPorUsuario.get(userId) ?? null
  let query = supabase.from('players').update(gameStateToPlayerRow(userId, state)).eq('user_id', userId)
  if (updatedAtEsperado != null) query = query.eq('updated_at', updatedAtEsperado)
  const { data: linhasPlayer, error: erroPlayer } = await query.select('updated_at')
  if (erroPlayer) throw new Error(`Falha ao salvar jogador: ${erroPlayer.message}`)
  if (!linhasPlayer?.length) {
    // PH-17: 0 linhas SEM `error` e sucesso silencioso disfarcado — sessao
    // expirada/revogada faz a RLS filtrar o UPDATE pra zero linhas, e
    // Postgrest nunca transforma isso em `error`. Sem CAS em voo
    // (updatedAtEsperado null), so pode ser isso: sessao invalida. Com CAS
    // em voo, tambem pode ser outra aba que venceu a corrida (PH-18) — os
    // dois casos tem que ficar visiveis, nunca silenciosos.
    throw updatedAtEsperado != null
      ? new ConflitoDeEscrita()
      : new Error('Nenhuma linha atualizada ao salvar jogador — sessao pode ter expirado ou sido revogada')
  }
  updatedAtEsperadoPorUsuario.set(userId, linhasPlayer[0].updated_at)

  // Apagar ANTES de inserir, e nao depois: um POKE que saiu da equipe pra
  // mochila muda de `location`/`team_slot`, e o indice unico
  // `one_pokemon_per_team_slot` reclamaria se a linha antiga ainda ocupasse o
  // slot no momento do upsert.
  if (removidos.length > 0) {
    const { error } = await supabase.from('pokemon_instances').delete().eq('user_id', userId).in('id', removidos)
    if (error) throw new Error(`Falha ao remover pokemon: ${error.message}`)
  }

  if (pokemonRows.length > 0) {
    const { error } = await supabase.from('pokemon_instances').upsert(pokemonRows, { onConflict: 'id' })
    if (error) throw new Error(`Falha ao salvar pokemon: ${error.message}`)
  }

  if (itemRows.length > 0) {
    const { error } = await supabase.from('player_items').upsert(itemRows, { onConflict: 'user_id,item_id' })
    if (error) throw new Error(`Falha ao salvar itens: ${error.message}`)
  }

  if (pokedexRows.length > 0) {
    const { error } = await supabase.from('player_pokedex').upsert(pokedexRows, { onConflict: 'user_id,species_id' })
    if (error) throw new Error(`Falha ao salvar pokedex: ${error.message}`)
  }

  if (missaoRows.length > 0) {
    const { error } = await supabase.from('player_missoes_reivindicadas')
      .upsert(missaoRows, { onConflict: 'user_id,tipo,species_id', ignoreDuplicates: true })
    if (error) throw new Error(`Falha ao salvar missoes: ${error.message}`)
  }

  // Regras de auto-catch sao poucas (uma por especie escolhida a mao) e tem id
  // proprio gerado pelo banco, sem chave natural estavel — substituir tudo e
  // mais simples e mais barato que diferenciar.
  const { error: erroRulesDel } = await supabase.from('player_auto_catch_rules').delete().eq('user_id', userId)
  if (erroRulesDel) throw new Error(`Falha ao limpar regras: ${erroRulesDel.message}`)
  if (ruleRows.length > 0) {
    const { error } = await supabase.from('player_auto_catch_rules').insert(ruleRows)
    if (error) throw new Error(`Falha ao salvar regras: ${error.message}`)
  }

  idsNoBancoPorUsuario.set(userId, vivos)
}

// Ultima tentativa de gravar quando a pagina esta fechando.
//
// `savePlayerState` nao serve aqui: sao ~5 requests sequenciais e o navegador
// mata a pagina antes de terminarem. Este flush escreve UMA request, so a
// linha de `players` (ouro, treinador, hunt atual, perfStats) e com
// `keepalive: true`, que e o unico modo de uma request sobreviver ao unload.
// (`navigator.sendBeacon` nao serve: nao aceita header customizado, e o
// Supabase exige `Authorization`.)
//
// O que NAO cabe aqui — HP do POKE em campo, capturas recentes — fica por
// conta do debounce periodico. E uma perda possivel de poucos segundos no
// pior caso, o mesmo risco que o save a cada 10s do jogo vanilla ja tinha.
export function flushPlayerRowOnUnload(userId: string, state: GameStateData, accessToken: string): void {
  const url = import.meta.env.VITE_SUPABASE_URL
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY
  try {
    void fetch(`${url}/rest/v1/players?user_id=eq.${userId}`, {
      method: 'PATCH',
      keepalive: true,
      headers: {
        apikey: anon,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(gameStateToPlayerRow(userId, state)),
    })
  } catch {
    // Pagina fechando: nao ha como reportar nem repetir.
  }
}
