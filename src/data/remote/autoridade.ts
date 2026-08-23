// A ponte entre a UI e o servidor de autoridade.
//
// Toda mutacao do jogador passa por `pedirAcao`. Com `VITE_SERVIDOR_URL`
// definida ela vira uma intencao mandada ao servidor, e o estado local e
// SOBRESCRITO pela resposta; sem a variavel, ela executa o `fallback` local de
// sempre. Assim cada tela tem um caminho so, e ligar/desligar a autoridade nao
// exige mexer em nenhuma tela.
import { useGameStateStore, type GameStateData } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { useWorldStore } from '@/stores/worldStore'
import { servidor, servidorAtivo, ErroServidor, detalheDeErro, type RespostaFlush } from './servidor'
import { executarAcaoRpc } from './acoesRpc'
import { flushAgora } from './gameStatePersistence'
import {
  ativarPredicoesDeCaptura, ehCapturaPredita, limparCapturasPreditas,
} from './predicoesDeCaptura'
import { mochilaCarregada } from '@/stores/mochilaStore'
import { ABATES_POR_SALA } from '@/data/biomas'
import type { SalaAtiva } from '@/engine/types'
import { supabase, schema, url as supabaseUrl, anonKey } from '@/lib/supabase'

// Sem servidor nao ha nada pra reconciliar — a mochila local JA e a verdade.
// Desligar so evita a lista de uids crescer a sessao inteira sem ninguem ler.
ativarPredicoesDeCaptura(servidorAtivo())

/**
 * Substitui o estado local pelo que o servidor considera verdade.
 *
 * `parcial` = a resposta veio de `/sessao/flush` ou `/sessao/fechar` com o
 * estado enxuto: `bagPokes` traz SO as capturas daquela janela, nao a mochila
 * inteira (ver `OpcoesDeLeitura` em server/src/progresso.ts — o snapshot
 * completo custava 3,2 MB por flush numa conta grande). Nesse caso a mochila
 * local e preservada, menos as predicoes locais, que sao substituidas pelas
 * linhas reais que vieram junto.
 *
 * Todo o RESTO do estado (ouro, XP, itens, time, pokedex) continua sendo
 * substituido, parcial ou nao: nada disso e grande, e a regra "a verdade vem do
 * servidor" nao muda.
 */
export function aplicarEstadoDoServidor(estado: unknown, parcial = false): void {
  if (!estado || typeof estado !== 'object') return
  const doServidor = estado as GameStateData
  if (!parcial) {
    limparCapturasPreditas()
    useGameStateStore.setState(doServidor)
    return
  }
  const novos = Array.isArray(doServidor.bagPokes) ? doServidor.bagPokes : []
  // Mochila nao carregada nesta sessao (ver mochilaStore): nao ha lista local
  // pra reconciliar, e guardar SO as capturas desta janela faria a tela mostrar
  // "2 POKEs" numa conta de milhares. A mochila fica vazia de proposito — quem
  // abrir a tela dispara a leitura paginada e recebe a verdade, capturas novas
  // incluidas.
  if (!mochilaCarregada()) {
    useGameStateStore.setState({ ...doServidor, bagPokes: [] })
    limparCapturasPreditas()
    return
  }
  const idsNovos = new Set(novos.map((p) => p.uid))
  useGameStateStore.setState((local) => ({
    ...doServidor,
    bagPokes: [
      // Fora: o que era predicao (a linha real dela esta em `novos`) e qualquer
      // uid que o servidor esteja mandando agora — sem o segundo filtro, um
      // flush repetido pela camada de retry duplicaria a mesma captura.
      ...local.bagPokes.filter((p) => !ehCapturaPredita(p.uid) && !idsNovos.has(p.uid)),
      ...novos,
    ],
  }))
  limparCapturasPreditas()
}

// Um erro de rede num flush de 30s vira um toast a cada 30s enquanto a
// conexao estiver ruim — o jogador leva uma pilha de avisos identicos por cima
// do jogo. Repetir a MESMA mensagem so passa depois desta janela.
const JANELA_ANTI_REPETICAO_MS = 20000
const ultimoAviso = new Map<string, number>()

/**
 * `sempreAvisar` desliga a janela anti-repeticao.
 *
 * A janela existe pro caminho de FUNDO: o flush roda de 30 em 30 segundos
 * sozinho, e uma queda de rede viraria uma torre de toasts iguais. Mas ela
 * tambem calava o caminho em que o JOGADOR acabou de clicar em alguma coisa —
 * e ai o silencio le como "o botao nao funciona", nao como "deu erro de novo".
 *
 * Foi metade do diagnostico perdido de 2026-08-18: o primeiro "Entrar" numa
 * hunt avisava, e os 20 segundos seguintes de cliques nao diziam nada. Acao
 * disparada por clique sempre responde alguma coisa.
 */
function reportarErro(erro: unknown, sempreAvisar = false): void {
  const mensagem = erro instanceof ErroServidor ? erro.message : 'nao foi possivel falar com o servidor'
  const agora = Date.now()
  const anterior = ultimoAviso.get(mensagem)
  if (!sempreAvisar && anterior != null && agora - anterior < JANELA_ANTI_REPETICAO_MS) return
  ultimoAviso.set(mensagem, agora)
  useToastStore.getState().pushToast(mensagem, 'error', 'world', undefined, detalheDeErro(erro))
}

/**
 * `fallback` roda quando NAO ha servidor configurado — e o comportamento atual
 * do jogo, preservado inteiro. Nao e um "modo degradado": e o modo padrao
 * enquanto a hospedagem nao foi decidida.
 */
// Devolve se a acao foi de fato APLICADA. Quem so quer disparar pode ignorar o
// retorno (`void pedirAcao(...)`); quem toma uma decisao em cima do resultado —
// como "entrar na hunt depois de desbloquear" — precisa esperar. Sem isso, um
// `else` de erro vira codigo morto e a UI segue como se tivesse dado certo.
//
// O `fallback` pode devolver `false` pra sinalizar que a operacao local falhou
// (ex: ouro insuficiente pra desbloquear).
export async function pedirAcao(
  acao: { tipo: string } & Record<string, unknown>,
  fallback: () => boolean | void,
): Promise<boolean> {
  if (!servidorAtivo()) {
    return fallback() !== false
  }
  try {
    const resposta = await executarAcaoRpc(acao)
    if (resposta.mensagem) useToastStore.getState().pushToast(resposta.mensagem, 'success', 'world')
    return true
  } catch (erro) {
    reportarErro(erro)
    return false
  }
}

/**
 * Igual a `pedirAcao`, mas devolve TAMBEM o que o fallback local retornou.
 *
 * Existe por causa de um bug real: varias telas faziam
 * `const res = { gold: 0, itemCount: 0 }; void pedirAcao(...)` e depois liam
 * `res` pra montar o toast. Como `res` era um literal fixo e `pedirAcao` e
 * assincrona, a mensagem NUNCA refletia o que aconteceu — comprar dizia
 * "Comprou" mesmo sem ouro, "Vender Tudo" nunca aparecia (itemCount 0) e vender
 * POKE sempre dizia "por 0 ouro".
 *
 * `local` e `null` quando ha servidor: nesse caminho quem executou foi ele, e a
 * mensagem certa vem na resposta (`resposta.mensagem`). Quem chama deve tratar
 * os dois casos — nunca inventar um numero pro caso remoto.
 */
export async function pedirAcaoComLocal<T>(
  acao: { tipo: string } & Record<string, unknown>,
  fallback: () => T,
): Promise<{ ok: boolean; local: T | null }> {
  let local: T | null = null
  const ok = await pedirAcao(acao, () => {
    local = fallback()
  })
  return { ok, local }
}

// --- sessao de hunt ---------------------------------------------------------

// De quanto em quanto tempo o progresso e liquidado com o servidor. 30s e um
// meio-termo: o jogador ve o ouro andar em passos visiveis, e uma aba fechada
// no soco perde no maximo 30s de tempo NAO creditado — nao de progresso, porque
// o relogio de referencia vive no banco e o proximo flush cobre o intervalo.
//
// PISO do intervalo adaptativo (ver `proximoIntervaloDeFlush`).
export const INTERVALO_FLUSH_MS = 30000

/**
 * TETO do intervalo adaptativo.
 *
 * POR QUE ADAPTATIVO: cada flush e uma invocacao de Edge Function, e o plano
 * Free tem 500.000 por mes. A 30s fixos sao ~120 por hora por jogador, ou seja
 * ~3.800 horas-jogador no mes — e num jogo idle o jogador fica LIGADO, entao
 * isso e teto de jogadores simultaneos (~5), nao de acesso. Janela sem nenhum
 * evento nao precisa desse ritmo: a janela do servidor e por tempo decorrido
 * (`last_flush_at`), entao esperar mais nao perde progresso, so faz o numero na
 * tela andar em passos maiores.
 *
 * POR QUE 90s E NAO 2 MINUTOS: acima de `LIMIAR_OFFLINE_SEGUNDOS` (120s, em
 * engine/simulation.ts) o servidor trata a janela como AUSENCIA — liga o modo
 * pessimista e aplica o piso de 50% do farm offline. Um teto de 120s mais
 * latencia e drift de timer atravessaria essa linha e faria jogo ao vivo ser
 * creditado como farm offline, o que e pior que o custo que estamos cortando.
 * 90s deixa 30s de folga. Subir daqui exige subir o limiar no motor primeiro —
 * e isso muda a semantica do farm offline, nao e ajuste de rede.
 */
export const INTERVALO_FLUSH_MAX_MS = 90000

let timerFlush: ReturnType<typeof setTimeout> | null = null
// Cresce a cada `pararFlushPeriodico`: um flush que ja estava em voo quando a
// sessao fechou nao pode reagendar o proximo (`agendarProximoFlush` compara a
// geracao antes de se reagendar).
let geracaoDoTimer = 0
let intervaloAtual = INTERVALO_FLUSH_MS

/**
 * Janela sem nenhum evento DOBRA o intervalo, ate o teto; qualquer evento volta
 * pro piso.
 *
 * "Evento" e o resumo do servidor, nao a predicao local: quem credita e ele, e
 * e o ritmo do credito que o jogador percebe. Abate, ouro ou XP na janela ja
 * conta — nao ha caso de janela produtiva que nao mexa em nenhum dos tres.
 */
function ajustarRitmoDeFlush(houveEvento: boolean): void {
  intervaloAtual = houveEvento
    ? INTERVALO_FLUSH_MS
    : Math.min(intervaloAtual * 2, INTERVALO_FLUSH_MAX_MS)
}

function agendarProximoFlush(): void {
  const geracao = geracaoDoTimer
  timerFlush = setTimeout(() => {
    void liquidar().finally(() => {
      // `pararFlushPeriodico` durante o request em voo (sessao encerrada pelo
      // servidor, jogador saindo da hunt) bump'a a geracao — e ai nao ha
      // proximo.
      if (geracao === geracaoDoTimer) agendarProximoFlush()
    })
  }, intervaloAtual)
}

/**
 * Abre a sessao e devolve a SALA INICIAL que o servidor decidiu, pra quem
 * constroi o mundo comecar na mesma sala que ele.
 *
 * `null` cobre tres casos que o chamador trata igual (sorteia a propria):
 * hunt sem sistema de salas, jogo sem servidor, e servidor mais antigo que nao
 * manda o campo.
 */
export async function abrirSessaoDeHunt(
  mapId: string, pokeUid: string, opcoes?: { avisarErro?: boolean },
): Promise<{ ok: boolean; sala: SalaAtiva | null }> {
  if (!servidorAtivo()) return { ok: true, sala: null }
  try {
    const resposta = await servidor.abrirSessao(mapId, pokeUid)
    pararFlushPeriodico()
    // Hunt nova comeca no piso: a primeira janela e quase sempre produtiva, e
    // herdar o intervalo esticado da hunt anterior faria o jogador entrar e
    // esperar 90s pelo primeiro credito.
    intervaloAtual = INTERVALO_FLUSH_MS
    agendarProximoFlush()
    observarQuotaDeSala()
    return { ok: true, sala: resposta.sala ?? null }
  } catch (erro) {
    // Sempre avisa QUANDO A ENTRADA NASCEU DE UM CLIQUE: recusa do servidor
    // (hunt trancada, POKE que nao e da equipe, sessao invalida) TEM que
    // aparecer em toda tentativa — calar a segunda faz o botao "Entrar"
    // parecer quebrado.
    //
    // `avisarErro: false` existe pro segundo chamador, que NAO e um clique: a
    // reentrada automatica na hunt do boot (PH-93). Ali a recusa nao e um erro
    // que o jogador possa agir sobre — ele nem pediu pra entrar —, e cair no
    // Hospital ja e o estado seguro. Um toast de erro no primeiro segundo do
    // jogo, sobre uma acao que ninguem disparou, so ensina o jogador a ignorar
    // toast.
    if (opcoes?.avisarErro ?? true) reportarErro(erro, true)
    return { ok: false, sala: null }
  }
}

/**
 * Recarrega o estado do servidor e aplica no cliente.
 *
 * Existe pro caso "o servidor me deve alguma coisa que so e creditada no
 * proximo request que grava" — entrega do Mercado, anexo de Correio coletado.
 * `GET /estado` e justamente esse request (ele carrega PARA ESCRITA e grava,
 * apesar de ser um GET; ver app.ts).
 *
 * `liquidar()` NAO serve aqui: ela chama `/sessao/flush`, que responde 409
 * quando nao ha hunt aberta — e coletar um item do Correio no Hospital e
 * exatamente esse caso. Foi assim que a primeira versao ficou: a coleta
 * carimbava a mensagem como recebida e o item so aparecia quando o jogador
 * entrasse numa hunt.
 */
export async function recarregarEstado(): Promise<void> {
  if (!servidorAtivo()) return
  try {
    const r = await servidor.estado()
    aplicarEstadoDoServidor(r.estado, r.estadoParcial === true)
  } catch (erro) {
    reportarErro(erro)
  }
}

/**
 * O que fazer quando o SERVIDOR encerra a cacada sozinho.
 *
 * Registrado de fora (GameShell) em vez de chamado direto porque `controller`
 * ja importa este modulo — chamar de volta daqui fecharia um ciclo de import.
 */
let aoEncerrarSessao: (() => void) | null = null

export function registrarEncerramentoDeSessao(cb: () => void): () => void {
  aoEncerrarSessao = cb
  return () => { if (aoEncerrarSessao === cb) aoEncerrarSessao = null }
}

const MOTIVO_ENCERRAMENTO: Record<string, string> = {
  desmaio: 'Seu POKE desmaiou e a cacada foi encerrada. Cure na Enfermeira para voltar a cacar.',
  sumiu: 'A cacada foi encerrada — voce entrou em outra hunt ou saiu por outra aba.',
}

function tratarEncerramento(motivo: string | null | undefined): void {
  if (!motivo) return
  // Sem parar o timer, o cliente segue pedindo flush de 30 em 30 segundos numa
  // sessao que ja nao existe (409 silencioso), e o jogador continua vendo a
  // hunt como se estivesse rendendo.
  pararFlushPeriodico()
  useToastStore.getState().pushToast(
    MOTIVO_ENCERRAMENTO[motivo] ?? 'A cacada foi encerrada pelo servidor.', 'error', 'world',
  )
  aoEncerrarSessao?.()
}

export async function liquidar(): Promise<void> {
  if (!servidorAtivo()) return
  try {
    const r = await servidor.flush()
    aplicarEstadoDoServidor(r.estado, r.estadoParcial === true)
    // A sala do servidor manda. A simulacao local sorteia a propria (ela e
    // predicao e tem sequencia de sorteio propria), entao sem esta linha a
    // sala exibida seria um palpite — e o pool/loot que o jogador de fato
    // recebeu vieram da sala de la.
    if (r.sala !== undefined) useWorldStore.getState().definirSala(r.sala)
    // Ritmo do proximo flush: janela produtiva mantem 30s, janela vazia estica
    // (ver INTERVALO_FLUSH_MAX_MS).
    ajustarRitmoDeFlush((r.resumo?.kills ?? 0) > 0 || (r.resumo?.gold ?? 0) > 0 || (r.resumo?.xp ?? 0) > 0)
    tratarEncerramento(r.sessaoEncerrada)
    if (r.truncado) {
      useToastStore.getState().pushToast(
        'Voce ficou fora tempo demais — parte do periodo nao foi creditada.', 'error', 'world',
      )
    }
  } catch (erro) {
    // 409 com mensagem exata "nenhuma sessao aberta" = servidor nao acha a
    // sessao. 401 = nao ha token local (`pedir` em servidor.ts lanca antes de
    // chegar na rede quando `getSession()` nao devolve token). Nenhum dos
    // dois e transitorio: se a sessao sumiu de um dos lados, a proxima
    // tentativa vai dar o mesmo erro.
    //
    // Quem discrimina os dois casos e o proprio timer:
    //
    //  - timer JA parado — corrida normal. `fecharSessaoDeHunt` chama
    //    `pararFlushPeriodico()` ANTES do request, e `commitAgora` usa
    //    `liquidar()` fora de hunt de proposito. Nada a fazer, nada a avisar.
    //  - timer AINDA rodando — a sessao morreu pelas costas do cliente (a
    //    mesma conta abriu outra hunt em outra aba, o servidor a fechou por
    //    um caminho que so devolve 409, ver appSessao.ts#flush, ou o token
    //    local sumiu). Este era um vazamento real: o `return` mudo deixava
    //    o timer batendo em `/sessao/flush` a cada 30s PARA SEMPRE, uma
    //    verificacao de auth por tick, numa cacada que o jogador continuava
    //    vendo render na tela sem creditar nada. So cobrir o 409 nao bastou:
    //    o 401 (token local sumido) escapava por este mesmo buraco.
    //
    // MAS nem todo 409 de `/sessao/flush` significa "sessao sumiu" — o CAS de
    // `gravarEstado` (authority/src/progresso.ts) tambem responde 409 quando
    // OUTRA escrita em `players` (config de auto, comprar, vender) colidiu com
    // o flush, e essa colisao E transitoria (o server ja retenta algumas vezes
    // sozinho antes de desistir). BUG REAL que isto corrigia: tratar esse 409
    // como "sessao sumiu" parava o timer de flush no meio de uma cacada viva —
    // no pior caso, bem na hora de fechar a sequencia do Campeao Lance, jogando
    // fora o "derrotou" e ainda avisando "a cacada foi encerrada" por cima.
    // Mensagem exata do servidor discrimina os dois; qualquer outra causa de
    // 409 cai no `reportarErro` de baixo e a proxima tentativa (30s ou
    // `commitAgora`) tenta de novo sozinha. 401 nao tem esse ambiguidade —
    // token local sumido so tem um significado.
    //
    // PH-67: `pg_advisory_xact_lock` no servidor serializa as escritas que
    // colidiam aqui, entao esse 409 fica bem mais raro (so sobra se as 3
    // tentativas do server ainda assim colidirem). Decisao explicita: este
    // tratamento fica — defesa em profundidade, nao caminho morto. O client
    // nao tem como saber se um 409 de fato esgotou o retry do servidor ou se
    // e outra causa qualquer; continuar tratando como transitorio (cai no
    // `reportarErro`, tenta de novo sozinho) e sempre a leitura mais segura.
    if (
      erro instanceof ErroServidor
      && ((erro.status === 409 && erro.message === 'nenhuma sessao aberta') || erro.status === 401)
    ) {
      if (timerFlush) tratarEncerramento('sumiu')
      return
    }
    reportarErro(erro)
  }
}

export function pararFlushPeriodico(): void {
  // A geracao sobe ANTES de limpar: um `liquidar()` ja em voo cai no `finally`
  // depois disto e nao reagenda.
  geracaoDoTimer += 1
  if (timerFlush) clearTimeout(timerFlush)
  timerFlush = null
  intervaloAtual = INTERVALO_FLUSH_MS
  pararObservadorDeSala?.()
  pararObservadorDeSala = null
  salaJaPedida = null
}

// --- quota de sala fechada: pede o flush na hora ----------------------------
// Sob autoridade remota o cliente NAO sorteia a proxima sala (ver
// engine/systems/salaSystem.ts#registrarAbate): ele conta o abate e espera. Sem
// isto a espera seria o intervalo de flush inteiro — ate 30 segundos com a barra
// da sala cheia e nada acontecendo, que le como jogo travado.
//
// O pedido e por (ciclo, sala) e tem repeticao propria porque o servidor pode
// ainda NAO ter fechado a quota dele: as duas simulacoes contam abates
// separadamente e a dele pode estar dois abates atras. Nesse caso a resposta traz
// a mesma sala, e o proximo tick pede de novo depois do intervalo.
const REPETIR_PEDIDO_DE_SALA_MS = 5000
let pararObservadorDeSala: (() => void) | null = null
let salaJaPedida: string | null = null
let ultimoPedidoDeSala = 0

function observarQuotaDeSala(): void {
  pararObservadorDeSala?.()
  pararObservadorDeSala = useWorldStore.subscribe((estado) => {
    const sala = estado.sala
    if (!estado.salaSobAutoridade || !sala) return
    // Transicao ja em andamento (a sala do servidor chegou e o aviso esta na
    // tela): nao ha o que pedir.
    if (estado.salaPendente || estado.salaCountdownRemaining != null) return
    if (sala.abates < ABATES_POR_SALA) return
    const chave = `${sala.ciclos}:${sala.indice}`
    const agora = Date.now()
    if (chave === salaJaPedida && agora - ultimoPedidoDeSala < REPETIR_PEDIDO_DE_SALA_MS) return
    salaJaPedida = chave
    ultimoPedidoDeSala = agora
    // Quota fechada e o oposto de janela parada: o jogador esta matando no
    // ritmo. Volta pro piso pra a sala seguinte nao esperar o intervalo
    // esticado.
    intervaloAtual = INTERVALO_FLUSH_MS
    void liquidar()
  })
}

// Intervalo minimo entre dois commits FORCADOS (level-up, aba sendo ocultada).
// Sem ele, um POKE de nivel baixo — que sobe de nivel a cada poucos abates —
// dispararia uma chamada de rede por segundo.
const INTERVALO_MINIMO_COMMIT_MS = 5000
let ultimoCommit = 0

/**
 * Grava o progresso AGORA, sem esperar o ciclo normal.
 *
 * Existe por causa do bug relatado como "dou F5 e perco niveis". Sob autoridade
 * do servidor a simulacao local e PREDICAO: quem credita e o servidor, no flush,
 * re-simulando o intervalo com a sequencia de sorteio dele. Entre dois flushes
 * (30s) a predicao local pode ter subido um nivel que a verdade ainda nao tem —
 * e um F5 nesse intervalo faz o nivel "voltar". Nada de tempo se perde (o
 * relogio de referencia vive no banco), mas o jogador ve um numero regredir, que
 * e indistinguivel de perda de progresso.
 *
 * Forcar o commit no momento do level-up encurta essa janela de 30s pra este
 * intervalo minimo: a reconciliacao acontece junto do evento, nao meio minuto
 * depois.
 *
 * Sem servidor configurado, faz o equivalente local: descarrega a escrita
 * debounced (3s) do adaptador de persistencia na hora.
 */
export async function commitAgora(): Promise<void> {
  const agora = Date.now()
  if (agora - ultimoCommit < INTERVALO_MINIMO_COMMIT_MS) return
  ultimoCommit = agora
  if (servidorAtivo()) {
    // So faz sentido com uma sessao de hunt aberta; fora dela o `liquidar`
    // devolve 409 e e ignorado (ver o catch la dentro).
    await liquidar()
    return
  }
  await flushAgora()
}

export async function fecharSessaoDeHunt(): Promise<void> {
  if (!servidorAtivo()) return
  pararFlushPeriodico()
  try {
    const r = await servidor.fecharSessao()
    if (r.estado) aplicarEstadoDoServidor(r.estado, r.estadoParcial === true)
  } catch (erro) {
    reportarErro(erro)
  }
}

// --- configuracao de automacao ---------------------------------------------

// A UI de auto tem 14 pontos de mutacao granulares (toggles, regras, bolas).
// Rotear cada um seria 14 chamadas e 14 chances de esquecer uma; em vez disso o
// bloco inteiro e sincronizado depois que muda. Isso vale porque a config de
// auto e pequena e idempotente — nao e um delta que possa ser perdido, e o
// servidor a substitui por completo.
//
// Nao e cosmetico: o servidor LE estas regras quando decide usar pocao ou bola
// durante a simulacao. Config dessincronizada = simulacao com regra errada.
export function sincronizarAuto(): void {
  if (!servidorAtivo()) return
  const s = useGameStateStore.getState()
  void executarAcaoRpc({
    tipo: 'configurarAuto',
    patch: {
      toggles: s.autoToggles,
      catchConfig: s.autoCatchConfig,
      potRules: s.autoPotRules,
      catchRules: s.autoCatchRules,
      statusItems: s.autoStatusConfig,
      sellConfig: s.autoSellConfig,
    },
  }).catch(reportarErro)
}

/**
 * Ultimo `configurar_auto` ao sair da pagina (PH-42).
 *
 * `sincronizarAuto()` acima e fire-and-forget via `supabase.rpc()` — se o
 * jogador desliga um toggle e recarrega logo em seguida, o navegador pode
 * ABORTAR essa request no meio do unload. O boot da pagina nova chama
 * `assentarSessaoPendente()` quase de imediato, que fecha a sessao pendente
 * lendo `players` FRESCO do banco: se a escrita da config nunca chegou, o
 * servidor resimula com o toggle ANTIGO (ex.: auto-catch ainda ligado) —
 * exatamente o "toggle desligado captura mesmo assim" reproduzido ao vivo.
 *
 * `fetch` com `keepalive` em vez do client do supabase-js (que nao expoe essa
 * opcao): mesma decisao de `flushAoSair()` em servidor.ts, raw fetch direto no
 * endpoint RPC do PostgREST pra sobreviver ao unload.
 */
export function sincronizarAutoAoSair(): void {
  if (!servidorAtivo()) return
  const s = useGameStateStore.getState()
  const patch = {
    toggles: s.autoToggles,
    catchConfig: s.autoCatchConfig,
    potRules: s.autoPotRules,
    catchRules: s.autoCatchRules,
    statusItems: s.autoStatusConfig,
    sellConfig: s.autoSellConfig,
  }
  void supabase.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token
    if (!token) return
    void fetch(`${supabaseUrl}/rest/v1/rpc/configurar_auto`, {
      method: 'POST',
      keepalive: true,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'Accept-Profile': schema,
        'Content-Profile': schema,
      },
      body: JSON.stringify({ p_patch: patch }),
    })
  })
}

// --- farm offline -----------------------------------------------------------

/**
 * Liquida a sessao que ficou aberta desde a ultima vez que o jogador jogou, e
 * devolve o resumo do que ELA rendeu — que e o "farm offline" sob autoridade do
 * servidor.
 *
 * Por que isto precisa existir: o jogo sempre volta ao Hospital no boot, entao
 * a sessao anterior ficava aberta e so era liquidada quando o jogador clicasse
 * "Entrar" numa hunt. O tempo era creditado (nada se perdia), mas em SILENCIO e
 * num momento sem relacao com o que aconteceu — o jogador via o ouro pular sem
 * explicacao. Pior: o modal de Farm Offline do cliente nunca aparecia, porque o
 * `savedAt` vem do servidor e o gap medido localmente e sempre ~0.
 *
 * Fecha a sessao (em vez de so dar flush) porque o jogador esta no Hospital
 * agora, nao cacando.
 */
export async function assentarSessaoPendente(): Promise<RespostaFlush['resumo'] | null> {
  if (!servidorAtivo()) return null
  try {
    const r = await servidor.fecharSessao()
    if (!r.fechada) return null
    if (r.estado) aplicarEstadoDoServidor(r.estado, r.estadoParcial === true)
    return r.resumo ?? null
  } catch (erro) {
    reportarErro(erro)
    return null
  }
}
