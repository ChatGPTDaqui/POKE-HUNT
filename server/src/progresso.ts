// Carrega o progresso do jogador, simula, grava. E aqui que a autoridade mora.
import {
  buildMapWorld, stepWorld, simulateWorldSeconds, restoreRng,
  snapshotToGameState, gameStateToPlayerRow, gameStateToPokemonRows,
  gameStateToItemRows, gameStateToPokedexRows, gameStateToAutoCatchRuleRows,
  defaultGameStateData, MAPS, GRUPOS_DO_LANCE,
  OFFLINE_SIM_STEP_SECONDS, recordBatch,
  type GameStateData, type PlayerSnapshot, type OfflineSimSummary, type SalaAtiva,
} from '#engine'
import {
  ErroHttp, selecionarTudo, selecionar, atualizar, atualizarRetornando, inserir, apagar, type Config,
} from './db.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'
import { aplicarPiso, NENHUM_PISO, type ResultadoPiso } from './farmOffline.js'
import {
  reivindicarEntregas, aplicarEntregasNoEstado, devolverEntregas, type LinhaEntrega,
} from './entregas.js'
import { CONQUISTA_LANCE } from './ranking.js'

// Teto de quanto tempo um unico flush pode creditar. NAO e uma regra de
// balanceamento — e o limite que impede um relogio maluco (ou uma sessao
// esquecida aberta por uma semana) de virar uma simulacao de dias num request.
// O Farm Offline do cliente ja tinha um teto proprio pelo mesmo motivo.
export const MAX_SEGUNDOS_POR_FLUSH = 6 * 3600

// Acima disto, o intervalo e tratado como AUSENCIA (farm offline) e nao como
// jogo ao vivo. O cliente liquida de 30 em 30 segundos enquanto o jogador esta
// com o jogo aberto, entao 120s deixa folga confortavel pra um flush atrasado
// por rede sem ser confundido com ausencia.
//
// Isto e o que separa os dois regimes: offline roda em modo pessimista e ganha o
// piso de 50%; ao vivo roda normal e ALIMENTA a taxa que o piso usa de
// referencia. Ligar o modo pessimista em todo flush (como estava) penalizava
// quem estava jogando de verdade E destruia a propria referencia do piso.
export const LIMIAR_OFFLINE_SEGUNDOS = 120

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
  // `aguardarFlushEmAndamento` — e o sinal que impede o resto do jogo de gravar
  // um snapshot de ANTES do flush por cima do resultado dele.
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
// Folga larga de proposito: o pior caso medido (6h de farm offline numa
// invocacao) leva ~1,6s.
const MARCA_DE_FLUSH_EXPIRA_MS = 30000
// Teto da espera. Estourar nao e erro: seguir em frente devolve o
// comportamento antigo (a corrida), enquanto travar o request seria trocar uma
// perda rara por uma falha certa.
const ESPERA_MAXIMA_POR_FLUSH_MS = 2500
const INTERVALO_DE_SONDAGEM_MS = 120

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Segura o request enquanto um flush do MESMO jogador ainda esta escrevendo.
 *
 * Sem isto, ler o estado durante um flush e depois grava-lo apaga o que o flush
 * creditou — e o intervalo ja foi consumido pelo claim, entao nao volta em flush
 * nenhum. Ver a migration `20260809190000_marca_de_flush_em_andamento` pros
 * numeros medidos.
 *
 * E uma espera, e nao um erro, porque o outro request nao esta fazendo nada de
 * errado: ele vai terminar em milissegundos e a resposta correta e usar o
 * resultado DELE como ponto de partida.
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
}

async function lerSnapshot(cfg: Config, userId: string): Promise<EstadoParaEscrita> {
  const [player, pokemon, items, pokedex, autoCatchRules] = await Promise.all([
    selecionar<PlayerSnapshot['player']>(cfg, `players?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['pokemon'][number]>(cfg, `pokemon_instances?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['items'][number]>(cfg, `player_items?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['pokedex'][number]>(cfg, `player_pokedex?user_id=eq.${userId}&select=*`),
    selecionarTudo<PlayerSnapshot['autoCatchRules'][number]>(cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=*`),
  ])
  if (!player[0]) throw new ErroHttp(404, 'jogador sem linha em `players`')
  const estado = snapshotToGameState(
    { player: player[0], pokemon, items, pokedex, autoCatchRules },
    defaultGameStateData(),
  )
  return { estado, pokeIdsNoLoad: new Set(pokemon.map((p) => p.id)), entregas: [] }
}

export async function carregarEstado(cfg: Config, userId: string): Promise<GameStateData> {
  return (await lerSnapshot(cfg, userId)).estado
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
export async function carregarEstadoParaEscrita(cfg: Config, userId: string): Promise<EstadoParaEscrita> {
  const snapshot = await lerSnapshot(cfg, userId)
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
  // Só o proprio flush passa `false`: ele E o dono da marca, entao esperaria por
  // si mesmo ate o teto.
  opcoes: { esperarFlush?: boolean } = {},
): Promise<T> {
  if (opcoes.esperarFlush !== false) await aguardarFlushEmAndamento(cfg, userId)
  const ctx = await carregarEstadoParaEscrita(cfg, userId)
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
export async function gravarEstado(
  cfg: Config,
  userId: string,
  estado: GameStateData,
  pokeIdsNoLoad: Set<string>,
): Promise<void> {
  await atualizar(cfg, `players?user_id=eq.${userId}`, gameStateToPlayerRow(userId, estado))

  const linhasPoke = gameStateToPokemonRows(userId, estado)
  const idsAgora = new Set(linhasPoke.map((l) => l.id))
  // Uma leitura so, cobrindo o que eu conhecia e o que estou tentando gravar.
  const idsDeInteresse = [...new Set([...pokeIdsNoLoad, ...idsAgora])]
  const atuais = idsDeInteresse.length
    ? await selecionarTudo<LinhaLocalizacao>(
      cfg,
      `pokemon_instances?id=in.(${idsDeInteresse.join(',')})&select=id,user_id,location`,
    )
    : []
  const porId = new Map(atuais.map((l) => [l.id, l]))
  const aindaMeu = (l: LinhaLocalizacao | undefined): boolean =>
    l != null && l.user_id === userId && (l.location === 'team' || l.location === 'bag')

  const remover = [...pokeIdsNoLoad].filter((id) => !idsAgora.has(id) && aindaMeu(porId.get(id)))
  if (remover.length) {
    await apagar(cfg, `pokemon_instances?user_id=eq.${userId}&id=in.(${remover.join(',')})`)
  }
  // Linha sem par no banco e POKE novo (captura, inicial, compra) — grava.
  // Linha com par que ja nao e minha fica de fora.
  const gravarPoke = linhasPoke.filter((l) => {
    const atual = porId.get(String(l.id))
    return atual == null || aindaMeu(atual)
  })
  if (gravarPoke.length) await inserir(cfg, 'pokemon_instances', gravarPoke, { upsert: 'id' })

  const linhasItens = gameStateToItemRows(userId, estado)
  // Mesmo diff de remocao que `pokemon_instances` acima. Sem ele, um item
  // consumido ate exatamente 0 (e nao travado) some de `estado.items` mas a
  // linha velha continua no banco — o upsert so toca as chaves presentes, nunca
  // apaga. Efeito real: 20 Stones gastas numa evolucao especial voltavam a 20 no
  // reload (evolucao especial de graca), e qualquer pocao/bola zerada
  // ressuscitava. `gameStateToItemRows` ja preserva itens travados com
  // quantidade 0, entao esses continuam na lista e nao sao removidos.
  const itemIdsAgora = new Set(linhasItens.map((l) => l.item_id))
  const itensNoBanco = await selecionarTudo<{ item_id: string }>(cfg, `player_items?user_id=eq.${userId}&select=item_id`)
  const removerItens = itensNoBanco.map((l) => l.item_id).filter((id) => !itemIdsAgora.has(id))
  if (removerItens.length) {
    await apagar(cfg, `player_items?user_id=eq.${userId}&item_id=in.(${removerItens.join(',')})`)
  }
  if (linhasItens.length) await inserir(cfg, 'player_items', linhasItens, { upsert: 'user_id,item_id' })

  // Mesmo diff de remocao das duas tabelas acima. Sem ele, `reiniciarJogo`
  // apagava POKEs e itens mas a Pokedex sobrevivia inteira — a conta "zerada"
  // voltava com todos os abates registrados.
  const linhasDex = gameStateToPokedexRows(userId, estado)
  const dexIdsAgora = new Set(linhasDex.map((l) => l.species_id))
  const dexNoBanco = await selecionarTudo<{ species_id: string }>(cfg, `player_pokedex?user_id=eq.${userId}&select=species_id`)
  const removerDex = dexNoBanco.map((l) => l.species_id).filter((id) => !dexIdsAgora.has(id))
  if (removerDex.length) {
    await apagar(cfg, `player_pokedex?user_id=eq.${userId}&species_id=in.(${removerDex.join(',')})`)
  }
  if (linhasDex.length) await inserir(cfg, 'player_pokedex', linhasDex, { upsert: 'user_id,species_id' })

  // `player_auto_catch_rules` NUNCA era gravada: `carregarEstado` a lia,
  // `gameStateToAutoCatchRuleRows` existia sem nenhum call site, e o mapper de
  // `players` nao carrega essas regras (as outras tres configs de auto sao JSONB
  // na propria linha, esta e tabela). Resultado: a regra "capturar Dratini com
  // Ultra Ball" era aceita pela acao `configurarAuto`, entrava na simulacao do
  // request corrente e desaparecia no proximo load — e sobrevivia a um reset.
  //
  // Escrita pelo mesmo diff de remocao + upsert das outras tabelas, e NAO por
  // "apaga tudo e insere de novo" como era antes. A versao antiga produzia 502
  // ("falha ao falar com o banco") em toda concorrencia: a tabela tem UNIQUE
  // (user_id, species_id), entao dois requests do mesmo jogador intercalando
  // DELETE/DELETE/INSERT/INSERT faziam o segundo INSERT violar a constraint.
  // Reproduzido: com 8 regras configuradas, 33 de 48 GET /estado concorrentes
  // voltaram 502, com o log do PostgREST acusando
  // `duplicate key value violates unique constraint
  // "player_auto_catch_rules_user_id_species_id_key"`. Era o aviso que aparecia
  // ao recarregar a pagina com Ctrl+Shift+R.
  const linhasAuto = gameStateToAutoCatchRuleRows(userId, estado)
  const especiesAgora = new Set(linhasAuto.map((l) => l.species_id))
  const autoNoBanco = await selecionarTudo<{ species_id: string }>(
    cfg, `player_auto_catch_rules?user_id=eq.${userId}&select=species_id`,
  )
  const removerAuto = autoNoBanco.map((l) => l.species_id).filter((id) => !especiesAgora.has(id))
  if (removerAuto.length) {
    await apagar(cfg, `player_auto_catch_rules?user_id=eq.${userId}&species_id=in.(${removerAuto.join(',')})`)
  }
  if (linhasAuto.length) {
    await inserir(cfg, 'player_auto_catch_rules', linhasAuto, { upsert: 'user_id,species_id' })
  }
}

export interface ResultadoFlush {
  segundosCreditados: number
  truncado: boolean
  resumo: OfflineSimSummary
  estado: GameStateData
  piso: ResultadoPiso
  /** Sala em que a hunt parou. Nulo nas hunts sem salas. */
  sala: SalaAtiva | null
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
): Promise<ResultadoFlushOuOcupado> {
  // ANTES do claim, e nao dentro do `comEstadoParaEscrita` la embaixo.
  //
  // O claim so protege contra dois flushes creditarem o MESMO intervalo. Ele nao
  // impede um segundo flush legitimo: quando /acao (ou /mercado) liquida a
  // sessao logo depois de o flush do timer ter comecado, ele le a linha ja com
  // `last_flush_at` novo, reivindica um intervalo de ~0 segundo — e antes desta
  // espera, seguia direto pra ler o estado enquanto o primeiro ainda escrevia,
  // gravando um snapshot de antes dele. Medido: 5 de 6 cliques a 30ms do tique
  // do flush apagavam o intervalo inteiro.
  //
  // A espera fica aqui de proposito: depois do claim seria esperar pela propria
  // marca.
  await aguardarFlushEmAndamento(cfg, userId)

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
  // `flushing_since` entra JUNTO com o claim, na mesma escrita: o claim diz
  // "este intervalo e meu" e a marca diz "e eu ainda estou escrevendo". Sao
  // coisas diferentes — `last_flush_at` avanca no COMECO, e o que os outros
  // requests precisam saber e quando o snapshot parou de mudar. Sem a marca, o
  // GET /estado da pagina recarregada (ou um clique na Loja) lia o estado
  // durante a simulacao e o regravava depois, apagando o que este flush
  // creditou.
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
    return await comEstadoParaEscrita(cfg, userId, async (ctx) => {
      const resultado = await simularSessao(
        cfg, userId, sessao, ctx.estado, ctx.pokeIdsNoLoad, { agora, segundos, truncado },
      )
      // `null` = sessao insimulavel; sai SEM gravar, entao as entregas voltam pra
      // fila (o `catch` do embrulho so cobre excecao, e aqui nao ha excecao).
      if (!resultado) await devolverEntregas(cfg, ctx.entregas)
      return resultado
    }, { esperarFlush: false })
  } finally {
    // No `finally` porque uma marca que sobrevive a um erro faria todo request
    // seguinte esperar o teto ate ela expirar. A expiracao existe pro caso em
    // que nem o `finally` roda (invocacao morta no meio).
    await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, { flushing_since: null })
  }
}

async function simularSessao(
  cfg: Config,
  userId: string,
  sessao: LinhaSessao,
  dados: GameStateData,
  pokeIdsNoLoad: Set<string>,
  janela: { agora: number; segundos: number; truncado: boolean },
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
    { rng, counters: { entity: 1, effect: 1, pendingHit: 1 } },
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

  const resumo = simulateWorldSeconds({
    world,
    gameState: store,
    seconds: segundos,
    stepSeconds: OFFLINE_SIM_STEP_SECONDS,
    stepFn: (w, dt, opts) => stepWorld(w, dt, store, opts),
  })

  // O piso so existe pra impedir que o pior caso degenere pra zero — nao tem o
  // que fazer num flush de jogo ao vivo.
  const piso = offline ? aplicarPiso(store, estado, resumo, agora) : NENHUM_PISO

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
  await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)

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
    encerrada: resumo.stoppedEarly ? 'desmaio' : null,
  }
}
