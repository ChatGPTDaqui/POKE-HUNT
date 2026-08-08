// Acesso ao Postgres via PostgREST, com a `service_role`.
//
// A `service_role` IGNORA RLS por completo — e por isso que ela mora so aqui e
// no `.env` da raiz, nunca em nada com prefixo `VITE_` (isso iria dentro do
// bundle do navegador e daria acesso total ao banco a qualquer jogador).
//
// Uso `fetch` direto em vez de `@supabase/supabase-js` de proposito: o servico
// so faz select/upsert/delete simples, e assim o codigo roda igual em Node,
// Cloudflare Workers, Deno e Bun sem depender de nada — a escolha de
// hospedagem continua em aberto (ver CLAUDE.md, Fase D).

export interface Config {
  supabaseUrl: string
  serviceRoleKey: string
}

export class ErroHttp extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

function cabecalhos(cfg: Config, extras: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...extras,
  }
}

// Toda chamada daqui e IDEMPOTENTE: leitura, upsert de linha com chave fixa,
// delete por filtro, e PATCH que grava valor ABSOLUTO (nunca `gold = gold +
// x`). Por isso repetir e seguro — e necessario: o pooler do Supabase derruba
// conexao de vez em quando, e uma unica falha assim virava um 502 na cara do
// jogador ("falha ao falar com o banco") no meio de um flush.
const ESPERA_ENTRE_TENTATIVAS_MS = [200, 700]
// Sem timeout, um socket pendurado consome a invocacao inteira da Edge
// Function ate o limite dela — e o jogador so ve o jogo travado.
const TIMEOUT_MS = 10000

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

function ehFalhaTransitoria(status: number): boolean {
  // 408/425/429 e 5xx do lado do PostgREST/pooler. 4xx de verdade (400
  // constraint, 404 rota) nao melhoram repetindo.
  return status === 408 || status === 425 || status === 429 || status >= 500
}

async function buscarComRetry(cfg: Config, caminho: string, init: RequestInit): Promise<{ resposta: Response; texto: string }> {
  let ultimo: { resposta: Response; texto: string } | null = null
  for (let tentativa = 0; tentativa <= ESPERA_ENTRE_TENTATIVAS_MS.length; tentativa++) {
    if (tentativa > 0) await dormir(ESPERA_ENTRE_TENTATIVAS_MS[tentativa - 1])
    try {
      const resposta = await fetch(`${cfg.supabaseUrl}/rest/v1/${caminho}`, {
        ...init,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const texto = await resposta.text()
      if (resposta.ok || !ehFalhaTransitoria(resposta.status)) return { resposta, texto }
      console.error(`PostgREST ${resposta.status} em ${caminho} (tentativa ${tentativa + 1}): ${texto.slice(0, 400)}`)
      ultimo = { resposta, texto }
    } catch (erro) {
      // Sem resposta nenhuma (rede/timeout). Ultima tentativa: vira 502.
      console.error(`PostgREST inacessivel em ${caminho} (tentativa ${tentativa + 1}): ${String(erro).slice(0, 200)}`)
      if (tentativa === ESPERA_ENTRE_TENTATIVAS_MS.length) throw new ErroHttp(502, 'falha ao falar com o banco')
    }
  }
  if (!ultimo) throw new ErroHttp(502, 'falha ao falar com o banco')
  return ultimo
}

async function pedir(cfg: Config, caminho: string, init: RequestInit): Promise<unknown> {
  const { resposta, texto } = await buscarComRetry(cfg, caminho, init)
  if (!resposta.ok) {
    // Nunca repassar o corpo do PostgREST pro cliente: ele traz nome de coluna,
    // constraint e as vezes trecho de dado. Aqui vai pro log do servidor.
    console.error(`PostgREST ${resposta.status} em ${caminho}: ${texto.slice(0, 400)}`)
    throw new ErroHttp(502, 'falha ao falar com o banco')
  }
  return texto ? JSON.parse(texto) : null
}

export async function selecionar<T>(cfg: Config, caminho: string): Promise<T[]> {
  const dado = await pedir(cfg, caminho, { headers: cabecalhos(cfg) })
  return (dado ?? []) as T[]
}

/**
 * PostgREST corta em 1000 linhas por request SEM ERRO NENHUM (200 OK com dado
 * mutilado). Este projeto ja levou essa mordida no catalogo — ver "Gotchas
 * conhecidos" no CLAUDE.md. Aqui a defesa e a mesma: paginar por `Range` e
 * conferir o total contra o `Content-Range` que o servidor devolve.
 */
export async function selecionarTudo<T>(cfg: Config, caminho: string, pagina = 1000): Promise<T[]> {
  const juncao = caminho.includes('?') ? '&' : '?'
  const acumulado: T[] = []
  let inicio = 0
  for (;;) {
    const { resposta, texto } = await buscarComRetry(cfg, `${caminho}${juncao}`, {
      headers: cabecalhos(cfg, { Range: `${inicio}-${inicio + pagina - 1}`, Prefer: 'count=exact' }),
    })
    if (!resposta.ok) {
      console.error(`PostgREST ${resposta.status} em ${caminho}: ${texto.slice(0, 400)}`)
      throw new ErroHttp(502, 'falha ao falar com o banco')
    }
    const lote = JSON.parse(texto) as T[]
    acumulado.push(...lote)
    const contentRange = resposta.headers.get('content-range') // ex: "0-999/2025"
    const total = Number(contentRange?.split('/')[1])
    if (!Number.isFinite(total)) {
      throw new ErroHttp(502, `Content-Range ausente/ilegivel em ${caminho}: ${contentRange}`)
    }
    if (acumulado.length >= total || lote.length === 0) {
      if (acumulado.length !== total) {
        throw new ErroHttp(502, `paginacao incompleta em ${caminho}: ${acumulado.length} de ${total}`)
      }
      return acumulado
    }
    inicio += pagina
  }
}

export async function inserir<T>(cfg: Config, tabela: string, linhas: unknown, opcoes: { retornar?: boolean; upsert?: string } = {}): Promise<T[]> {
  const prefer = [
    opcoes.retornar ? 'return=representation' : 'return=minimal',
    opcoes.upsert ? 'resolution=merge-duplicates' : null,
  ].filter(Boolean).join(',')
  const query = opcoes.upsert ? `?on_conflict=${opcoes.upsert}` : ''
  const dado = await pedir(cfg, `${tabela}${query}`, {
    method: 'POST',
    headers: cabecalhos(cfg, { Prefer: prefer }),
    body: JSON.stringify(linhas),
  })
  return (dado ?? []) as T[]
}

export async function atualizar(cfg: Config, caminho: string, patch: unknown): Promise<void> {
  await pedir(cfg, caminho, {
    method: 'PATCH',
    headers: cabecalhos(cfg, { Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  })
}

/**
 * PATCH que devolve as linhas afetadas — e a base de todo compare-and-swap
 * deste servico.
 *
 * O servico e serverless: nao ha transacao aberta entre duas chamadas ao
 * PostgREST, entao "ler a ordem, decidir, gravar" e uma corrida sempre que dois
 * jogadores tocam o mesmo livro de ofertas. O padrao usado no Mercado e mandar
 * o valor ANTIGO no filtro (`&remaining=eq.7`) junto do novo no corpo: se
 * outra requisicao chegou primeiro, o filtro nao casa, a resposta volta VAZIA e
 * quem chamou sabe que perdeu a corrida — em vez de sobrescrever em silencio.
 *
 * Com `return=minimal` isso seria indistinguivel de sucesso, que e exatamente
 * o modo de falha que este helper existe pra evitar.
 */
export async function atualizarRetornando<T>(cfg: Config, caminho: string, patch: unknown): Promise<T[]> {
  const dado = await pedir(cfg, caminho, {
    method: 'PATCH',
    headers: cabecalhos(cfg, { Prefer: 'return=representation' }),
    body: JSON.stringify(patch),
  })
  return (dado ?? []) as T[]
}

/**
 * Chama uma funcao do Postgres via `POST /rest/v1/rpc/<nome>`.
 *
 * Usado onde a pergunta e do BANCO e nao cabe num filtro: o unico caso hoje e
 * "este nome de treinador esta livre?", que compara por `lower(trainer_name)`.
 * Fazer isso com `ilike` daria falso positivo — `_` e curinga de uma letra em
 * LIKE, e `_` e um caractere valido de nick, entao "ash_1" apareceria como
 * ocupado por causa de um "ashX1" de outra pessoa.
 */
export async function chamarRpc<T>(cfg: Config, nome: string, argumentos: unknown): Promise<T> {
  const dado = await pedir(cfg, `rpc/${nome}`, {
    method: 'POST',
    headers: cabecalhos(cfg),
    body: JSON.stringify(argumentos),
  })
  return dado as T
}

export async function apagar(cfg: Config, caminho: string): Promise<void> {
  await pedir(cfg, caminho, { method: 'DELETE', headers: cabecalhos(cfg, { Prefer: 'return=minimal' }) })
}
