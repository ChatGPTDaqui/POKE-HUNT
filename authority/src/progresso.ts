// Carrega o progresso do jogador, simula, grava. E aqui que a autoridade mora.
import {
  buildMapWorld, stepWorld, simulateWorldSeconds, restoreRng,
  snapshotToGameState, gameStateToPlayerRow, gameStateToPokemonRows,
  gameStateToItemRows, gameStateToPokedexRows, gameStateToAutoCatchRuleRows,
  defaultGameStateData, MAPS, GRUPOS_DO_LANCE,
  OFFLINE_SIM_STEP_SECONDS, LIVE_SIM_STEP_SECONDS, recordBatch, LIMIAR_OFFLINE_SEGUNDOS, createEmptySummary,
  type GameStateData, type PlayerSnapshot, type OfflineSimSummary, type SalaAtiva,
  type ClimaTipo,
} from '#engine'
import {
  ErroHttp, selecionarTudo, selecionar, atualizar, atualizarRetornando, inserir, apagar, chamarRpc, type Config,
} from './db.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'
import { aplicarPiso, NENHUM_PISO, type ResultadoPiso } from './farmOffline.js'
import {
  reivindicarEntregas, aplicarEntregasNoEstado, devolverEntregas, type LinhaEntrega,
} from './entregas.js'

// `id=in.(...)` com centenas de UUIDs estoura o tamanho de URL que o gateway
// aceita — o fetch nem chega a ter resposta HTTP, so falha ("PostgREST
// inacessivel"), vira 502 e o jogador ve "falha ao falar com o banco". Medido
// em producao: conta real com 268+ pokemon_instances pra reconciliar num
// unico flush ja estourava. Contas de teste locais nunca tem POKE suficiente
// pra reproduzir. 100 ids por lote fica bem abaixo de qualquer limite comum
// de proxy (~8KB de request-line) mesmo com filtro/select junto na mesma URL.
const TAMANHO_LOTE_ID = 100
function porLotesDeId(ids: string[]): string[][] {
  const lotes: string[][] = []
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE_ID) lotes.push(ids.slice(i, i + TAMANHO_LOTE_ID))
  return lotes
}

// Chave usada em `hall_da_fama.conquista` pra "derrotou o Campeao Lance".
// Vivia em ranking.ts (rota de leitura, apagada na migracao RPC-everything) —
// so a constante sobrevive, e so aqui, unico lugar que ainda escreve nela.
const CONQUISTA_LANCE = 'boss_lance'

// Teto de quanto tempo um unico flush pode creditar. NAO e uma regra de
// balanceamento — e o limite que impede um relogio maluco (ou uma sessao
// esquecida aberta por uma semana) de virar uma simulacao de dias num request.
// O Farm Offline do cliente ja tinha um teto proprio pelo mesmo motivo.
export const MAX_SEGUNDOS_POR_FLUSH = 6 * 3600

/**
 * FARM OFFLINE PAUSADO — chave temporaria, ligada a pedido do usuario.
 *
 * Com `true`, o intervalo que caracteriza AUSENCIA (acima de
 * LIMIAR_OFFLINE_SEGUNDOS) deixa de ser simulado: o jogador que volta depois de
 * horas fora nao recebe nada por esse tempo. Jogo AO VIVO nao e afetado — os
 * flushes de 30 em 30 segundos continuam creditando normalmente, porque ficam
 * abaixo do limiar.
 *
 * O TEMPO PARADO E DESCARTADO, nao acumulado. `last_flush_at` continua avancando
 * pra agora no claim, entao retomar nao paga uma divida represada. E a mesma
 * regra que este arquivo ja aplica ao teto de 6h logo acima ("creditar depois
 * daria ao jogador o direito de acumular semanas paradas e sacar tudo de uma
 * vez") — e, na pratica, evita que religar o farm despeje 6 horas de recompensa
 * na conta de todo mundo no mesmo instante.
 *
 * A pausa vive NO SERVIDOR porque e ele quem simula: desde a Fase D o cliente
 * so pede o resumo (ver useOfflineFarmOnBoot). Uma chave no cliente nao pausaria
 * nada — so esconderia o relatorio de um farm que aconteceu.
 *
 * PARA RETOMAR: trocar para `false` e republicar a Edge Function
 * (`npm run edge:publicar`). Nao basta mergear — o deploy dela e manual.
 */
export const FARM_OFFLINE_PAUSADO = true

// LIMIAR_OFFLINE_SEGUNDOS vem do engine compartilhado (src/engine/simulation.ts)
// — o farm offline sem servidor (GameShell.tsx) precisa do MESMO limiar pra
// decidir `world.pessimista`, senao os dois caminhos discordam sobre o que
// conta como ausencia (PH-15).
//
// Acima disto, o intervalo e tratado como AUSENCIA (farm offline) e nao como
// jogo ao vivo. O cliente liquida de 30 em 30 segundos enquanto o jogador esta
// com o jogo aberto, entao 120s deixa folga confortavel pra um flush atrasado
// por rede sem ser confundido com ausencia.
//
// Isto e o que separa os dois regimes: offline roda em modo pessimista e ganha o
// piso de 50%; ao vivo roda normal e ALIMENTA a taxa que o piso usa de
// referencia. Ligar o modo pessimista em todo flush (como estava) penalizava
// quem estava jogando de verdade E destruia a propria referencia do piso.

export interface LinhaSessao {
  id: string
  user_id: string
  map_id: string
  poke_uid: string
  seed: number | string
  // Onde a sequencia de sorteio PAROU no ultimo flush. Distinto de `seed`, que e
  // so a origem imutavel da sessao — ver a migration
  // `sessao_guarda_o_estado_do_sorteio` pro bug que a ausencia disto causava.
  rng_state: number | string
  rng_draws: number | string
  last_flush_at: string
  simulated_seconds: number | string
  closed_at: string | null
  // Quando o flush em andamento comecou a simular/gravar; nulo fora disso. Ver
  // `aguardarFlushEmAndamento` — migration `marca_de_flush_em_andamento`.
  flushing_since: string | null
  // Progresso da sequencia do Campeao Lance. Mesma razao do `rng_state`: o
  // mundo e reconstruido a cada janela de flush, entao o que precisa
  // sobreviver e o PROGRESSO, nao o mundo. Sem isto a luta recomecava no
  // primeiro POKE dele a cada ~30s e era inganhavel — e agora ela e o portao
  // de metade do conteudo.
  sequence_index: number | string
  sequence_cleared: boolean
  // Sala atual da hunt. `sala_chave` nula = a sessao ainda nao entrou em
  // nenhuma sala (hunt sem salas, ou primeira janela).
  sala_indice: number | string
  sala_chave: string | null
  sala_abates: number | string
  ciclos: number | string
}

// Marca de flush mais velha que isto e tratada como lixo: a invocacao morreu no
// meio (limite de CPU da Edge Function, deploy, queda) e nunca limpou. Sem a
// expiracao, uma marca orfa faria TODO request seguinte esperar o tempo maximo.
const MARCA_DE_FLUSH_EXPIRA_MS = 30000
// Teto da espera. Estourar nao e erro: seguir em frente cai no CAS de
// `gravarEstado` (playerUpdatedAt) — que so falha (409) se AINDA houver
// colisao real, e nesse caso o chamador decide se tenta de novo.
const ESPERA_MAXIMA_POR_FLUSH_MS = 2500
const INTERVALO_DE_SONDAGEM_MS = 120

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Segura o request enquanto um flush do MESMO jogador ainda esta escrevendo.
 *
 * O CAS de `gravarEstado` (playerUpdatedAt) impede sobrescrita SILENCIOSA —
 * mas nao impede DESCARTE: `aplicarFlush` avanca `last_flush_at` no claim,
 * ANTES de simular, e so grava no fim. Se o CAS final perder a corrida (outro
 * request escreveu `players` no meio da simulacao), a excecao 409 propaga e a
 * simulacao inteira — ouro, XP, capturas de um intervalo real — e jogada fora
 * SEM que `last_flush_at` volte atras, entao aquele tempo nao credita em
 * flush nenhum. Esperar em vez de correr evita perder o trabalho: quem chega
 * depois so precisa ler o resultado do flush que ja estava terminando.
 */
export async function aguardarFlushEmAndamento(cfg: Config, userId: string): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_POR_FLUSH_MS
  for (;;) {
    const linhas = await selecionar<{ flushing_since: string }>(
      cfg,
      `game_sessions?user_id=eq.${userId}&flushing_since=not.is.null&select=flushing_since`,
    )
    const emAndamento = linhas.some(
      (l) => Date.now() - new Date(l.flushing_since).getTime() < MARCA_DE_FLUSH_EXPIRA_MS,
    )
    if (!emAndamento) return
    if (Date.now() >= limite) return
    await dormir(INTERVALO_DE_SONDAGEM_MS)
  }
}

/**
 * Estado carregado com a lista de POKEs que EXISTIAM no momento da leitura.
 *
 * O conjunto de ids nao e detalhe de implementacao: e o que permite `gravarEstado`
 * distinguir "este POKE sumiu do estado, apague a linha" de "esta linha nasceu
 * DEPOIS que eu li, nao e minha pra apagar". Sem isso, um snapshot velho apaga o
 * POKE que outro request acabou de comprar (ver o cabecalho de `gravarEstado`).
 */
export interface EstadoParaEscrita {
  estado: GameStateData
  pokeIdsNoLoad: Set<string>
  /**
   * As entregas do Mercado reivindicadas por ESTE request.
   *
   * Ficam expostas porque o claim e irreversivel do ponto de vista do banco: a
   * linha ja esta carimbada. Se a operacao abortar antes de gravar, elas TEM que
   * voltar pra fila — ver `devolverEntregas`. Quem usa `comEstadoParaEscrita`
   * ganha isso de graca.
   */
  entregas: LinhaEntrega[]
  /**
   * `players.updated_at` no momento desta leitura — CAS obrigatorio na
   * escrita final de `gravarEstado` (PH-5). Sem isso, duas acoes concorrentes
   * do mesmo jogador (duas abas, duplo clique, comprar+evoluir quase juntos)
   * leem o mesmo snapshot e a escrita que terminar por ultimo sobrescreve em
   * silencio o efeito da outra.
   */
  playerUpdatedAt: string
  /**
   * Se a mochila veio junto (ver `OpcoesDeLeitura`).
   *
   * `false` significa que `estado.bagPokes` NAO e a mochila do jogador: e so o
   * que esta janela adicionou a ela. Quem for mandar esse estado pro cliente
   * tem que avisar que ele e PARCIAL — senao o cliente troca a mochila inteira
   * por essa lista curta.
   */
  bagCarregada: boolean
  /**
   * As LINHAS CRUAS que este snapshot leu, guardadas pra `gravarEstado` poder
   * gravar so o que mudou.
   *
   * Sem baseline, todo flush reescrevia o conjunto inteiro: as linhas do time em
   * `pokemon_instances`, TODOS os itens, TODA a Pokedex e TODAS as regras de
   * auto-captura — 120 vezes por hora por jogador, mesmo numa janela em que o
   * jogador nao matou nada. E cada tabela dessas custa dois round-trips (o
   * select do diff de remocao e o upsert), o que fazia um flush parado custar o
   * mesmo que um flush cheio de abates.
   *
   * Guardado como linha, e nao como `PokeInstance`: `rowToPoke` recalcula campo
   * derivado na leitura (`unlockedAbilities`, `stats`) e e justamente esse
   * recalculo que atualiza a coluna quando o catalogo muda. Comparar objeto de
   * jogo congelaria essa atualizacao; comparar a linha ja mapeada nao.
   */
  linhasNoLoad: PlayerSnapshot
}

/**
 * Opcoes de leitura do snapshot.
 *
 * `comBag: false` e o que separa um flush de ~35 KB de um flush de MEGABYTES.
 *
 * O snapshot completo le `pokemon_instances` INTEIRA do jogador — inclusive a
 * mochila, que so cresce (auto-catch despeja tudo la e nada sai sozinho). Medido
 * em producao em 2026-08-17: uma conta com 5035 POKEs custava 3,23 MB POR
 * LEITURA, e o flush le a cada 30s (ou a cada 5s, quando `commitAgora` dispara
 * por level-up). Um unico jogador ativo queimava ~2 GB/h de egress; tres
 * jogadores estouraram 10x a cota do plano.
 *
 * A simulacao de hunt NAO precisa da mochila: o unico caminho que a toca durante
 * um flush e `addCapturedPoke`, que so faz `push`. Vender/soltar/mover POKE sao
 * RPC (`acoesRpc`/`mercadoRpc`), nao passam por aqui. Entao, no modo parcial:
 *
 *  - le so `location=eq.team` (5 linhas em vez de 5 mil);
 *  - `estado.bagPokes` comeca VAZIO e termina contendo apenas as capturas desta
 *    janela — que e exatamente o conjunto que precisa ser gravado;
 *  - `pokeIdsNoLoad` fica com os ids do time, entao o diff de remocao de
 *    `gravarEstado` nao alcanca (nem pode apagar) nenhuma linha da mochila.
 *
 * Quem PRECISA da mochila inteira: `/estado` (o cliente monta a tela da Mochila
 * com ela) e qualquer caminho que va decidir algo olhando POKE guardado.
 */
export interface OpcoesDeLeitura {
  comBag?: boolean
}

// Exportada (sem side-effect, ao contrario de `carregarEstadoParaEscrita`, que
// tambem reivindica entregas) pra permitir recarregar estado fresco no meio
// de uma escrita ja em andamento — usado pelo retry de `criarOrdem` (PH-8)
// quando o CAS final perde a corrida depois de um casamento real ja gravado.
export async function lerSnapshot(
  cfg: Config,
  userId: string,
  opcoes: OpcoesDeLeitura = {},
): Promise<EstadoParaEscrita> {
  const comBag = opcoes.comBag !== false
  // `location=eq.team` e nao `not.eq.bag`: linha em `market` (POKE anunciado)
  // tambem nao entra em `GameStateData` — `snapshotToGameState` so mapeia team
  // e bag —, entao ler market seria pagar por dado que o mapper joga fora.
  const filtroDeLocal = comBag ? '' : '&location=eq.team'
  const [player, pokemon, items, pokedex, autoCatchRules] = await Promise.all([
    selecionar<PlayerSnapshot['player']>(cfg, `players?user_id=eq.${userId}&select=*`),
    // `order=id` fixa a ordem entre as paginas de `selecionarTudo` (Range em
    // lotes de 1000). Sem isso o PostgREST nao garante posicao estavel entre
    // duas requests separadas — uma linha pode deslizar e ser lida duas vezes
    // (uma em cada pagina), gerando duplicata no array e um upsert que quebra
    // com "ON CONFLICT DO UPDATE cannot affect row a second time" (502).
    selecionarTudo<PlayerSnapshot['pokemon'][number]>(cfg, `pokemon_instances?user_id=eq.${userId}${filtroDeLocal}&select=*&order=id`),
    selecionarTudo<PlayerSnapshot['items'][number]>(cfg, `player_items?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['pokedex'][number]>(cfg, `player_pokedex?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['autoCatchRules'][number]>(cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=*`),
  ])
  if (!player[0]) throw new ErroHttp(404, 'jogador sem linha em `players`')
  const linhasNoLoad: PlayerSnapshot = { player: player[0], pokemon, items, pokedex, autoCatchRules }
  const estado = snapshotToGameState(linhasNoLoad, defaultGameStateData())
  return {
    estado,
    pokeIdsNoLoad: new Set(pokemon.map((p) => p.id)),
    entregas: [],
    playerUpdatedAt: player[0].updated_at,
    bagCarregada: comBag,
    linhasNoLoad,
  }
}

export async function carregarEstado(
  cfg: Config,
  userId: string,
  opcoes: OpcoesDeLeitura = {},
): Promise<GameStateData> {
  return (await lerSnapshot(cfg, userId, opcoes)).estado
}

/**
 * Como `carregarEstado`, mas tambem REIVINDICA as entregas pendentes do
 * Mercado e as soma ao estado devolvido.
 *
 * So pode ser usada por quem VAI GRAVAR o estado em seguida: a reivindicacao
 * carimba a linha como entregue, entao um caminho que carregue e nao grave
 * perderia o credito. Por isso `/sessao/abrir` (que so valida a intencao)
 * continua usando `carregarEstado` cru.
 */
export async function carregarEstadoParaEscrita(
  cfg: Config,
  userId: string,
  opcoes: OpcoesDeLeitura = {},
): Promise<EstadoParaEscrita> {
  const snapshot = await lerSnapshot(cfg, userId, opcoes)
  const entregas = await reivindicarEntregas(cfg, userId)
  if (entregas.length) aplicarEntregasNoEstado(snapshot.estado, entregas)
  snapshot.entregas = entregas
  return snapshot
}

/**
 * Carrega o estado pra escrita, roda `fn`, e DEVOLVE as entregas se `fn` abortar.
 *
 * Este embrulho existe porque a versao "carregue e lembre de tratar o erro" ja
 * falhou na pratica em TODOS os call sites de uma vez: nenhum tinha try/catch, e
 * qualquer 409 (o erro mais comum do jogo — ouro insuficiente, item travado,
 * POKE indisponivel) apagava o que o jogador tinha recebido no Mercado. Com o
 * embrulho, esquecer o tratamento deixa de ser possivel: quem carrega, carrega
 * por aqui.
 */
export async function comEstadoParaEscrita<T>(
  cfg: Config,
  userId: string,
  fn: (ctx: EstadoParaEscrita) => Promise<T>,
  // So o proprio flush passa `esperarFlush: false`: ele E o dono da marca,
  // entao esperaria por si mesmo ate o teto. E so ele passa `comBag: false` —
  // ver `OpcoesDeLeitura`.
  opcoes: { esperarFlush?: boolean } & OpcoesDeLeitura = {},
): Promise<T> {
  if (opcoes.esperarFlush !== false) await aguardarFlushEmAndamento(cfg, userId)
  const ctx = await carregarEstadoParaEscrita(cfg, userId, { comBag: opcoes.comBag })
  try {
    return await fn(ctx)
  } catch (erro) {
    await devolverEntregas(cfg, ctx.entregas)
    throw erro
  }
}

interface LinhaLocalizacao {
  id: string
  user_id: string
  location: string
}

/**
 * Grava o snapshot do jogador nas cinco tabelas.
 *
 * `pokeIdsNoLoad` (os ids que existiam quando ESTE estado foi lido) e o que
 * impede um snapshot velho de destruir POKE que mudou de dono no meio do
 * caminho. Duas regras, e as duas vieram de bug real de duplicacao/sumico:
 *
 *  - So APAGA linha que este snapshot conhecia. Uma linha criada depois da
 *    leitura (o POKE que o jogador acabou de comprar no Mercado, num request
 *    paralelo) nao esta no conjunto — antes ela caia no diff de remocao e o
 *    comprador pagava por um POKE que sumia.
 *  - So GRAVA linha que AINDA e deste jogador e ainda esta em team/bag. Sem
 *    isso, o upsert (que escreve `user_id` e `location` a partir do estado em
 *    memoria) ressuscitava o POKE recem-anunciado de volta pra mochila — com o
 *    anuncio ainda de pe, ou seja, o mesmo POKE em dois lugares — e revertia
 *    pro vendedor um POKE que o comprador ja tinha pago.
 */
// Mensagem do CAS de `gravarEstado` — exportada pra `aplicarFlush` poder
// identificar ESTE 409 especifico (colisao efemera, seguro retentar) e nao
// confundir com qualquer outro 409 do jogo (ouro insuficiente, item travado).
export const CONFLITO_ESCRITA_JOGADOR = 'outro comando em andamento — tente de novo'

/**
 * Duas linhas do banco dizem a mesma coisa?
 *
 * Compara so as chaves que a linha NOVA traz: o tipo `Insert` omite coluna com
 * default (`created_at`, `updated_at`), e exigir igualdade nelas faria toda
 * linha parecer diferente — que e exatamente o comportamento que este diff
 * existe pra evitar.
 *
 * Em caso de duvida o resultado e `false` (grava). Um falso "mudou" custa uma
 * escrita a mais; um falso "nao mudou" perde progresso.
 */
function linhaIgual(nova: Record<string, unknown>, atual: Record<string, unknown> | undefined): boolean {
  if (!atual) return false
  for (const [chave, valor] of Object.entries(nova)) {
    const antes = atual[chave]
    if (valor === antes) continue
    // `null` e `undefined` significam a mesma coisa aqui: o PostgREST devolve
    // `null` na coluna vazia e o mapper as vezes omite a chave.
    if (valor == null && antes == null) continue
    if (typeof valor === 'object' || typeof antes === 'object') {
      // Array (`unlocked_abilities`) e jsonb (`disabled_abilities`, configs de
      // auto). JSON.stringify e comparacao por FORMA, entao ordem de array e de
      // chave importa — pro dado deste jogo as duas sao estaveis (o mapper monta
      // sempre na mesma ordem), e onde nao forem o efeito e gravar a mais.
      if (JSON.stringify(valor) === JSON.stringify(antes)) continue
      return false
    }
    return false
  }
  return true
}

/**
 * Só as linhas que mudaram em relacao ao baseline — o que de fato precisa subir.
 *
 * POR QUE ISTO EXISTE (PH-90)
 *
 * O diff antes era so por TABELA: bastava uma linha diferente pra reescrever
 * todas. Como a Pokedex guarda contagem de abates, matar UM mob mudava uma
 * contagem e regravava a dex inteira — 104 linhas pra registrar 1 abate no
 * jogador com a dex maior. Medido em producao: 484.746 escritas em
 * `player_pokedex` contra 13.045 em `players`, a tabela principal. Mesma coisa
 * em `player_items`, onde cada pocao consumida reescrevia o inventario todo.
 *
 * `undefined` = nao ha baseline (chamador antigo, ou leitura que nao guardou as
 * linhas). Sem baseline nao da pra saber o que mudou, entao devolve tudo — o
 * mesmo fallback conservador de antes.
 *
 * Linha nova (sem par no baseline) entra: `linhaIgual(nova, undefined)` e
 * false. Linha REMOVIDA nao aparece aqui — quem cuida disso e o diff de
 * remocao de cada bloco, que compara contra o que o banco tem agora.
 */
function linhasQueMudaram<T extends Record<string, unknown>>(
  novas: T[],
  atuais: T[] | undefined,
  chaveDe: (linha: T) => string,
): T[] {
  if (!atuais) return novas
  const porChave = new Map(atuais.map((l) => [chaveDe(l), l]))
  return novas.filter((nova) => !linhaIgual(nova, porChave.get(chaveDe(nova))))
}

/** Nada mudou nesta tabela: mesmas chaves, e nenhuma linha diferente. */
function tabelaIntacta<T extends Record<string, unknown>>(
  novas: T[],
  atuais: T[] | undefined,
  chaveDe: (linha: T) => string,
): boolean {
  // `undefined` = nao ha baseline (chamador antigo, ou leitura que nao guardou
  // as linhas). Sem baseline nao ha como afirmar que nada mudou.
  if (!atuais) return false
  // Contagem diferente ja resolve: sobrou ou faltou linha em relacao ao load.
  if (novas.length !== atuais.length) return false
  return linhasQueMudaram(novas, atuais, chaveDe).length === 0
}

export async function gravarEstado(
  cfg: Config,
  userId: string,
  estado: GameStateData,
  pokeIdsNoLoad: Set<string>,
  playerUpdatedAtEsperado: string,
  /**
   * As linhas que a leitura viu (`EstadoParaEscrita.linhasNoLoad`). Ausente =
   * sem baseline, e ai o comportamento e o de sempre: reescreve tudo.
   */
  linhasNoLoad?: PlayerSnapshot,
): Promise<void> {
  // CAS na linha de `players`: sem isso, duas acoes concorrentes do mesmo
  // jogador (duas abas, duplo clique, comprar+evoluir quase juntos) leem o
  // mesmo snapshot e a escrita que terminar por ultimo sobrescreve em
  // silencio o efeito da outra — mesma classe de bug que PH-3 corrigiu no
  // Mercado, aqui na linha do jogador (PH-5). `updated_at` e mantido pelo
  // trigger `players_set_updated_at`: todo UPDATE bem sucedido (nosso ou de
  // outro request concorrente) sempre avanca a versao.
  //
  // PH-67: RPC em vez de PATCH cru. Um PATCH direto no REST nunca disputava o
  // `pg_advisory_xact_lock` que as RPCs de acao (comprar/vender/etc) passaram
  // a tomar — duas transacoes HTTP separadas, nenhuma pedindo o mesmo lock,
  // colisao efemera batendo 409 sem nenhuma das duas estar "errada". A RPC
  // `gravar_progresso` pega o MESMO lock por usuario antes do CAS, entao
  // agora as duas familias de escrita realmente se serializam.
  const resultado = await chamarRpc<{ ok: boolean; conflito?: boolean; updatedAt?: string }>(
    cfg,
    'gravar_progresso',
    {
      p_user_id: userId,
      p_patch: gameStateToPlayerRow(userId, estado),
      p_updated_at_esperado: playerUpdatedAtEsperado,
    },
  )
  if (!resultado.ok) throw new ErroHttp(409, CONFLITO_ESCRITA_JOGADOR)

  const linhasPoke = gameStateToPokemonRows(userId, estado)
  // JANELA SEM NADA PRA GRAVAR: sai antes dos dois round-trips (o select do
  // diff de remocao e o upsert). Isto e o caso COMUM num jogo idle — POKE
  // desmaiado, inimigo ainda nascendo, jogador parado no Hospital — e antes
  // custava exatamente o mesmo que uma janela cheia de abates.
  const pokeIntacto = tabelaIntacta(linhasPoke, linhasNoLoad?.pokemon, (l) => String(l.id))
  if (!pokeIntacto) {
    // `id` e opcional so no tipo `Insert` (coluna tem default no banco) — aqui
    // sempre vem preenchido, o proprio POKE que o gerou.
    const idsAgora = new Set(linhasPoke.map((l) => l.id).filter((id): id is string => id != null))
    // Uma leitura so, cobrindo o que eu conhecia e o que estou tentando gravar.
    const idsDeInteresse = [...new Set([...pokeIdsNoLoad, ...idsAgora])]
    const atuais: LinhaLocalizacao[] = []
    for (const lote of porLotesDeId(idsDeInteresse)) {
      atuais.push(
        ...(await selecionarTudo<LinhaLocalizacao>(
          cfg,
          `pokemon_instances?id=in.(${lote.join(',')})&select=id,user_id,location`,
        )),
      )
    }
    const porId = new Map(atuais.map((l) => [l.id, l]))
    const aindaMeu = (l: LinhaLocalizacao | undefined): boolean =>
      l != null && l.user_id === userId && (l.location === 'team' || l.location === 'bag')

    const remover = [...pokeIdsNoLoad].filter((id) => !idsAgora.has(id) && aindaMeu(porId.get(id)))
    for (const lote of porLotesDeId(remover)) {
      await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&id=in.(${lote.join(',')})`)
    }
    // Duas condicoes, e as duas importam. "Mudou" (PH-90) evita reescrever os
    // outros POKE da equipe porque um deles ganhou EXP. "Ainda e meu" evita
    // ressuscitar POKE que ja foi vendido/transferido entre a leitura e agora.
    // Linha sem par no banco e POKE novo (captura, inicial, compra) — grava.
    const gravarPoke = linhasQueMudaram(linhasPoke, linhasNoLoad?.pokemon, (l) => String(l.id))
      .filter((l) => {
        const atual = porId.get(String(l.id))
        return atual == null || aindaMeu(atual)
      })
    if (gravarPoke.length) await inserir(cfg, 'pokemon_instances', gravarPoke, { upsert: 'id' })
  }

  const linhasItens = gameStateToItemRows(userId, estado)
  // Mesmo diff de remocao que `pokemon_instances` acima. Sem ele, um item
  // consumido ate exatamente 0 (e nao travado) some de `estado.items` mas a
  // linha velha continua no banco — o upsert so toca as chaves presentes, nunca
  // apaga. Efeito real: 20 Stones gastas numa evolucao especial voltavam a 20 no
  // reload (evolucao especial de graca), e qualquer pocao/bola zerada
  // ressuscitava. `gameStateToItemRows` ja preserva itens travados com
  // quantidade 0, entao esses continuam na lista e nao sao removidos.
  if (!tabelaIntacta(linhasItens, linhasNoLoad?.items, (l) => String(l.item_id))) {
    const itemIdsAgora = new Set(linhasItens.map((l) => l.item_id))
    const itensNoBanco = await selecionarTudo<{ item_id: string }>(cfg, `player_items?user_id=eq.${userId}&select=item_id`)
    const removerItens = itensNoBanco.map((l) => l.item_id).filter((id) => !itemIdsAgora.has(id))
    for (const lote of porLotesDeId(removerItens)) {
      await apagar(cfg, `player_items?user_id=eq.${userId}&item_id=in.(${lote.join(',')})`)
    }
    const itensMudados = linhasQueMudaram(linhasItens, linhasNoLoad?.items, (l) => String(l.item_id))
    if (itensMudados.length) await inserir(cfg, 'player_items', itensMudados, { upsert: 'user_id,item_id' })
  }

  // Mesmo diff de remocao das duas tabelas acima. Sem ele, `reiniciarJogo`
  // apagava POKEs e itens mas a Pokedex sobrevivia inteira — a conta "zerada"
  // voltava com todos os abates registrados.
  const linhasDex = gameStateToPokedexRows(userId, estado)
  if (!tabelaIntacta(linhasDex, linhasNoLoad?.pokedex, (l) => String(l.species_id))) {
    const dexIdsAgora = new Set(linhasDex.map((l) => l.species_id))
    const dexNoBanco = await selecionarTudo<{ species_id: string }>(cfg, `player_pokedex?user_id=eq.${userId}&select=species_id`)
    const removerDex = dexNoBanco.map((l) => l.species_id).filter((id) => !dexIdsAgora.has(id))
    for (const lote of porLotesDeId(removerDex)) {
      await apagar(cfg, `player_pokedex?user_id=eq.${userId}&species_id=in.(${lote.join(',')})`)
    }
    const dexMudada = linhasQueMudaram(linhasDex, linhasNoLoad?.pokedex, (l) => String(l.species_id))
    if (dexMudada.length) await inserir(cfg, 'player_pokedex', dexMudada, { upsert: 'user_id,species_id' })
  }

  // `player_auto_catch_rules` NUNCA era gravada: `carregarEstado` a lia,
  // `gameStateToAutoCatchRuleRows` existia sem nenhum call site, e o mapper de
  // `players` nao carrega essas regras (as outras tres configs de auto sao JSONB
  // na propria linha, esta e tabela). Resultado: a regra "capturar Dratini com
  // Ultra Ball" era aceita pela acao `configurarAuto`, entrava na simulacao do
  // request corrente e desaparecia no proximo load — e sobrevivia a um reset.
  //
  // Upsert + diff de remocao (mesmo padrao das tres tabelas acima), e NAO
  // apaga-tudo-e-insere como era antes. A versao antiga dava 502 ("falha ao
  // falar com o banco") em toda concorrencia: a tabela tem UNIQUE
  // (user_id, species_id), e dois requests do mesmo jogador intercalando
  // DELETE/DELETE/INSERT/INSERT faziam o segundo INSERT violar a constraint.
  // Medido: com 8 regras configuradas, 33 de 48 GET /estado concorrentes
  // voltaram 502 (erro real: 'duplicate key value violates unique constraint
  // "player_auto_catch_rules_user_id_species_id_key"'). A identidade da regra
  // e o proprio par (especie, bola) — a chave estavel que faltava era
  // exatamente a constraint.
  const linhasAuto = gameStateToAutoCatchRuleRows(userId, estado)
  if (!tabelaIntacta(linhasAuto, linhasNoLoad?.autoCatchRules, (l) => String(l.species_id))) {
    const especiesAgora = new Set(linhasAuto.map((l) => l.species_id))
    const autoNoBanco = await selecionarTudo<{ species_id: string }>(
      cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=species_id`,
    )
    const removerAuto = autoNoBanco.map((l) => l.species_id).filter((id) => !especiesAgora.has(id))
    for (const lote of porLotesDeId(removerAuto)) {
      await apagar(cfg, `player_auto_catch_rules?user_id=eq.${userId}&species_id=in.(${lote.join(',')})`)
    }
    const autoMudadas = linhasQueMudaram(linhasAuto, linhasNoLoad?.autoCatchRules, (l) => String(l.species_id))
    if (autoMudadas.length) {
      await inserir(cfg, 'player_auto_catch_rules', autoMudadas, { upsert: 'user_id,species_id' })
    }
  }
}

export interface ResultadoFlush {
  segundosCreditados: number
  truncado: boolean
  resumo: OfflineSimSummary
  /**
   * O estado do jogador depois da janela — PARCIAL: `bagPokes` traz so o que
   * esta janela capturou, nao a mochila inteira (ver `OpcoesDeLeitura`). Quem
   * responde ao cliente tem que marcar `estadoParcial: true` junto.
   */
  estado: GameStateData
  piso: ResultadoPiso
  /** Sala em que a hunt parou. Nulo nas hunts sem salas. */
  sala: SalaAtiva | null
  /**
   * O clima de AMBIENTE da sala acima (PH-140) — o do LUGAR, nunca o de golpe.
   *
   * O cliente nao tem como derivar: a semente da sessao nao sai daqui. Sem
   * este campo ele mostraria um clima e o servidor cobraria o dano de outro.
   */
  clima: ClimaTipo | null
  /**
   * A cacada acabou sozinha e a sessao TEM que ser fechada pelo chamador.
   *
   * Hoje so ha um motivo: o POKE desmaiou e nao ha como reanima-lo (auto-revive
   * desligado, sem Revive na mochila, ou hunt BOSS, onde reanimar e proibido).
   *
   * Existe porque uma sessao nesse estado nao "renderia menos" — ela rendia ZERO
   * e mesmo assim continuava consumindo o relogio: cada flush creditava o
   * intervalo inteiro, simulava 0,1 segundo (o primeiro passo ja encontra o POKE
   * caido) e devolvia nada. Medido: tres flushes seguidos de 6h creditaram 6h
   * cada e renderam 0 de ouro. O jogador ficava dias sem farmar nada sem
   * nenhum aviso, e nao havia caminho automatico de volta — o POKE so levanta
   * curando no Hospital.
   */
  encerrada: 'desmaio' | null
}

/**
 * Outro request do mesmo jogador ja esta creditando este intervalo.
 *
 * Distinto de `null` (sessao insimulavel, tem que fechar): aqui nao ha nada
 * errado, so nao ha nada a fazer — quem perdeu a corrida nao simula, nao
 * carrega e NAO grava, pra nao sobrescrever o resultado de quem ganhou com um
 * estado lido antes dele.
 */
export const FLUSH_OCUPADO = 'ocupado' as const
export type ResultadoFlushOuOcupado = ResultadoFlush | null | typeof FLUSH_OCUPADO

// Tentativas antes de desistir e deixar o 409 subir de verdade. 3 e generoso
// pra colisao efemera (uma unica escrita concorrente): se ainda colidir depois
// disso, algo mais persistente esta acontecendo e vale reportar em vez de
// tentar pra sempre.
const MAX_TENTATIVAS_ESCRITA = 3

/**
 * Roda `fn` de novo se ela falhar por CAUSA do CAS de `gravarEstado`
 * (`CONFLITO_ESCRITA_JOGADOR`) — nunca por qualquer outro motivo.
 *
 * Exportada em vez de inline pra ser testavel isolada: a logica "quais erros
 * merecem retry e quantas vezes" e exatamente o tipo de decisao que uma
 * mudanca futura (ex: alguem adicionando outro 409 no meio) pode inverter sem
 * querer, e o sintoma so aparece como "as vezes perde progresso", nao como
 * teste vermelho.
 */
export async function comRetryDeColisao<T>(fn: () => Promise<T>): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    try {
      return await fn()
    } catch (erro) {
      const colisaoEfemera = erro instanceof ErroHttp
        && erro.status === 409 && erro.message === CONFLITO_ESCRITA_JOGADOR
      if (!colisaoEfemera || tentativa >= MAX_TENTATIVAS_ESCRITA) throw erro
    }
  }
}

/**
 * O coracao da Fase D: simula do ultimo flush ate agora e grava.
 *
 * Repare no que NAO entra aqui: nada vindo do cliente. Nem quanto tempo passou
 * (sai de `now()` menos `last_flush_at`), nem quantos kills houve, nem quanto
 * ouro. O cliente so declarou, na abertura da sessao, em qual hunt esta.
 */
export async function aplicarFlush(
  cfg: Config,
  userId: string,
  sessao: LinhaSessao,
  // So existe pra CLIENTE ANTIGO: uma aba aberta antes deste deploy sobrescreve
  // a mochila local com `estado.bagPokes` sem saber que ele e parcial, e ficaria
  // com a Mochila vazia na tela ate recarregar. Quem declara `parcial: true` no
  // corpo do flush recebe o estado enxuto; quem nao declara paga a leitura
  // inteira, como antes. Nada no banco muda entre os dois modos.
  opcoes: OpcoesDeLeitura = {},
): Promise<ResultadoFlushOuOcupado> {
  const agora = Date.now()
  const desde = new Date(sessao.last_flush_at).getTime()
  const bruto = (agora - desde) / 1000

  // Relogio pra tras (resync de NTP, maquina com hora errada) daria intervalo
  // negativo. Nao creditar e so re-ancorar — creditar seria pagar por tempo que
  // nao passou, e um `while` com segundos negativos nao termina.
  const segundos = Math.max(0, Math.min(bruto, MAX_SEGUNDOS_POR_FLUSH))
  const truncado = bruto > MAX_SEGUNDOS_POR_FLUSH

  // ---------------------------------------------------------------------
  // CLAIM ATOMICO DO INTERVALO — a correcao do bug de DUPLICACAO DE POKE.
  //
  // O cliente tem varios gatilhos de flush (timer de 30s, toda `/acao`, toda
  // rota de Mercado, `visibilitychange`, e o commit forcado de level-up), entao
  // dois requests do mesmo jogador simulando o MESMO intervalo nao e caso raro:
  // e o caso normal quando o jogador clica em algo perto do tique dos 30s.
  //
  // Ouro nao denunciava porque e gravado como valor ABSOLUTO — os dois flushes
  // convergiam pro mesmo total. Ja uma CAPTURA cria linha nova com `uid` de
  // `crypto.randomUUID()`, que fica FORA da sequencia semeada de proposito (ver
  // core/rng.ts): os dois flushes sorteavam o mesmo POKE e gravavam com ids
  // DIFERENTES. Se o diff de remocao do segundo lesse o banco antes do insert do
  // primeiro, as duas linhas sobreviviam — o mesmo POKE capturado duas vezes.
  //
  // `last_flush_at=eq.<valor lido>` no filtro e o que serializa: quem escreve
  // primeiro move a ancora e o outro nao encontra linha, entao desiste antes de
  // carregar estado, reivindicar entrega ou simular qualquer coisa.
  //
  // `flushing_since` entra JUNTO com o claim, na mesma escrita: o claim diz
  // "este intervalo e meu" e a marca diz "e eu ainda estou escrevendo". Sem
  // ela, um GET /estado (pagina recarregando) ou um /acao que caia durante a
  // simulacao lia o estado no meio dela e regravava depois, e o CAS de
  // `gravarEstado` (playerUpdatedAt) so detecta a colisao — nao evita que ELE
  // seja quem perde e joga a simulacao fora. `aguardarFlushEmAndamento` (em
  // `comEstadoParaEscrita`) e quem usa esta marca pra esperar em vez de correr.
  const [reivindicada] = await atualizarRetornando<LinhaSessao>(
    cfg,
    `game_sessions?id=eq.${sessao.id}&closed_at=is.null`
    + `&last_flush_at=eq.${encodeURIComponent(sessao.last_flush_at)}`,
    { last_flush_at: new Date(agora).toISOString(), flushing_since: new Date(agora).toISOString() },
  )
  if (!reivindicada) return FLUSH_OCUPADO

  try {
    // Toda saida daqui pra baixo que NAO grave (POKE sumiu, hunt sumiu, erro de
    // simulacao) tem que devolver as entregas reivindicadas — senao o ouro de uma
    // venda no Mercado some porque o jogador tirou o POKE da equipe.
    //
    // RETRY no CAS de `gravarEstado` (BUG REAL: sequencia do Campeao Lance
    // nunca fechava mesmo com time forte o bastante). `esperarFlush:false`
    // acima cobre flush-contra-flush (via `flushing_since`), mas nao cobre
    // flush-contra-QUALQUER-OUTRA-escrita em `players` (config de auto,
    // comprar, vender — RPC-everything, que nao conhece essa marca). Qualquer
    // uma delas bate `updated_at` e o CAS final de `gravarEstado` falha com
    // 409, mesmo sem conflito de DADO nenhum (colunas diferentes). Sem retry,
    // isso jogava fora a JANELA INTEIRA — inclusive `sequenceIndex`/
    // `sequenceCleared`, que so persistem no mesmo golpe de escrita — e o
    // cliente (que trata qualquer 409 de flush como "sessao sumiu") encerrava
    // a cacada. Pra quem estava terminando de vencer o Lance, era voltar pro
    // encontro 0 sem aviso nenhum do motivo.
    //
    // `sessao`/`janela` sao reusados sem mudanca: nada no banco (rng_state,
    // sequence_index) foi escrito na tentativa que falhou, entao reler o
    // jogador e rodar `simularSessao` de novo e seguro e idempotente.
    return await comRetryDeColisao(() =>
      // `comBag: false`: a simulacao de hunt so ADICIONA POKE na mochila
      // (`addCapturedPoke`), nunca le nem remove — ver `OpcoesDeLeitura`. Ler a
      // mochila inteira aqui era o que fazia um flush custar megabytes.
      comEstadoParaEscrita(cfg, userId, async (ctx) => {
        const resultado = await simularSessao(
          cfg, userId, sessao, ctx.estado, ctx.pokeIdsNoLoad, ctx.playerUpdatedAt, { agora, segundos, truncado },
          ctx.linhasNoLoad,
        )
        // `null` = sessao insimulavel; sai SEM gravar, entao as entregas voltam pra
        // fila (o `catch` do embrulho so cobre excecao, e aqui nao ha excecao).
        if (!resultado) await devolverEntregas(cfg, ctx.entregas)
        return resultado
      }, { esperarFlush: false, comBag: opcoes.comBag === true }))
  } finally {
    // No `finally` porque uma marca que sobrevive a um erro (inclusive o 409
    // do proprio CAS de gravarEstado, se AINDA colidir depois da espera) faria
    // todo request seguinte esperar o teto ate ela expirar sozinha.
    await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, { flushing_since: null })
  }
}

async function simularSessao(
  cfg: Config,
  userId: string,
  sessao: LinhaSessao,
  dados: GameStateData,
  pokeIdsNoLoad: Set<string>,
  playerUpdatedAt: string,
  janela: { agora: number; segundos: number; truncado: boolean },
  // Baseline pro diff de escrita de `gravarEstado` — ver `EstadoParaEscrita.linhasNoLoad`.
  linhasNoLoad: PlayerSnapshot,
): Promise<ResultadoFlush | null> {
  const { agora, segundos, truncado } = janela
  const { store, dados: estado } = criarEstadoDoJogador(dados)
  // Copia (nao referencia): a simulacao muta `estado.unlockedContinents` em
  // lugar quando o jogador limpa a sequencia do Campeao Lance, e o Hall da
  // Fama precisa comparar o antes com o depois.
  const continentesAntes = new Set(estado.unlockedContinents)

  // POKE da sessao nao existe mais (reset de conta, venda, liberacao). Isto NAO
  // e erro do jogador e nao pode virar 409: a sessao e insimulavel pra sempre, e
  // como todo request passa por um flush obrigatorio, um 409 aqui travava a conta
  // inteira — inclusive "escolher o inicial" depois de um `reiniciarJogo`. Devolve
  // null pro chamador FECHAR a sessao e seguir.
  const ativo = estado.team.find((p) => p.uid === sessao.poke_uid)
  if (!ativo) return null
  store.setActiveIndex(estado.team.indexOf(ativo))

  // Mesma classe de problema, outra causa: a hunt da sessao pode ter deixado de
  // existir entre a abertura e o flush (rebalanceamento que recorta os pools,
  // sync que renomeia). `buildMapWorld` estouraria, e como TODO request passa
  // por um flush obrigatorio, isso travaria a conta inteira em 502 — sem nada
  // que o jogador pudesse fazer. Devolver null fecha a sessao e segue.
  if (!MAPS[sessao.map_id]) return null

  // A sequencia RETOMA de onde o flush anterior parou. O cliente nunca escolhe a
  // semente: e ela que decide shiny, IV, raridade e crit (ver core/rng.ts).
  //
  // Retomar (em vez de `createRng(sessao.seed)`) e o que impede o jogo inteiro de
  // virar um loop: o cliente liquida de 30 em 30 segundos, entao recomecar da
  // semente fazia todo flush repetir os MESMOS inimigos, niveis, IVs, raridade e
  // shiny. Na mochila isso aparecia como a mesma especie chegando de novo a cada
  // meio minuto. Ver a migration `sessao_guarda_o_estado_do_sorteio`.
  const rng = restoreRng(Number(sessao.rng_state), Number(sessao.rng_draws))
  const world = buildMapWorld(
    sessao.map_id,
    ativo,
    // `seed` alem do `rng` (PH-140): o clima de AMBIENTE e derivado dela, e nao
    // guardado. Passar a semente REAL da sessao e o que faz o servidor simular
    // sob o mesmo clima que a tela do jogador mostrou — com um valor fixo aqui,
    // o dano de areia/granizo fecharia diferente dos dois lados.
    { rng, seed: Number(sessao.seed), counters: { entity: 1, effect: 1, pendingHit: 1 } },
    // Progresso que atravessa a janela. Mesma familia do `rng_state`: o mundo e
    // reconstruido, o progresso nao pode ser.
    {
      sequenceIndex: Number(sessao.sequence_index ?? 0),
      sequenceCleared: Boolean(sessao.sequence_cleared),
      sala: sessao.sala_chave
        ? {
            indice: Number(sessao.sala_indice ?? 0),
            chave: sessao.sala_chave,
            abates: Number(sessao.sala_abates ?? 0),
            ciclos: Number(sessao.ciclos ?? 0),
          }
        : null,
    },
  )
  // Pior caso SO quando o intervalo caracteriza ausencia — ver
  // LIMIAR_OFFLINE_SEGUNDOS. Jogo ao vivo resolve o combate normalmente.
  const offline = segundos > LIMIAR_OFFLINE_SEGUNDOS
  world.pessimista = offline

  // Farm offline pausado: o intervalo de AUSENCIA nao roda. Sai um resumo
  // vazio, e o `last_flush_at` ja avancou pra agora la no claim — o tempo
  // parado e descartado, nao represado. Ver FARM_OFFLINE_PAUSADO.
  //
  // Cai aqui DEPOIS de `buildMapWorld` de proposito: o mundo precisa existir
  // pra o `rng_state` ser gravado adiante e a sequencia de sorteio nao voltar
  // pro comeco quando o farm for religado.
  const pausado = offline && FARM_OFFLINE_PAUSADO

  // PH-37: fora do regime offline, o passo precisa bater com o do client ao
  // vivo (useGameLoop.ts, 1/60s) — senao o resim do servidor e o client
  // desalinham a sequencia de sorteios de RNG so pelo tamanho do passo, e o
  // level-up do POKE que o client mostrou nunca e confirmado. Ver
  // LIVE_SIM_STEP_SECONDS em simulation.ts pro raciocinio completo.
  const resumo = pausado
    ? createEmptySummary()
    : simulateWorldSeconds({
      world,
      gameState: store,
      seconds: segundos,
      stepSeconds: offline ? OFFLINE_SIM_STEP_SECONDS : LIVE_SIM_STEP_SECONDS,
      stepFn: (w, dt, opts) => stepWorld(w, dt, store, opts),
    })

  // O piso so existe pra impedir que o pior caso degenere pra zero — nao tem o
  // que fazer num flush de jogo ao vivo.
  // O piso do farm offline (nunca menos que 50% da taxa online medida) tambem
  // sai de cena enquanto pausado: ele existe pra impedir que o PIOR CASO da
  // simulacao degenere pra zero. Com a simulacao desligada, zero e o resultado
  // pretendido — aplicar o piso pagaria justamente o que a pausa quer nao pagar.
  const piso = offline && !pausado ? aplicarPiso(store, estado, resumo, agora) : NENHUM_PISO

  // A taxa "online medida" que o piso usa de referencia so pode vir de jogo ao
  // vivo. Sem isto ela nunca sairia do zero: `recordKill` vive dentro de um
  // `if (!silent)` no motor, e o servidor simula SEMPRE em silencio — entao o
  // piso ficava permanentemente reprovado pela guarda de amostra minima. Mesmo
  // remedio que o catch-up de aba oculta ja usava no cliente (recordBatch).
  //
  // Alimentar tambem com o resultado offline tornaria a referencia
  // auto-referente: a taxa passaria a incluir os proprios periodos ausentes.
  if (!offline) {
    recordBatch(store, { gold: resumo.gold, xp: resumo.xp, mobs: resumo.kills, shinys: resumo.shinySeen })
  }

  // A cacada acabou com o POKE no chao: o jogador NAO esta mais numa hunt.
  // Zerar aqui (e nao so na coluna, depois) e o que mantem banco, resposta e
  // cliente contando a mesma historia — o cliente sobrescreve o estado local com
  // esta resposta, entao um `currentMapId` sobrevivente o deixaria desenhando
  // uma cacada que o servidor ja encerrou.
  estado.currentMapId = resumo.stoppedEarly ? null : sessao.map_id
  await gravarEstado(cfg, userId, estado, pokeIdsNoLoad, playerUpdatedAt, linhasNoLoad)

  // Hall da Fama: a unica coisa que libera os grupos do Lance e limpar a
  // sequencia dele (`unlocksContinentOnClear`, ver data/nightmareMaps.ts). O
  // QUANDO nao cabia em `unlocked_continents`, e "os primeiros a completar" e
  // uma ordem por tempo — dai a tabela propria.
  //
  // Registrado aqui, e nao no motor, de proposito: o motor roda igual no
  // cliente, e o cliente nao pode escrever conquista. `on_conflict` faz a
  // segunda vez ser no-op, entao a data guardada e sempre a da PRIMEIRA vez.
  const ganhouGrupoDoLance = GRUPOS_DO_LANCE.some(
    (g) => !continentesAntes.has(g) && estado.unlockedContinents.includes(g),
  )
  if (ganhouGrupoDoLance) {
    await inserir(cfg, 'hall_da_fama', {
      user_id: userId,
      conquista: CONQUISTA_LANCE,
    }, { upsert: 'user_id,conquista' })
  }

  // `last_flush_at` ja avancou pra AGORA no claim la em cima — e nao pra
  // `desde + segundos`: o tempo descartado pelo teto foi tempo real que passou,
  // e credita-lo depois daria ao jogador o direito de acumular semanas paradas e
  // sacar tudo de uma vez.
  await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, {
    // `resumo.simulatedSeconds` e nao `segundos`: os dois so divergem quando a
    // simulacao PAROU antes do fim do intervalo (POKE caido), e ai creditar o
    // intervalo cheio mentiria no "tempo de jogo" do Perfil — na medicao que
    // originou este fix, tres flushes de 6h somaram 30 horas de tempo jogado
    // pra 6 horas de simulacao real.
    simulated_seconds: Number(sessao.simulated_seconds) + resumo.simulatedSeconds,
    // Grava onde a sequencia parou. `world.rng` e o MESMO objeto passado pro
    // `buildMapWorld` — `nextFloat` muta em lugar de proposito (ver core/rng.ts),
    // entao ler daqui pega o estado ja avancado pela simulacao inteira.
    rng_state: world.rng.state,
    rng_draws: world.rng.draws,
    // BUG REAL (achado com o Campeao Lance): `poke_uid` so era gravado na
    // ABERTURA da sessao (`/sessao/abrir`) e nunca mais mudava.
    // `autoSwitchTeamOnFaint` troca `world.player.poke` dentro da simulacao
    // (cada POKE do Lance derrotado avanca pro proximo membro vivo da
    // equipe) — mas a linha 579 usa `sessao.poke_uid`, nao
    // `estado.activeIndex`, pra decidir QUEM simular. Como a luta contra o
    // Lance raramente cabe numa unica janela de ~30s, a janela SEGUINTE
    // reconstruia o mundo com o POKE ORIGINAL da abertura — que, se ja tinha
    // desmaiado (o caso comum), chegava com HP 0 e `fainted` verdadeiro. Sem
    // um evento de desmaio FRESCO nesta janela pra disparar
    // `autoSwitchTeamOnFaint`, a simulacao so via um cadaver parado em campo:
    // sessao encerrada por "desmaio sem revive" (kick pro Hospital com o
    // resto da equipe intacta e viva), e nunca mais avancava a sequencia —
    // como se o Lance fosse inganhavel a partir da primeira troca de POKE.
    // Gravar aqui o UID de quem estava de fato em campo no fim desta janela
    // fecha o ciclo: a proxima reconstroi exatamente de onde a luta parou.
    poke_uid: world.player!.poke.uid,
    sequence_index: world.sequenceIndex,
    sequence_cleared: world.sequenceCleared,
    sala_indice: world.sala?.indice ?? 0,
    sala_chave: world.sala?.chave ?? null,
    sala_abates: world.sala?.abates ?? 0,
    ciclos: world.sala?.ciclos ?? 0,
  })

  return {
    segundosCreditados: segundos,
    truncado,
    resumo,
    estado,
    piso,
    // A sala AUTORITATIVA. O cliente roda a propria simulacao como predicao e
    // sorteia a propria sala; sem isto a sala mostrada seria o palpite dele,
    // que diverge do que de fato decidiu o pool e o loot creditados.
    sala: world.sala,
    // `climaAmbiente` e nao `clima`: o efetivo pode estar sob um Rain Dance que
    // a simulacao desta janela lancou, e isso e estado de combate, nao
    // propriedade da sala. Mandar o efetivo faria o cliente tratar um golpe
    // passageiro como o tempo do lugar.
    clima: world.climaAmbiente?.tipo ?? null,
    encerrada: resumo.stoppedEarly ? 'desmaio' : null,
  }
}
