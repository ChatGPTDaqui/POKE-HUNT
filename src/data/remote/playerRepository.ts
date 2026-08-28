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
  gameStateToEspecialidadeRows,
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
  const [player, pokemon, items, pokedex, autoCatchRules, missoesReivindicadas, especialidades] = await Promise.all([
    supabase.from('players').select('*').eq('user_id', userId).maybeSingle(),
    // SO A EQUIPE (PH-182). O boot trazia `pokemon_instances` inteira: medido em
    // producao no jogador mais pesado, 922 POKEs pra jogar com 2 — 76.855 B
    // gzipados contra 477 B lendo so a equipe, 161x.
    //
    // E nao era so custo. A consulta NAO paginava, e o PostgREST corta em 1000
    // linhas com 200 OK e sem erro nenhum (`Content-Range: 0-999/1054`, medido).
    // Faltavam 78 POKEs pro boot desse jogador comecar a perder linha em
    // silencio — o mesmo defeito que a PH-99 ja tinha corrigido na vitrine do
    // Mercado.
    //
    // A reserva vem do caminho paginado que ja existe (`mochilaRemota.ts`,
    // `.range()` em laco com conferencia do total declarado), quando a Mochila
    // abre. `BagMenu` ja assumia isso no comentario dele; era o boot que ainda
    // nao tinha acompanhado.
    //
    // `order('team_slot')` pelo mesmo motivo de `refetchEquipeInteira`: o resto
    // do app assume `team[0]` = ativo, e sem ordem o Postgres devolve em ordem
    // arbitraria.
    supabase.from('pokemon_instances').select('*').eq('user_id', userId)
      .eq('location', 'team').order('team_slot', { ascending: true }),
    supabase.from('player_items').select('*').eq('user_id', userId),
    supabase.from('player_pokedex').select('*').eq('user_id', userId),
    supabase.from('player_auto_catch_rules').select('*').eq('user_id', userId),
    supabase.from('player_missoes_reivindicadas').select('*').eq('user_id', userId),
    supabase.from('player_especialidades').select('*').eq('user_id', userId),
  ])

  const erro = player.error ?? pokemon.error ?? items.error ?? pokedex.error ?? autoCatchRules.error
    ?? missoesReivindicadas.error ?? especialidades.error
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
    especialidades: especialidades.data ?? [],
  }

  // Ancora o diff de exclusao do proximo save (ver `definirIdsConhecidos`).
  // So EQUIPE, porque so equipe foi lida — e e essa correspondencia que o resto
  // desta secao existe pra manter.
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
//
// DIVIDIDO EM EQUIPE E RESERVA DESDE A PH-182, e essa divisao e a coisa mais
// importante deste arquivo.
//
// Ate a PH-182 o boot lia TUDO, entao "o que o banco tem" e "o que o estado
// local tem" eram a mesma coisa por construcao, e o diff podia comparar contra
// o estado inteiro sem pensar. Com o boot lendo so a equipe isso deixa de ser
// verdade: `state.bagPokes` nasce VAZIO e so e preenchido quando a Mochila
// abre.
//
// Diferenciar 922 ids conhecidos contra um estado que so tem 2 daria
// `removidos = 920` e o save APAGARIA a colecao do jogador. Nao e hipotese: e o
// risco que a propria issue nomeia, e o caminho que chega la ja existe —
// `aplicarEstadoDoServidor` zera `bagPokes` num flush parcial quando a mochila
// nao esta carregada (autoridade.ts).
//
// A regra, entao, e uma so e vale nos dois sentidos:
//
//   um id so pode entrar no diff de exclusao se o estado local for
//   AUTORITATIVO sobre o conjunto onde ele vive.
//
// O cliente e sempre autoritativo sobre a EQUIPE (o boot a le inteira, sao no
// maximo 6 linhas). Sobre a RESERVA ele so e autoritativo depois da leitura
// paginada — e por isso `reserva` so e preenchida por `acrescentarIdsDaReserva`
// e e esvaziada por `esquecerIdsDaReserva` no instante em que o estado perde a
// mochila.
interface IdsConhecidos {
  equipe: Set<string>
  /** `null` = a reserva NAO foi lida nesta sessao. Diferente de "lida e vazia". */
  reserva: Set<string> | null
}
const idsNoBancoPorUsuario = new Map<string, IdsConhecidos>()

/**
 * Quantos POKEs um unico save pode apagar antes de a escrita ser recusada.
 *
 * 12 e generoso pro caso real (liberar/vender um de cada vez, e o time cabe em
 * 6) e apertado o bastante pra pegar um descompasso de dominio, que apaga
 * centenas. Nao e um limite de negocio — e um detector de bug.
 */
const TETO_DE_REMOCAO_POR_SAVE = 12

function conhecidos(userId: string): IdsConhecidos {
  let atual = idsNoBancoPorUsuario.get(userId)
  if (!atual) {
    atual = { equipe: new Set(), reserva: null }
    idsNoBancoPorUsuario.set(userId, atual)
  }
  return atual
}

/**
 * Registra os ids da RESERVA que a leitura paginada trouxe.
 *
 * Chamado por `carregarMochilaRemota` — e nao pela tela — porque e la que os
 * dois fatos existem juntos: o `userId` da sessao e a lista exata que entrou no
 * estado. Registrar na tela deixaria os dois podendo divergir.
 */
export function acrescentarIdsDaReserva(userId: string, ids: Iterable<string>): void {
  conhecidos(userId).reserva = new Set(ids)
}

/**
 * O estado local deixou de representar a reserva — esquece os ids dela.
 *
 * A partir daqui o diff de exclusao volta a olhar so a equipe, que e o unico
 * conjunto sobre o qual o cliente continua autoritativo. Sem esta chamada, o
 * proximo save veria 920 ids conhecidos contra um `bagPokes` vazio.
 *
 * Sem `userId` de proposito: quem esvazia a mochila (`mochilaStore.invalidar`,
 * o ramo parcial de `aplicarEstadoDoServidor`) nao tem o id do usuario em maos,
 * e pedir que tenha so pra esquecer algo seria plumbing que pode ser esquecido.
 * Esquecer de MAIS e sempre seguro aqui: o custo e um POKE vendido offline
 * demorar mais pra sumir do banco; o custo de esquecer de menos e apagar o
 * acervo.
 */
export function esquecerIdsDaReserva(): void {
  for (const entrada of idsNoBancoPorUsuario.values()) entrada.reserva = null
}

/**
 * Chamado pelo load e por quem importa um save, pra ancorar o diff.
 *
 * Ancora a EQUIPE e ZERA o que se sabia da reserva: quem chama acabou de
 * substituir o estado local, e o `bagPokes` desse estado novo nao veio de
 * leitura paginada nenhuma. Manter a reserva antiga aqui seria justamente o
 * descompasso que apaga acervo.
 */
export function definirIdsConhecidos(userId: string, ids: Iterable<string>): void {
  idsNoBancoPorUsuario.set(userId, { equipe: new Set(ids), reserva: null })
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
  const especialidadeRows = gameStateToEspecialidadeRows(userId, state)

  const conhecido = idsNoBancoPorUsuario.get(userId)
  const vivos = new Set(pokemonRows.map((r) => r.id as string))
  // O DOMINIO DO DIFF (PH-182): equipe sempre, reserva so se ela foi lida.
  // Ver a nota longa em `idsNoBancoPorUsuario` — com a reserva NAO lida,
  // `state.bagPokes` e vazio por construcao e diferenciar contra ele apagaria a
  // colecao inteira.
  const dominio = [
    ...(conhecido?.equipe ?? []),
    ...(conhecido?.reserva ?? []),
  ]
  const removidos = dominio.filter((id) => !vivos.has(id))

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
    // REDE DE SEGURANCA (PH-182), e ela existe porque o custo de errar aqui e
    // a colecao do jogador. O diff acima esta certo pelo raciocinio; esta
    // guarda esta aqui pro dia em que alguem acrescentar um quarto caminho que
    // esvazia `bagPokes` e esquecer de chamar `esquecerIdsDaReserva`.
    //
    // Remocao legitima por este caminho e miuda: um POKE liberado, um vendido.
    // Venda em lote passa por RPC, que apaga no servidor — nao chega aqui. Uma
    // remocao de dezenas de linhas num save de rotina nao e o jogador agindo, e
    // um descompasso de dominio; abortar deixa o dado no lugar e o erro
    // visivel, que e recuperavel, em vez de silenciosamente correto-e-vazio.
    if (removidos.length > TETO_DE_REMOCAO_POR_SAVE) {
      throw new Error(
        `Save abortado: ${removidos.length} POKEs sumiriam de uma vez (teto ${TETO_DE_REMOCAO_POR_SAVE}). `
        + 'Isso e descompasso entre o estado local e o que foi lido do banco, nao acao do jogador — '
        + 'ver idsNoBancoPorUsuario em playerRepository.ts (PH-182).',
      )
    }
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

  if (especialidadeRows.length > 0) {
    const { error } = await supabase.from('player_especialidades').upsert(especialidadeRows, { onConflict: 'user_id,tipo' })
    if (error) throw new Error(`Falha ao salvar especialidades: ${error.message}`)
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

  // O que o banco tem agora e o que acabou de ser escrito — mas o DOMINIO nao
  // muda aqui (PH-182). Um save nao LE nada, entao ele nao pode promover a
  // reserva de "nao lida" pra "lida": se ela seguia desconhecida, segue.
  idsNoBancoPorUsuario.set(userId, {
    equipe: new Set(state.team.map((p) => p.uid)),
    reserva: conhecido?.reserva ? new Set(state.bagPokes.map((p) => p.uid)) : null,
  })
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
