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

/** Substitui o estado local pelo que o servidor considera verdade. */
export function aplicarEstadoDoServidor(estado: unknown): void {
  if (!estado || typeof estado !== 'object') return
  useGameStateStore.setState(estado as GameStateData)
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
export const INTERVALO_FLUSH_MS = 30000

let timerFlush: ReturnType<typeof setInterval> | null = null

export async function abrirSessaoDeHunt(mapId: string, pokeUid: string): Promise<boolean> {
  if (!servidorAtivo()) return true
  try {
    await servidor.abrirSessao(mapId, pokeUid)
    pararFlushPeriodico()
    timerFlush = setInterval(() => { void liquidar() }, INTERVALO_FLUSH_MS)
    return true
  } catch (erro) {
    // Sempre avisa: so ha um chamador (`controller.enterMap`) e ele nasce de um
    // clique em "Entrar". Recusa do servidor (hunt trancada, POKE que nao e da
    // equipe, sessao invalida) TEM que aparecer em toda tentativa — calar a
    // segunda faz o botao parecer quebrado.
    reportarErro(erro, true)
    return false
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
    const { estado } = await servidor.estado()
    aplicarEstadoDoServidor(estado)
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
    aplicarEstadoDoServidor(r.estado)
    // A sala do servidor manda. A simulacao local sorteia a propria (ela e
    // predicao e tem sequencia de sorteio propria), entao sem esta linha a
    // sala exibida seria um palpite — e o pool/loot que o jogador de fato
    // recebeu vieram da sala de la.
    if (r.sala !== undefined) useWorldStore.getState().definirSala(r.sala)
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
    // `gravarEstado` (server/src/progresso.ts) tambem responde 409 quando OUTRA
    // escrita em `players` (config de auto, comprar, vender) colidiu com o
    // flush, e essa colisao E transitoria (o server ja retenta algumas vezes
    // sozinho antes de desistir). BUG REAL que isto corrigia: tratar esse 409
    // como "sessao sumiu" parava o timer de flush no meio de uma cacada viva —
    // no pior caso, bem na hora de fechar a sequencia do Campeao Lance, jogando
    // fora o "derrotou" e ainda avisando "a cacada foi encerrada" por cima.
    // Mensagem exata do servidor discrimina os dois; qualquer outra causa de
    // 409 cai no `reportarErro` de baixo e a proxima tentativa (30s ou
    // `commitAgora`) tenta de novo sozinha. 401 nao tem esse ambiguidade —
    // token local sumido so tem um significado.
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
  if (timerFlush) clearInterval(timerFlush)
  timerFlush = null
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
    if (r.estado) aplicarEstadoDoServidor(r.estado)
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
    },
  }).catch(reportarErro)
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
    if (r.estado) aplicarEstadoDoServidor(r.estado)
    return r.resumo ?? null
  } catch (erro) {
    reportarErro(erro)
    return null
  }
}
