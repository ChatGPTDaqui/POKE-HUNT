// Cliente do servico de autoridade.
//
// A CHAVE DE TUDO e `VITE_SERVIDOR_URL`:
//
//  - **sem a variavel** o jogo se comporta exatamente como antes — simula
//    localmente e escreve direto no Postgres. E o modo de desenvolvimento, e o
//    unico modo que funciona hoje sem subir o servico.
//  - **com a variavel** a autoridade e o servidor: o cliente para de escrever
//    progresso e passa a mandar INTENCAO. A simulacao local continua rodando,
//    mas so pra o jogo nao ficar parado na tela — os numeros de verdade sao os
//    que voltam do servidor.
//
// Foi feito como interruptor, e nao como troca definitiva, porque a hospedagem
// ainda nao foi decidida (ver CLAUDE.md, Fase D). Apontar a variavel pro
// servico e literalmente o unico passo que falta.
import { supabase } from '@/lib/supabase'
import { mensagemDeFalhaDeRede } from '@/lib/erroDeRede'
import type { OfflineSimSummary } from '@/engine/systems/offlineSimSystem'
import type { PokeInstance } from '@/data/pokes'
import type { ClimaTipo, ProtetorDaAutoridade, SalaAtiva } from '@/engine/types'

const BASE = (import.meta.env.VITE_SERVIDOR_URL || '').replace(/\/$/, '')

/** Se o jogo esta rodando sob autoridade do servidor. */
export function servidorAtivo(): boolean {
  return BASE.length > 0
}

export class ErroServidor extends Error {
  // Campo declarado no corpo, e nao como parametro-propriedade: o projeto usa
  // `erasableSyntaxOnly`, que proibe sintaxe que o TS precisa TRANSFORMAR em vez
  // de so apagar.
  status: number
  constructor(status: number, mensagem: string) {
    super(mensagem)
    this.status = status
  }
}

/**
 * Extrai tipo/codigo/mensagem real de um erro de catch pra reportar pro
 * admin — separado da mensagem amigavel que vira texto do toast/popup.
 */
export function detalheDeErro(erro: unknown): { tipo: string; codigo?: string | number; mensagemBackend?: string } {
  if (erro instanceof ErroServidor) {
    return { tipo: 'ErroServidor', codigo: erro.status, mensagemBackend: erro.message }
  }
  if (erro instanceof Error) {
    return { tipo: erro.name, mensagemBackend: erro.message }
  }
  return { tipo: 'desconhecido', mensagemBackend: String(erro) }
}

// Sem timeout, uma conexao que trava (wifi caindo, celular trocando de rede,
// Edge Function em cold start) deixa a promessa pendurada PRA SEMPRE: o
// jogador ve o jogo "parado" e nenhum erro. `AbortSignal.timeout` corta.
//
// O flush e o unico que pode demorar de verdade — ele simula ate 6h de jogo
// numa invocacao (medido: 1,6s ida e volta no pior caso), e um cold start da
// Edge Function soma alguns segundos por cima.
const TIMEOUT_PADRAO_MS = 15000
const TIMEOUT_FLUSH_MS = 45000

// Backoff entre tentativas. Curto de proposito: isto roda com o jogador
// olhando pra tela.
const ESPERA_ENTRE_TENTATIVAS_MS = [400, 1200]

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Falha que quase certamente NAO foi processada pelo servidor: ou nem chegou
// (erro de rede), ou o gateway recusou antes de rodar. 502 fica DE FORA de
// proposito — o nosso servidor responde 502 quando o Postgres falha, e isso
// pode ter acontecido no meio de uma escrita.
const STATUS_RETENTAVEIS = new Set([408, 425, 429, 503, 504])

function ehErroDeRede(erro: unknown): boolean {
  // `fetch` rejeita com TypeError quando nao houve resposta nenhuma (DNS,
  // conexao recusada, CORS, offline) e com AbortError no timeout.
  return erro instanceof TypeError || (erro instanceof DOMException && erro.name === 'AbortError')
}

interface OpcoesPedido extends RequestInit {
  /**
   * So marque como retentavel o que pode rodar duas vezes sem estragar nada.
   * `/estado` e leitura pura; `/sessao/flush` calcula o intervalo a partir de
   * `last_flush_at` no banco e grava ouro como valor ABSOLUTO, entao dois
   * flushes do mesmo intervalo convergem pro mesmo total (medido: 20 flushes
   * simultaneos = 1,03x). `/acao` NAO entra: "comprar 5 pocoes" duas vezes
   * compra dez.
   */
  retentavel?: boolean
  timeoutMs?: number
}

async function pedir<T>(caminho: string, { retentavel = false, timeoutMs = TIMEOUT_PADRAO_MS, ...init }: OpcoesPedido = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroServidor(401, 'sem sessão — faca login de novo')

  const tentativas = retentavel ? ESPERA_ENTRE_TENTATIVAS_MS.length + 1 : 1
  let ultimoErro: unknown

  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    if (tentativa > 0) await dormir(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1])
    try {
      const resposta = await fetch(`${BASE}${caminho}`, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...(init.headers || {}),
        },
      })
      const corpo = await resposta.json().catch(() => null)
      if (resposta.ok) return corpo as T

      const erro = new ErroServidor(resposta.status, corpo?.erro || mensagemPorStatus(resposta.status))
      if (!STATUS_RETENTAVEIS.has(resposta.status)) throw erro
      ultimoErro = erro
    } catch (erro) {
      if (erro instanceof ErroServidor) throw erro
      if (!ehErroDeRede(erro)) throw erro
      ultimoErro = new ErroServidor(0, mensagemDeRede(erro))
    }
  }

  throw ultimoErro
}

// Mensagem que diz o que fazer, em vez de "servidor respondeu 503". O jogador
// nao distingue "meu wifi caiu" de "o jogo quebrou" — e a diferenca muda o que
// ele deve tentar.
function mensagemPorStatus(status: number): string {
  if (status === 401 || status === 403) return 'sua sessão expirou — entre de novo'
  if (status === 429) return 'muitas chamadas seguidas — tente de novo em instantes'
  if (status === 502 || status === 503 || status === 504) return 'o servidor esta fora do ar no momento — tente de novo em instantes'
  if (status >= 500) return 'erro no servidor — tente de novo em instantes'
  return `servidor respondeu ${status}`
}

// Timeout tem causa propria (o servidor respondeu devagar, nao foi barrado); o
// resto cai na traducao compartilhada — ver lib/erroDeRede.ts pro porque de a
// mensagem citar bloqueador de anuncios.
function mensagemDeRede(erro: unknown): string {
  if (erro instanceof DOMException && erro.name === 'AbortError') return 'o servidor demorou demais para responder'
  return mensagemDeFalhaDeRede()
}

// O estado do jogador, do jeito que o servidor o entende. Sempre que uma
// chamada devolve isto, o cliente SOBRESCREVE o local: ele e predicao, a
// verdade vem daqui.
export interface RespostaComEstado {
  estado: unknown
  /**
   * `estado.bagPokes` NAO e a mochila do jogador — traz so o que aquela resposta
   * tem a dizer sobre ela (nada, em `/estado?parcial=1`; as capturas da janela,
   * num flush). Ver `aplicarEstadoDoServidor`.
   */
  estadoParcial?: boolean
  mensagem?: string
}

/**
 * Corpo fixo de `/sessao/flush` e `/sessao/fechar`: declara que ESTE cliente
 * sabe receber `estado` sem a mochila inteira dentro (ver `estadoParcial`).
 *
 * Existe como declaracao explicita, e nao como comportamento padrao do
 * servidor, por causa da janela de deploy: uma aba aberta antes desta versao
 * sobrescreveria a Mochila com a lista curta e ficaria mostrando mochila vazia
 * ate o F5. Corpo ausente = servidor responde do jeito antigo.
 */
const CORPO_PARCIAL = JSON.stringify({ parcial: true })

export interface RespostaFlush extends RespostaComEstado {
  segundosCreditados: number
  truncado: boolean
  /**
   * `estado.bagPokes` traz SO as capturas desta janela, nao a mochila inteira.
   * Sempre `true` com um cliente desta versao — o campo existe pra a resposta
   * ser auto-descritiva e pra um servidor antigo (que nao manda o campo) cair
   * no caminho de substituicao completa, que e o correto pra ele.
   */
  estadoParcial?: boolean
  // O MESMO tipo que a simulacao local produz — o modal de Farm Offline le os
  // dois sem saber de onde vieram, porque o servidor roda exatamente o mesmo
  // `simulateWorldSeconds`.
  resumo: OfflineSimSummary
  // Se o piso de 50% da taxa online precisou completar o resultado. O relatorio
  // avisa em vez de so mostrar um numero maior que o combate pessimista rendeu.
  piso: { aplicado: boolean; ouroAdicionado: number; xpAdicionado: number }
  /**
   * O servidor encerrou a cacada por conta propria (POKE desmaiado sem como
   * levantar). Nao e erro: e o unico jeito de o cliente descobrir que continuar
   * na hunt nao rende mais nada — a simulacao local seguiria desenhando combate
   * enquanto o servidor ja nao credita.
   */
  sessaoEncerrada?: 'desmaio' | null
  /**
   * A sala AUTORITATIVA da hunt. A simulacao local sorteia a propria (ela e
   * predicao, com sequencia de sorteio propria), e quem decidiu o pool de
   * especies e o loot que de fato foram creditados foi esta.
   *
   * Ausente (nao nula) quando o servidor e mais velho que este cliente.
   */
  sala?: SalaAtiva | null
  /**
   * O clima de AMBIENTE da sala acima (PH-140) — o do lugar, nunca o de golpe.
   *
   * Vem do servidor porque o cliente NAO tem a semente da sessao: ela decide
   * shiny, IV, raridade e crit e por isso nunca sai de la (ver core/rng.ts).
   * Sem este campo os dois lados derivariam climas diferentes, e o jogador
   * levaria dano de areia sob um ceu que a tela dele mostra limpo.
   *
   * Ausente (nao nula) quando o servidor e mais velho que este cliente: ai o
   * cliente mantem o clima que ja tem, em vez de assumir ceu limpo.
   */
  clima?: ClimaTipo | null
  /**
   * O PROTETOR da sala, do jeito que a autoridade o conhece (PH-475).
   *
   * Mesma razao de `sala` e `clima` logo acima, com consequencia maior. Sem
   * este campo o cliente sorteava o proprio chefe com a sequencia de predicao
   * dele: podia ser outra ESPECIE, e o HP dos dois nao se falava. O jogador
   * matava um chefe que o servidor nao contava ("matei o chefe e nada
   * aconteceu") e depois via a sala trocar no meio da luta contra o proximo
   * ("a sala trocou durante o chefe").
   *
   * Ausente (nao nula) quando o servidor e mais velho que este cliente: ai o
   * comportamento antigo continua valendo, com o cliente sorteando o proprio
   * depois do tempo de silencio.
   */
  protetor?: ProtetorDaAutoridade | null
}

/**
 * PH-178. Mesmo formato de `RespostaFlush` (o servidor simula o intervalo
 * normal antes de tentar o avanco) mais o resultado do proprio avanco.
 */
export interface RespostaAvancoDeSala extends RespostaFlush {
  /**
   * `false` quando a sala ja nao estava mais travada em 30/30 ao fim da
   * janela simulada (corrida rara: outro flush avancou primeiro) — nao e
   * erro, so nao havia sala nova pra aplicar.
   */
  avancoAplicado: boolean
}

// --- ranking e perfil -------------------------------------------------------
// Leitura pura, sempre retentavel. Os tipos espelham server/src/ranking.ts.

export type CriterioPoke = 'level' | 'atkFis' | 'atkEsp' | 'hp' | 'def' | 'defEsp' | 'speed'

export interface EntradaTreinador { userId: string; nome: string; nivel: number; exp: number }
export interface EntradaPoke {
  userId: string
  treinador: string
  treinadorOriginal: string | null
  valor: number
  /** POKE completo (mesmo formato do save) — alimenta o cartao de perfil. */
  poke: PokeInstance
}
export interface EntradaHall { userId: string; nome: string; conquistadoEm: string }
export interface PerfilRemoto {
  rank: number
  totalJogadores: number
  segundosJogados: number
  contaCriadaEm: string | null
  noHallDaFama: string | null
}

/**
 * O perfil de OUTRO jogador (PH-119).
 *
 * Tipo separado de `PerfilRemoto` de propósito, e não `PerfilRemoto & { nome }`:
 * o que pode ser visto de terceiro é uma decisão de privacidade, e ela precisa
 * de um lugar onde a lista inteira apareça de uma vez. Herdar faria um campo
 * novo em `PerfilRemoto` — que serve à tela de configuração do próprio jogador —
 * vazar para cá sem ninguém decidir.
 *
 * Nunca carrega carteira, mochila, e-mail nem o time. Ver a migration
 * `20260825030000_perfil_publico_public.sql`, que lista o porquê de cada campo.
 */
export interface PerfilPublico {
  userId: string
  nome: string
  nivel: number
  exp: number
  rank: number
  totalJogadores: number
  segundosJogados: number
  contaCriadaEm: string | null
  noHallDaFama: string | null
  capturas: number
  anunciosAtivos: number
}

// --- mercado, chat e social ------------------------------------------------
// Os tipos espelham server/src/mercado.ts e server/src/social.ts.

export interface NivelDePreco { unitPrice: number; quantity: number }

export interface OrdemMercado {
  id: string
  user_id: string
  item_id: string
  side: 'compra' | 'venda'
  unit_price: number
  quantity: number
  remaining: number
  gold_retido: number
  created_at: string
}

export interface AnuncioMercado {
  id: string
  seller_id: string
  poke_uid: string
  /** `null` em anuncio "somente lance": nao existe compra direta. */
  price: number | null
  apenas_oferta: boolean
  currency: 'gold' | 'diamond'
  species_id: string
  level: number
  rarity: string
  is_shiny: boolean
  iv_percent: number
  created_at: string
  /**
   * Leilão (PH-101). `'preco_fixo'` é o default no banco, então anúncio antigo
   * e resposta de servidor mais velho leem como preço fixo — que é o que eram.
   *
   * Leilão é sempre `apenas_oferta = true` e `price = null` (a check
   * `market_listings_preco_coerente` garante), então a tela distingue os dois
   * modos de lance por ESTE campo, não pela ausência de preço.
   */
  modo?: 'preco_fixo' | 'leilao'
  /** Só em leilão. Quando ele passa, o cron encerra na varredura seguinte. */
  expira_em?: string | null
  lance_minimo?: number | null
  incremento_minimo?: number | null
  vendedor?: string
  ofertas?: number
  melhorOferta?: number | null
  /**
   * Comprador para quem este anúncio está reservado (PH-437). Nulo é o normal.
   *
   * Anúncio reservado sai da vitrine de todo mundo menos do vendedor e do
   * próprio reservado — e `comprar_anuncio` recusa a compra de terceiro, que é
   * onde a regra vive de verdade: o id do anúncio circula (o card da conversa
   * carrega ele), então esconder da lista não impede chamada direta.
   */
  reservado_para?: string | null
  /** Nome de quem reservou. Só vem da view — a tabela guarda apenas o uuid. */
  reservado_nome?: string | null
}

export interface OfertaMercado {
  id: string
  listing_id: string
  buyer_id: string
  valor: number
  currency: 'gold' | 'diamond'
  status: 'pendente' | 'aceita' | 'recusada' | 'cancelada'
  created_at: string
  /**
   * Modo do anúncio em que o lance foi dado (PH-101), trazido pelo join.
   *
   * A tela precisa dele para não oferecer "Cancelar" num lance de leilão — que
   * o servidor recusa, porque lance de leilão vale até alguém cobrir. Sem o
   * campo, o botão existiria só para dar erro.
   */
  modo?: 'preco_fixo' | 'leilao'
  expira_em?: string | null
}

export interface OfertaRecebida extends OfertaMercado {
  comprador: string
  anuncio: AnuncioMercado | null
}

export interface NegocioMercado {
  id: string
  kind: 'item' | 'poke'
  item_id: string | null
  species_id: string | null
  quantity: number
  unit_price: number
  currency: 'gold' | 'diamond'
  created_at: string
  /**
   * Taxa cobrada do VENDEDOR nesta negociacao (PH-98), na moeda da linha.
   *
   * Opcional porque toda linha anterior ao PH-98 nao tem a coluna preenchida
   * (default 0) e porque uma resposta de servidor mais antigo simplesmente nao
   * traz o campo — a tela trata ausente e zero igual, "nao houve taxa".
   */
  taxa?: number | null
  comprador?: string | null
  vendedor?: string | null
  souComprador?: boolean
}

export interface ResumoItemMercado {
  itemId: string
  melhorCompra: number | null
  melhorVenda: number | null
  emVenda: number
  emCompra: number
}

export interface AnexoChat {
  kind: 'item' | 'poke'
  id: string
  nome: string
  quantidade?: number
  speciesId?: string
  level?: number
  rarity?: string
  isShiny?: boolean
  ivPercent?: number
}

export interface MensagemChat {
  id: string
  user_id: string
  trainer_name: string
  body: string
  anexos: AnexoChat[]
  created_at: string
}

export interface AnexoItemSocial {
  itemId: string
  quantity: number
}

/**
 * POKE anexado a uma mensagem (PH-164).
 *
 * E uma RECEITA, nao um POKE pronto: quem monta a instancia — e calcula os
 * stats a partir da base da especie — e `coletar_anexo_correio`, no banco. O
 * cliente so precisa disto pra MOSTRAR o que esta esperando coleta: a arte da
 * especie e o nivel. Congelar stats aqui os deixaria velhos entre o envio e a
 * coleta, e o POKE nasceria diferente de todo outro da mesma especie.
 */
export interface AnexoPokeSocial {
  speciesId: string
  level: number
  isShiny?: boolean
  rarity?: string
  ivs?: Record<string, number>
}

/**
 * Anúncio que originou a negociação (PH-435), COPIADO no instante do envio.
 *
 * É snapshot e não referência de propósito: `market_listings.status` vira
 * `vendido`/`cancelado`, e ler o anúncio ao vivo faria o card de uma conversa
 * de ontem mudar de preço sozinho — ou virar linha vazia depois da venda, que é
 * justamente quando o registro do que foi combinado passa a importar.
 *
 * `sellerId` viaja junto pro card saber de que lado da mesa o leitor está
 * ("anúncio seu" x "anúncio dele") sem precisar buscar nada.
 */
export interface ContextoAnuncioSocial {
  anuncioId: string
  sellerId: string
  speciesId: string
  level: number
  isShiny: boolean
  rarity: string
  ivPercent: number
  /** `null` em anúncio somente-lance e em leilão — os dois não têm preço fixo. */
  price: number | null
  currency: 'gold' | 'diamond'
  modo: 'preco_fixo' | 'leilao'
  apenasOferta: boolean
}

export interface MensagemSocial {
  id: string
  de_id: string | null
  de_nome: string
  tipo: 'texto' | 'pedido_amizade' | 'sistema'
  /**
   * NULO em mensagem de conversa (PH-81): conversa nao tem assunto, carta
   * tinha. Continua preenchido em aviso de sistema e pedido de amizade, que
   * sao avisos com titulo e nao um fio entre duas pessoas.
   */
  assunto: string | null
  corpo: string
  estado: 'pendente' | 'aceito' | 'recusado' | 'lido'
  created_at: string
  /** Itens anexados. Vazio na maioria das mensagens. */
  anexo_itens?: AnexoItemSocial[]
  /** POKE anexado (PH-164). Nulo em tudo que nao e recompensa de POKE. */
  anexo_poke?: AnexoPokeSocial | null
  /** Carimbo de coleta — presente significa "ja recebido". */
  anexo_coletado_em?: string | null
  /**
   * Anúncio que abriu a negociação (PH-435). Nulo na esmagadora maioria das
   * mensagens — só a PRIMEIRA de cada entrada pelo Mercado carrega.
   */
  contexto_anuncio?: ContextoAnuncioSocial | null
  /**
   * Exclusao e por lado e SOFT (PH-74): cada ponta some com a mensagem da
   * propria caixa sem tirar da outra. Por isso duas colunas em vez de um
   * `delete` ou de um unico booleano.
   */
  excluido_destinatario_em?: string | null
  excluido_remetente_em?: string | null
  para_id?: string
  /**
   * Nome de quem RECEBEU. Nao existe coluna pra isso (`de_nome` e desnormalizado
   * mas `para_nome` nao), entao o client resolve por `treinadores_publico` so na
   * caixa de enviados, que e a unica tela que precisa mostrar o destinatario.
   */
  para_nome?: string
}

export interface AmigoRemoto { userId: string; nome: string; nivel: number }

/** POKE que o amigo esta usando agora — so o suficiente pro card, sem stats. */
export interface PokeAtivoDoAmigo {
  speciesId: string
  nivel: number
  shiny: boolean
}

/**
 * Amigo com tudo que a lista precisa numa consulta so (RPC
 * `amigos_detalhados`). Junta o que antes exigiria 4 idas ao banco:
 * `treinadores_publico`, `game_sessions` (online), `pokemon_instances` (POKE
 * ativo) e a contagem de DM nao lida.
 */
export interface AmigoDetalhado extends AmigoRemoto {
  online: boolean
  pokeAtivo: PokeAtivoDoAmigo | null
  naoLidas: number
}

export interface BloqueadoRemoto { userId: string; nome: string }

/** Uma linha do fio de conversa privada entre dois amigos. */
export interface MensagemDM {
  id: string
  de_id: string
  para_id: string
  corpo: string
  created_at: string
  read_at: string | null
}

/**
 * Um CONTATO na lista de conversas (PH-81) — um registro por interlocutor, nao
 * por mensagem. Vem pronto da RPC `conversas`, que resolve num lugar so o que
 * a tela precisaria juntar de quatro: a ultima mensagem do fio, a contagem de
 * nao lidas, se ha anexo esperando coleta, e se o contato esta online.
 */
export interface ConversaResumo {
  userId: string
  nick: string
  ultimoTrecho: string
  ultimaEm: string
  /** Ultima do fio foi minha — a lista prefixa "Voce:" quando verdadeiro. */
  ultimaMinha: boolean
  naoLidas: number
  /** Quantas mensagens deste contato tem anexo ainda nao coletado. */
  anexosPendentes: number
  online: boolean
  bloqueado: boolean
}

// Ranking/perfil/mercado/chat/social saíram daqui na migração RPC-everything
// (ver acoesRpc.ts, mercadoRpc.ts, chatRealtime.ts, socialRealtime.ts,
// rankingRpc.ts) — só sessão continua HTTP, é a única coisa que ainda precisa
// da Edge Function (simulação real de combate, ver _Architecture.md).
export const servidor = {
  // `?parcial=1`: sem a mochila. O cliente a busca sozinho, direto no
  // PostgREST, quando abre uma tela que a usa (ver mochilaRemota.ts). Medido
  // numa conta de 456 POKEs: tirou 97,8% desta resposta.
  estado: () => pedir<RespostaComEstado>('/estado?parcial=1', { retentavel: true }),

  // Abrir sessao fecha a anterior e gera semente nova. Repetir depois de um
  // erro de rede geraria uma segunda sessao — sem duplicar ouro (so a mais
  // recente e flushada), mas descartando o intervalo da primeira.
  // A resposta traz a SALA INICIAL decidida pelo servidor (appSessao.ts#abrirSessao).
  // Sem ela o cliente construia o mundo com uma sala sorteada por ele, e o
  // sub-bioma trocava logo depois de entrar, quando a do servidor chegava.
  // `sala` ausente = servidor mais antigo, ou hunt sem sistema de salas.
  // `retomando` (PH-266): esta abertura e a REENTRADA do boot, e nao um clique
  // em "Entrar". Com ela o servidor herda a sala em que a hunt parou, em vez de
  // devolver o jogador pro ciclo 1, sala 1 — ver appSessao.ts#salaHerdada. A
  // flag declara a INTENCAO; quem valida (mesmo mapa, sessao fechada ha pouco)
  // e o servidor, e a sala herdada nunca vem do cliente.
  abrirSessao: (mapId: string, pokeUid: string, retomando = false) =>
    pedir<{ sessaoId: string; mapId: string; sala?: SalaAtiva | null; clima?: ClimaTipo | null }>('/sessao/abrir', {
      method: 'POST',
      body: JSON.stringify({ mapId, pokeUid, retomando }),
    }),

  flush: () => pedir<RespostaFlush>('/sessao/flush', {
    method: 'POST', retentavel: true, timeoutMs: TIMEOUT_FLUSH_MS, body: CORPO_PARCIAL,
  }),

  fecharSessao: () => pedir<
    { fechada: boolean; resumo?: RespostaFlush['resumo']; piso?: RespostaFlush['piso']; estadoParcial?: boolean }
    & Partial<RespostaComEstado>
  >('/sessao/fechar', {
    method: 'POST', retentavel: true, timeoutMs: TIMEOUT_FLUSH_MS, body: CORPO_PARCIAL,
  }),

  // PH-178. Sem `retentavel`: um retry automatico depois de a primeira
  // chamada ja ter avancado a sala pediria um SEGUNDO avanco — a sala
  // seguinte nao estaria mais travada, e `avancoAplicado: false` voltaria
  // sem erro nenhum, mas o clique do jogador teria pulado uma sala a mais
  // do que ele pediu.
  avancarSalaManual: () => pedir<RespostaAvancoDeSala>('/sessao/avancar-sala', {
    method: 'POST', timeoutMs: TIMEOUT_FLUSH_MS, body: CORPO_PARCIAL,
  }),
}

/**
 * Ultimo flush ao sair da pagina. `fetch` com `keepalive` em vez de
 * `sendBeacon` porque o beacon nao deixa mandar o header `Authorization` — foi
 * a mesma decisao tomada no adaptador de persistencia do save.
 */
export async function flushAoSair(): Promise<void> {
  if (!servidorAtivo()) return
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return
  try {
    await fetch(`${BASE}/sessao/flush`, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      // Ninguem le a resposta aqui, mas sem `parcial` o servidor monta o estado
      // COMPLETO pra responder — a leitura cara justamente no request que a
      // pagina dispara ao ser fechada.
      body: CORPO_PARCIAL,
    })
  } catch {
    // Saindo da pagina: nao ha a quem reportar, e o proximo flush cobre o
    // intervalo de qualquer jeito porque o relogio de referencia esta no banco.
  }
}
