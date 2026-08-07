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

async function pedir<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ErroServidor(401, 'sem sessao — faca login de novo')

  const resposta = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const corpo = await resposta.json().catch(() => null)
  if (!resposta.ok) {
    throw new ErroServidor(resposta.status, corpo?.erro || `servidor respondeu ${resposta.status}`)
  }
  return corpo as T
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

export const servidor = {
  estado: () => pedir<RespostaComEstado>('/estado'),

  abrirSessao: (mapId: string, pokeUid: string) =>
    pedir<{ sessaoId: string; mapId: string }>('/sessao/abrir', {
      method: 'POST',
      body: JSON.stringify({ mapId, pokeUid }),
    }),

  flush: () => pedir<RespostaFlush>('/sessao/flush', { method: 'POST' }),

  fecharSessao: () => pedir<{ fechada: boolean; resumo?: RespostaFlush['resumo']; piso?: RespostaFlush['piso'] } & Partial<RespostaComEstado>>('/sessao/fechar', { method: 'POST' }),

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
