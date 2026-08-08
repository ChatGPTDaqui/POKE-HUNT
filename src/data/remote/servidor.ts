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
import type { OfflineSimSummary } from '@/engine/systems/offlineSimSystem'
import type { PokeInstance } from '@/data/pokes'

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
  if (!token) throw new ErroServidor(401, 'sem sessao — faca login de novo')

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
  if (status === 401 || status === 403) return 'sua sessao expirou — entre de novo'
  if (status === 429) return 'muitas chamadas seguidas — tente de novo em instantes'
  if (status === 502 || status === 503 || status === 504) return 'o servidor esta fora do ar no momento — tente de novo em instantes'
  if (status >= 500) return 'erro no servidor — tente de novo em instantes'
  return `servidor respondeu ${status}`
}

function mensagemDeRede(erro: unknown): string {
  if (erro instanceof DOMException && erro.name === 'AbortError') return 'o servidor demorou demais para responder'
  return 'sem conexao com o servidor — verifique sua internet'
}

// O estado do jogador, do jeito que o servidor o entende. Sempre que uma
// chamada devolve isto, o cliente SOBRESCREVE o local: ele e predicao, a
// verdade vem daqui.
export interface RespostaComEstado {
  estado: unknown
  mensagem?: string
}

export interface RespostaFlush extends RespostaComEstado {
  segundosCreditados: number
  truncado: boolean
  // O MESMO tipo que a simulacao local produz — o modal de Farm Offline le os
  // dois sem saber de onde vieram, porque o servidor roda exatamente o mesmo
  // `simulateWorldSeconds`.
  resumo: OfflineSimSummary
  // Se o piso de 50% da taxa online precisou completar o resultado. O relatorio
  // avisa em vez de so mostrar um numero maior que o combate pessimista rendeu.
  piso: { aplicado: boolean; ouroAdicionado: number; xpAdicionado: number }
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

export const servidor = {
  estado: () => pedir<RespostaComEstado>('/estado', { retentavel: true }),

  perfil: () => pedir<PerfilRemoto>('/perfil', { retentavel: true }),

  rankingTreinadores: (limite = 50) =>
    pedir<{ entradas: EntradaTreinador[] }>(`/ranking/treinadores?limite=${limite}`, { retentavel: true }),

  rankingPokemon: (criterio: CriterioPoke, limite = 50) =>
    pedir<{ entradas: EntradaPoke[] }>(`/ranking/pokemon?criterio=${criterio}&limite=${limite}`, { retentavel: true }),

  hallDaFama: (limite = 50) =>
    pedir<{ entradas: EntradaHall[] }>(`/ranking/hall?limite=${limite}`, { retentavel: true }),

  // Abrir sessao fecha a anterior e gera semente nova. Repetir depois de um
  // erro de rede geraria uma segunda sessao — sem duplicar ouro (so a mais
  // recente e flushada), mas descartando o intervalo da primeira.
  abrirSessao: (mapId: string, pokeUid: string) =>
    pedir<{ sessaoId: string; mapId: string }>('/sessao/abrir', {
      method: 'POST',
      body: JSON.stringify({ mapId, pokeUid }),
    }),

  flush: () => pedir<RespostaFlush>('/sessao/flush', { method: 'POST', retentavel: true, timeoutMs: TIMEOUT_FLUSH_MS }),

  fecharSessao: () => pedir<{ fechada: boolean; resumo?: RespostaFlush['resumo']; piso?: RespostaFlush['piso'] } & Partial<RespostaComEstado>>('/sessao/fechar', { method: 'POST', retentavel: true, timeoutMs: TIMEOUT_FLUSH_MS }),

  /**
   * Manda uma intencao. NUNCA um resultado: o cliente diz "quero comprar 5
   * pocoes", nao "meu ouro agora e X". Ver server/src/acoes.ts.
   */
  acao: (acao: { tipo: string } & Record<string, unknown>) =>
    pedir<RespostaComEstado & { ok: boolean }>('/acao', {
      method: 'POST',
      body: JSON.stringify(acao),
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
    })
  } catch {
    // Saindo da pagina: nao ha a quem reportar, e o proximo flush cobre o
    // intervalo de qualquer jeito porque o relogio de referencia esta no banco.
  }
}
