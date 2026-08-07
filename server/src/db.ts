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

async function pedir(cfg: Config, caminho: string, init: RequestInit): Promise<unknown> {
  const resposta = await fetch(`${cfg.supabaseUrl}/rest/v1/${caminho}`, init)
  const texto = await resposta.text()
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
    const resposta = await fetch(`${cfg.supabaseUrl}/rest/v1/${caminho}${juncao}`, {
      headers: cabecalhos(cfg, { Range: `${inicio}-${inicio + pagina - 1}`, Prefer: 'count=exact' }),
    })
    const texto = await resposta.text()
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

export async function apagar(cfg: Config, caminho: string): Promise<void> {
  await pedir(cfg, caminho, { method: 'DELETE', headers: cabecalhos(cfg, { Prefer: 'return=minimal' }) })
}
