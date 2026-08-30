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
import { solicitarAvancoDeSala } from '@/engine/systems/salaSystem'
import { agendarMesmoEmSegundoPlano, type TemporizadorCancelavel } from '@/core/temporizadorDeSegundoPlano'
import type { ClimaTipo, SalaAtiva } from '@/engine/types'
import { supabase, schema, url as supabaseUrl, anonKey } from '@/lib/supabase'

// Sem servidor nao ha nada pra reconciliar — a mochila local JA e a verdade.
// Desligar so evita a lista de uids crescer a sessao inteira sem ninguem ler.
ativarPredicoesDeCaptura(servidorAtivo())

/**
 * PH-171: trava a queda de XP que `doServidor` traria por cima do que o
 * client ja mostrou, quando essa queda nao e coberta pelo que
 * `resumo.expPerdidaPorMorte` diz ter sido debitado de verdade na janela.
 *
 * Raiz do bug (barra "voltando" sem o jogador ter perdido nada): o servidor
 * resimula a janela do flush pelo RELOGIO DELE, nao pelo tempo que o client ja
 * renderizou ao vivo — latencia de rede faz esse recorte fechar um pouco antes
 * do ponto que o jogador ja viu na tela, e sem esta trava esse valor menor
 * substituia o que ja estava mostrado (PH-37 e um bug DIFERENTE, ja corrigido:
 * era passo de resimulacao errado, nao descompasso de janela).
 *
 * Muta `doServidor` in-place ANTES do `setState` — o fix fica inteiro na
 * camada de dados, a UI nao precisa saber que isto existe.
 */
function reconciliarExpAntesDeAplicar(doServidor: GameStateData, resumo: RespostaFlush['resumo'] | undefined): void {
  const local = useGameStateStore.getState()

  // Treinador: nao existe NENHUM mecanismo de queda legitima de exp de
  // treinador no motor inteiro (so `grantTrainerExp`, que so soma) — uma
  // resposta menor so pode ser descompasso de janela. Piso incondicional,
  // funciona mesmo sem `resumo` (ex: recarregarEstado(), que so busca
  // `/estado` sem rodar resim nenhuma).
  if (doServidor.trainer && local.trainer.exp > doServidor.trainer.exp) {
    doServidor.trainer = {
      ...doServidor.trainer,
      exp: local.trainer.exp,
      level: Math.max(local.trainer.level, doServidor.trainer.level),
    }
  }

  // POKE ativo: so compara se o MESMO uid segue em campo — troca de POKE por
  // desmaio ja e visivel por outro caminho (toast + animacao), nao e "a barra
  // voltou do nada". Sem `resumo` (nenhuma janela de resim rodou) nao ha como
  // saber quanto seria legitimo — fica sem mexer, confia no servidor como
  // sempre foi.
  if (!resumo) return
  const uidAtivo = useWorldStore.getState().player?.poke.uid
  if (!uidAtivo || !Array.isArray(doServidor.team)) return
  const pokeLocal = local.team.find((p) => p.uid === uidAtivo)
  const indiceNoServidor = doServidor.team.findIndex((p) => p.uid === uidAtivo)
  if (!pokeLocal || indiceNoServidor === -1) return

  const pokeServidor = doServidor.team[indiceNoServidor]
  const queda = pokeLocal.exp - pokeServidor.exp
  if (queda <= 0) return // subiu ou empatou, servidor passa como veio

  // `?? 0`: Edge mais antiga (ou `/estado` sem resim) pode mandar `resumo` sem
  // `expPerdidaPorMorte`. Sem o coalesce, `pokeLocal.exp - undefined` grava
  // `NaN` na exp do POKE ativo e a barra/nivel quebram ate o proximo flush
  // limpo (PH-221). Ausente = sem orcamento de morte = toda queda e espuria.
  const orcamento = resumo.expPerdidaPorMorte ?? 0
  if (queda <= orcamento) return // legitima (penalidade de morte real), mostra normal

  // Excedente e espurio — trava no que a penalidade de verdade justifica,
  // nunca deixa passar disso. Nivel segue a mesma decisao (nao regride abaixo
  // do que ja foi mostrado) — pode sobrar % de barra levemente inconsistente
  // com o nivel por ~1 flush, corrige sozinho no ciclo seguinte (YAGNI).
  doServidor.team[indiceNoServidor] = {
    ...pokeServidor,
    exp: pokeLocal.exp - orcamento,
    level: Math.max(pokeLocal.level, pokeServidor.level),
  }
}

/**
 * PH-221: reflete no `worldStore.player.poke` — o que o HUD (`StatusRail`) le
 * durante a hunt — a mudanca de PROGRESSAO que o servidor acabou de aplicar no
 * `gameStateStore`.
 *
 * Sob autoridade, `aplicarEstadoDoServidor` so mexe no `gameStateStore`, e o
 * unico sync (`syncActivePokeToGameState`, GameCanvas, 5s) so vai
 * `world -> gameState` — nada volta. Efeito: evolucao, golpe novo, recalculo
 * de stat e correcao de nivel do POKE ativo so apareciam no HUD depois do F5
 * (que reconstroi o world a partir do `gameStateStore`) ou ao sair da hunt.
 *
 * Regras, na mesma filosofia de `reconciliarExpAntesDeAplicar`:
 *  - especie / stats / minLevel / traco / `unlockedAbilities`: SEGUEM o
 *    servidor sempre (evolucao e golpe novo tem que aparecer). `hp` continua
 *    sendo a vida ao vivo do combate — so e reclampado pro novo teto.
 *  - nivel / exp: NUNCA regridem abaixo do que o jogador ja viu no world. Sobe
 *    quando o servidor traz mais; segura o local quando viria menos
 *    (descompasso de janela, pessimista de aba oculta). Valor nao-finito do
 *    servidor e ignorado.
 *
 * `activeAbilities` / `disabledAbilities` NAO entram aqui de proposito: sao
 * escolha do jogador e ja tem caminho proprio de patch no world
 * (`controller.ts#definirGolpesAtivos` / `#alternarHabilidade`).
 */
function reconciliarPokeAtivoNoWorld(doServidor: GameStateData): void {
  if (!Array.isArray(doServidor.team)) return
  const noWorld = useWorldStore.getState().player?.poke
  if (!noWorld) return
  const doServ = doServidor.team.find((p) => p.uid === noWorld.uid)
  if (!doServ) return

  const level = Math.max(noWorld.level, Number.isFinite(doServ.level) ? doServ.level : noWorld.level)
  const exp = Math.max(noWorld.exp, Number.isFinite(doServ.exp) ? doServ.exp : noWorld.exp)

  const jaAtual =
    doServ.speciesId === noWorld.speciesId
    && level === noWorld.level
    && exp === noWorld.exp
    && (doServ.unlockedAbilities?.length ?? 0) === (noWorld.unlockedAbilities?.length ?? 0)
    && (doServ.minLevel ?? null) === (noWorld.minLevel ?? null)
  if (jaAtual) return

  const stats = doServ.stats ?? noWorld.stats
  useWorldStore.getState().update((draft) => {
    if (!draft.player || draft.player.poke.uid !== noWorld.uid) return
    draft.player.poke = {
      ...draft.player.poke,
      speciesId: doServ.speciesId,
      level,
      exp,
      stats,
      hp: Math.min(draft.player.poke.hp, stats.hp),
      minLevel: doServ.minLevel ?? draft.player.poke.minLevel,
      isShiny: doServ.isShiny,
      nature: doServ.nature ?? draft.player.poke.nature,
      trait: doServ.trait ?? draft.player.poke.trait,
      unlockedAbilities: doServ.unlockedAbilities ?? draft.player.poke.unlockedAbilities,
    }
  })
}

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
 * A POKEDEX entrou na mesma familia da mochila em PH-186: num flush parcial,
 * `estado.pokedexKills` traz SO as especies abatidas naquela janela — e por
 * TOTAL ABSOLUTO, nao incremento. Por isso ela e MESCLADA por especie, e nao
 * substituida: substituir deixaria a tela mostrando 3 abates numa especie com
 * 400. Ver `mesclarPokedex`.
 *
 * Todo o RESTO do estado (ouro, XP, itens, time) continua sendo substituido,
 * parcial ou nao: nada disso e grande, e a regra "a verdade vem do servidor"
 * nao muda.
 *
 * `resumo` (so vem de `/sessao/flush` e `/sessao/fechar`) alimenta
 * `reconciliarExpAntesDeAplicar` — ver o comentario dela pro porque disto
 * existir.
 */
/**
 * Pokedex local + o que o flush parcial trouxe, por especie (PH-186).
 *
 * O servidor manda TOTAL ABSOLUTO das especies que ele acabou de gravar, nao o
 * incremento da janela. E o que torna esta mescla idempotente: a camada de
 * retry ja reaplicou a mesma resposta neste projeto (e por isso o filtro de
 * `idsNovos` logo abaixo existe). Somando delta, reaplicar dobraria a contagem;
 * sobrescrevendo por especie, reaplicar da o mesmo numero.
 *
 * Especie ausente da resposta fica como esta: o servidor so manda o que mudou,
 * e janela sem abate nenhum manda `{}`.
 */
function mesclarPokedex(local: GameStateData, doServidor: GameStateData): GameStateData['pokedexKills'] {
  const doFlush = doServidor.pokedexKills
  if (!doFlush || Object.keys(doFlush).length === 0) return local.pokedexKills
  return { ...local.pokedexKills, ...doFlush }
}

/**
 * Missoes ja reivindicadas: UNIAO, nunca substituicao (PH-265).
 *
 * O BUG QUE ISTO CONSERTA. `carregarEstado` do servidor monta o snapshot com
 * `missoesReivindicadas: []` de proposito — missao nao entra na resimulacao de
 * combate, entao a rota nao le a tabela (ver authority/src/progresso.ts). Só que
 * esse estado e aplicado no cliente por `setState`, e a lista vazia SOBRESCREVIA
 * a local: bastava um flush (30 em 30 segundos) pra a tela de Tasks voltar a
 * mostrar como disponivel uma missao ja reivindicada. O jogador clicava e a RPC
 * respondia "Missao ja reivindicada" — o relato exato desta issue. O ouro da
 * primeira reivindicacao tinha sido pago; o que se perdeu foi a marca na tela.
 *
 * Uniao e seguro porque a chave so ENTRA: `setMissaoReivindicada` nunca remove
 * (o mesmo ja esta escrito em playerMapper.ts). Entao o pior caso de um servidor
 * que um dia passe a mandar a lista cheia e ela somar com a local, e nao brigar
 * com ela.
 *
 * O outro conserto possivel era a rota passar a LER a tabela em todo flush. Sai
 * mais caro (uma consulta a cada 30s por jogador, no caminho que a PH-185/186
 * existiu pra enxugar) e nao seria mais correto: o servidor de fato nao e dono
 * deste campo durante a sessao — quem escreve nele e uma RPC de menu.
 */
function mesclarMissoes(local: GameStateData, doServidor: GameStateData): GameStateData['missoesReivindicadas'] {
  const doFlush = doServidor.missoesReivindicadas
  if (!doFlush || Object.keys(doFlush).length === 0) return local.missoesReivindicadas
  return { ...local.missoesReivindicadas, ...doFlush }
}

export function aplicarEstadoDoServidor(estado: unknown, parcial = false, resumo?: RespostaFlush['resumo']): void {
  if (!estado || typeof estado !== 'object') return
  const doServidor = estado as GameStateData
  reconciliarExpAntesDeAplicar(doServidor, resumo)
  // Roda ANTES do setState de proposito: so le `doServidor.team` + worldStore e
  // escreve no worldStore — nao depende do gameStateStore ja ter sido gravado,
  // e ver os valores ja travados por `reconciliarExpAntesDeAplicar` acima.
  reconciliarPokeAtivoNoWorld(doServidor)
  if (!parcial) {
    limparCapturasPreditas()
    // `setState` com FUNCAO, e nao com o objeto cru: `mesclarMissoes` precisa do
    // estado local (ver o comentario dela). Este caminho tambem passava por
    // cima da lista de missoes reivindicadas.
    useGameStateStore.setState((local) => ({
      ...doServidor, missoesReivindicadas: mesclarMissoes(local, doServidor),
    }))
    return
  }
  const novos = Array.isArray(doServidor.bagPokes) ? doServidor.bagPokes : []
  // Mochila nao carregada nesta sessao (ver mochilaStore): nao ha lista local
  // pra reconciliar, e guardar SO as capturas desta janela faria a tela mostrar
  // "2 POKEs" numa conta de milhares. A mochila fica vazia de proposito — quem
  // abrir a tela dispara a leitura paginada e recebe a verdade, capturas novas
  // incluidas.
  if (!mochilaCarregada()) {
    useGameStateStore.setState((local) => ({
      ...doServidor, bagPokes: [], pokedexKills: mesclarPokedex(local, doServidor),
      missoesReivindicadas: mesclarMissoes(local, doServidor),
    }))
    limparCapturasPreditas()
    return
  }
  const idsNovos = new Set(novos.map((p) => p.uid))
  useGameStateStore.setState((local) => ({
    ...doServidor,
    pokedexKills: mesclarPokedex(local, doServidor),
    missoesReivindicadas: mesclarMissoes(local, doServidor),
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

let timerFlush: TemporizadorCancelavel | null = null
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
  // PH-302: `agendarMesmoEmSegundoPlano`, e nao `setTimeout` direto. Com a aba
  // oculta o Chrome derruba os timers da thread principal pra ~1 por MINUTO
  // depois de 5 minutos escondida: o ritmo de 30s virava 60s e o teto de 90s
  // virava 120s, que e exatamente `LIMIAR_OFFLINE_SEGUNDOS` — dali pra cima o
  // servidor para de tratar a janela como jogo ao vivo, com a aba aberta e o
  // jogador dentro da hunt. Ver o modulo pro que o worker cobre e pro que ele
  // nao tem como cobrir (aba congelada).
  timerFlush = agendarMesmoEmSegundoPlano(intervaloAtual, () => {
    void liquidar().finally(() => {
      // `pararFlushPeriodico` durante o request em voo (sessao encerrada pelo
      // servidor, jogador saindo da hunt) bump'a a geracao — e ai nao ha
      // proximo.
      if (geracao === geracaoDoTimer) agendarProximoFlush()
    })
  })
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
  mapId: string, pokeUid: string, opcoes?: { avisarErro?: boolean; retomando?: boolean },
): Promise<{ ok: boolean; sala: SalaAtiva | null; clima?: ClimaTipo | null }> {
  // Sem servidor nao ha autoridade: `clima` sai AUSENTE (e nao `null`) pra o
  // motor derivar o dele — ver ProgressoDaSessao.clima (PH-140).
  if (!servidorAtivo()) return { ok: true, sala: null }
  try {
    // `retomando` (PH-266) so vem do boot, junto com `avisarErro: false` — sao
    // as duas metades da mesma condicao ("o jogador nao pediu isto"). Ver
    // features/game/bootDaSessao.ts.
    const resposta = await servidor.abrirSessao(mapId, pokeUid, opcoes?.retomando ?? false)
    pararFlushPeriodico()
    // Hunt nova comeca no piso: a primeira janela e quase sempre produtiva, e
    // herdar o intervalo esticado da hunt anterior faria o jogador entrar e
    // esperar 90s pelo primeiro credito.
    intervaloAtual = INTERVALO_FLUSH_MS
    agendarProximoFlush()
    observarQuotaDeSala()
    return { ok: true, sala: resposta.sala ?? null, clima: resposta.clima ?? null }
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
    aplicarEstadoDoServidor(r.estado, r.estadoParcial === true, r.resumo)
    // A sala do servidor manda. A simulacao local sorteia a propria (ela e
    // predicao e tem sequencia de sorteio propria), entao sem esta linha a
    // sala exibida seria um palpite — e o pool/loot que o jogador de fato
    // recebeu vieram da sala de la.
    // PH-140: o clima do LUGAR vem junto, pela mesma razao — o cliente nao tem
    // a semente pra derivar o dele.
    if (r.sala !== undefined) {
      // DIAGNOSTICO — relatado: sala as vezes avanca ao vivo sem o jogador ver
      // os 30 abates acontecerem, esporadico. Suspeita: o servidor resimula a
      // janela do flush pelo tempo REAL (`segundosCreditados`), que pode
      // cobrir mais tempo do que o client renderizou (aba em segundo plano
      // throttlando o loop) — mesma familia do bug de XP ja corrigido
      // (PH-171). So loga quando o cliente NAO tinha visto a quota fechar
      // localmente ainda (abates < 30) e mesmo assim a sala mudou.
      //
      // PH-196: era `pushToast(..., 'error')`, o que punha texto interno
      // ("[diag-sala] avancou sem quota local fechada", contagem de abates,
      // duracao da janela) na tela do jogador em producao, como erro. Vai pro
      // console: a hipotese ainda nao foi confirmada nem descartada, entao o
      // dado continua sendo coletado — so deixa de ser mensagem de jogo. Some
      // de vez quando a hipotese fechar.
      const antesDoFlush = useWorldStore.getState()
      const posicaoAntes = antesDoFlush.salaPendente ?? antesDoFlush.sala
      useWorldStore.getState().definirSala(r.sala, r.clima)
      const depoisDoFlush = useWorldStore.getState()
      const posicaoDepois = depoisDoFlush.salaPendente ?? depoisDoFlush.sala
      if (
        posicaoAntes && posicaoDepois && posicaoAntes.abates < ABATES_POR_SALA
        && (posicaoDepois.ciclos !== posicaoAntes.ciclos || posicaoDepois.indice !== posicaoAntes.indice)
      ) {
        console.warn(
          `[diag-sala] avancou sem quota local fechada: sala ${posicaoAntes.ciclos}/${posicaoAntes.indice}`
          + ` (abates locais ${posicaoAntes.abates}/${ABATES_POR_SALA}) -> ${posicaoDepois.ciclos}/${posicaoDepois.indice}.`
          + ` Janela do flush: ${r.segundosCreditados}s.`,
        )
      }
    }
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
  timerFlush?.cancelar()
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
//
// 30s, E NAO OS 5s ORIGINAIS — INSISTIR TRAVAVA A HUNT (PH-273).
//
// Cada pedido FECHA a janela de simulacao do servidor: ele credita o intervalo
// desde o ultimo flush, reconstroi o mundo com `buildMapWorld` (POKE de volta no
// ponto de entrada, inimigos recriados) e simula so aquele intervalo. Pedir de
// 5 em 5 segundos nao acelera o servidor — ele passa a viver de janelas de 5s,
// e janela de 5s nao paga nem a caminhada ate o alvo.
//
// Medido na conta de teste no jogo-dev em 2026-08-29, mesma sessao, lendo o
// resumo de cada resposta:
//
//   janela de   5s  ->  0 abates   (dezenas seguidas, `hp_atual` do protetor
//                                   parado em 72 por mais de 10 minutos)
//   janela de  35s  -> 10 abates, 415 de ouro, sala avancou
//   janela de  82s  -> 25 abates, 950 de ouro
//   janela de 111s  -> 24 abates, 6.880 de ouro, protetor morto
//
// Como a sala so avanca quando o protetor dela morre (PH-202/203) e quem tem que
// mata-lo e o servidor, o resultado era uma hunt parada em 30/30 pra sempre — o
// "nao passa da sala 2" do relato. Um livelock em que a pressa e a causa: quanto
// mais o cliente pedia, menor a janela e menos o servidor avancava.
//
// O custo de esperar o intervalo cheio e o que este pedido existia pra evitar
// (ate 30s com a barra cheia). Esse custo e real, e e MUITO menor que travar.
const REPETIR_PEDIDO_DE_SALA_MS = INTERVALO_FLUSH_MS
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
    // PH-177/179: toggle ligado, a quota fechada FICA fechada ate o jogador
    // clicar "Proximo Nivel" (avancarSalaManualmente). Sem este corte, o
    // observador martelaria `/sessao/flush` a cada 5s pra sempre — o motivo
    // original da repeticao (servidor pode estar 1-2 abates atras) e
    // transitorio; com avanco manual, "sala travada" passa a durar minutos.
    if (useGameStateStore.getState().autoToggles.avancoManualDeSala) return
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

/**
 * PH-179. Clique do jogador no botao "Proximo Nivel" (PH-180), sala travada
 * em 30/30 com o toggle de avanco manual ligado.
 *
 * Mesmo padrao de `abrirSessaoDeHunt`/`liquidar`: com sessao autoritativa,
 * chama o endpoint (PH-178) e aplica o estado que ele devolve — o cliente
 * nunca decide sozinho qual e a sala nova. Sem servidor (modo local), chama
 * a mesma funcao do motor direto no world local.
 */
export async function avancarSalaManualmente(): Promise<void> {
  if (!servidorAtivo()) {
    useWorldStore.getState().update((draft) => {
      if (draft.mapDef) solicitarAvancoDeSala(draft, draft.mapDef.id)
    })
    return
  }
  try {
    const r = await servidor.avancarSalaManual()
    aplicarEstadoDoServidor(r.estado, r.estadoParcial === true, r.resumo)
    if (r.sala !== undefined) useWorldStore.getState().definirSala(r.sala, r.clima)
    tratarEncerramento(r.sessaoEncerrada)
    if (r.truncado) {
      useToastStore.getState().pushToast(
        'Voce ficou fora tempo demais — parte do periodo nao foi creditada.', 'error', 'world',
      )
    }
    // `false`: a sala ja nao estava mais travada quando o servidor processou
    // (corrida rara — outro flush avancou primeiro). Nao e erro, so nao ha
    // sala nova pra mostrar; o toast evita um clique "mudo" sem explicacao.
    if (!r.avancoAplicado) {
      useToastStore.getState().pushToast('A sala ja tinha avancado.', 'info', 'world')
    }
  } catch (erro) {
    reportarErro(erro)
  }
}

// Intervalo minimo entre dois commits FORCADOS (level-up, aba sendo ocultada).
// Sem ele, um POKE de nivel baixo — que sobe de nivel a cada poucos abates —
// dispararia uma chamada de rede por segundo.
const INTERVALO_MINIMO_COMMIT_MS = 5000
let ultimoCommit = 0
// Trailing edge do debounce acima — achado revisando o proprio bug que este
// arquivo documenta ("dou F5 e perco niveis"): o guard so tinha leading edge
// (`return` puro dentro da janela), sem agendar nada pro fim dela. Um SEGUNDO
// level-up a menos de 5s do primeiro (comum: POKE de nivel baixo, ou um abate
// que cruza varios niveis de uma vez via `grantExp`) era descartado em
// silencio — nada ficava agendado pra cobrir aquele ganho, e o jogador so
// reconciliava no proximo gatilho normal (timer de 30s, /acao, mercado,
// visibilitychange). Um F5 antes disso lia o ultimo estado persistido, sem
// aquele nivel — exatamente o bug relatado, so que na FRESTA que o fix
// original nao fechava. Sem parametro de proposito: o commit agendado le o
// estado NA HORA que dispara, entao ja cobre qualquer level-up que tenha
// acontecido no meio da espera, nao so o que a disparou.
let commitAgendado: ReturnType<typeof setTimeout> | null = null

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
  const restante = INTERVALO_MINIMO_COMMIT_MS - (agora - ultimoCommit)
  if (restante > 0) {
    // Ja tem um commit agendado pro fim desta janela — nao duplica o timer,
    // ele ja vai cobrir este level-up (e qualquer outro que aconteca antes
    // de disparar) igual.
    if (commitAgendado == null) {
      commitAgendado = setTimeout(() => {
        commitAgendado = null
        void commitAgora()
      }, restante)
    }
    return
  }
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
    if (r.estado) aplicarEstadoDoServidor(r.estado, r.estadoParcial === true, r.resumo)
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
 * A config de LURE, em CHAMADA PROPRIA — e nao mais uma chave no patch de
 * `sincronizarAuto` acima.
 *
 * O motivo e a forma da RPC, nao organizacao: `configurar_auto` valida por
 * chave conhecida e uma chave que ela nao reconhece derruba a TRANSACAO INTEIRA
 * (ver o comentario da migration 20260826180000, que existe por causa disso).
 * Enquanto a migration que ensina `lureConfig` a ela nao estiver aplicada num
 * ambiente, mandar a chave junto do resto trocaria "a config de lure nao salva"
 * por "NENHUMA automacao salva" — auto-catch, auto-pot, auto-venda e regras por
 * especie caem com ela, todas em silencio, porque o `catch` aqui e um
 * `reportarErro` e nao um bloqueio de tela.
 *
 * Isso valeria pra qualquer chave nova daqui pra frente, entao a separacao fica
 * mesmo depois do deploy: dois grupos de config independentes nao tem motivo pra
 * compartilhar uma transacao tudo-ou-nada.
 */
export function sincronizarLure(): void {
  if (!servidorAtivo()) return
  const s = useGameStateStore.getState()
  void executarAcaoRpc({
    tipo: 'configurarAuto',
    patch: { lureConfig: s.lureConfig },
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
    // DUAS requests, pela mesma razao que `sincronizarLure` existe separada: se
    // a chave `lureConfig` for recusada pelo ambiente, ela nao pode levar a
    // config das outras automacoes junto no unload — que e exatamente o momento
    // em que ninguem ve o erro.
    postConfigurarAuto(token, patch)
    postConfigurarAuto(token, { lureConfig: s.lureConfig })
  })
}

/** POST cru em `configurar_auto` com `keepalive` — ver `sincronizarAutoAoSair`. */
function postConfigurarAuto(token: string, patch: Record<string, unknown>): void {
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
    if (r.estado) aplicarEstadoDoServidor(r.estado, r.estadoParcial === true, r.resumo)
    return r.resumo ?? null
  } catch (erro) {
    reportarErro(erro)
    return null
  }
}
