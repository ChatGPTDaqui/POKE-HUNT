// Puxa erros dos logs nativos do Supabase (edge_logs e postgres_logs) via
// Management API e grava cada um em {schema}.audit_logs, fonte='log-puller'.
// Disparo por pg_cron (fora do escopo deste arquivo) -- aqui so a logica de
// uma execucao isolada: pega o cursor, consulta, insere, avanca o cursor.
//
// Standalone (sem bundler, sem deno.json): supabase-js vem direto de esm.sh,
// que o Deno resolve nativamente por URL. Diferente de `jogo/index.ts`, que
// fala com o PostgREST via fetch cru pra ficar portavel entre Deno e Node --
// aqui isso nao importa (essa funcao so roda como Edge Function), entao
// supabase-js reduz boilerplate sem custo real.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Injetadas automaticamente pela plataforma -- mesmo padrao de `jogo/index.ts`.
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Secrets manuais (o usuario configura depois, ver instrucoes do proprio
// pedido). Erro claro na hora, nao um `undefined` silencioso virando
// `Bearer undefined` numa chamada de rede.
//
// NAO comeca com SUPABASE_: prefixo reservado pela plataforma, `supabase
// secrets set` recusa (mesmo achado real de `jogo/index.ts`, 2026-08-13).
const managementPat = Deno.env.get('LOG_PULLER_MANAGEMENT_PAT')
const projectRef = Deno.env.get('LOG_PULLER_PROJECT_REF')

const ID_CURSOR = 'log-puller'
const JANELA_TRAVA_MS = 2 * 60 * 1000 // 2 minutos -- mesmo valor do lock otimista da tabela.
// Teto real da Management API e 24h por chamada; fica 5 min abaixo por
// margem de seguranca (relogio, arredondamento do "rounded to the nearest
// minute" que a doc menciona).
const JANELA_MAXIMA_CONSULTA_MS = 23 * 60 * 60 * 1000 + 55 * 60 * 1000
const LIMITE_LINHAS_POR_CONSULTA = 1000

type SchemaAlvo = 'dev' | 'public'

interface RegistroAuditoria {
  fonte: 'log-puller'
  rota: string | null
  user_id: string | null
  nivel: string
  mensagem: string
  contexto: Record<string, unknown>
  ocorrido_em: string
}

interface RegistroComSchema {
  schema: SchemaAlvo
  registro: RegistroAuditoria
}

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Decodifica so o PAYLOAD do JWT (segundo segmento, base64url), sem checar
// assinatura -- nao esta autenticando nada aqui, so lendo um claim de um log
// que ja aconteceu. Qualquer coisa que nao parsear vira null, nunca derruba
// o processamento do evento.
function decodificarClaimsJwt(valorAuthorizationHeader: string | null | undefined): Record<string, unknown> | null {
  if (!valorAuthorizationHeader) return null
  try {
    const partes = valorAuthorizationHeader.trim().split(' ')
    const token = partes.length === 2 ? partes[1] : partes[0]
    if (!token) return null
    const segmentos = token.split('.')
    if (segmentos.length < 2) return null
    const base64Padrao = segmentos[1].replace(/-/g, '+').replace(/_/g, '/')
    const comPadding = base64Padrao + '='.repeat((4 - (base64Padrao.length % 4)) % 4)
    const json = atob(comPadding)
    const claims = JSON.parse(json)
    return claims && typeof claims === 'object' ? claims : null
  } catch {
    return null
  }
}

// role='authenticated' -> sub e o user_id real. role='anon'/'service_role'
// (chave publica/service key, nao usuario) ou qualquer falha de parse -> null.
function extrairUserId(valorAuthorizationHeader: string | null | undefined): string | null {
  const claims = decodificarClaimsJwt(valorAuthorizationHeader)
  if (!claims) return null
  if (claims.role === 'authenticated' && typeof claims.sub === 'string' && claims.sub) {
    return claims.sub
  }
  return null
}

// Accept-Profile (leitura) / Content-Profile (escrita) -- mesmo mecanismo de
// `src/lib/supabase.ts` no client. Content-Profile primeiro porque um erro
// de escrita e mais provavel de ter os dois headers preenchidos com o mesmo
// valor, e escrita e o caso mais sensivel pra saber o schema certo.
// Sem nenhum dos dois presentes no log -> 'public', o default do PostgREST.
function resolverSchema(headerAcceptProfile: string | null | undefined, headerContentProfile: string | null | undefined): SchemaAlvo {
  const valor = (headerContentProfile || headerAcceptProfile || '').trim().toLowerCase()
  return valor === 'dev' ? 'dev' : 'public'
}

// SQL em dialeto ClickHouse (tabela unica `logs`, filtrada por `source`,
// campos estruturados em `log_attributes['chave.pontuada']`). E o dialeto
// documentado como corrente pro Log Explorer/Management API hoje -- a doc de
// debugging ainda mostra um exemplo antigo em sintaxe BigQuery
// (`cross join unnest(metadata)`) contra este mesmo endpoint `logs.all`, mas
// isso e resquicio de doc desatualizada: o guia de query (fonte da verdade)
// e explicito que ClickHouse e o motor padrao e que a sintaxe antiga esta
// deprecada. Cursor entra como filtro extra (`timestamp > cursor`) alem da
// janela de tempo mandada nos params `iso_timestamp_start/end` da chamada.
function sqlEdgeLogs(cursorIso: string): string {
  return `SELECT
  timestamp,
  event_message,
  log_attributes['request.method'] AS method,
  log_attributes['request.path'] AS path,
  log_attributes['response.status_code'] AS status_code,
  log_attributes['request.headers.authorization'] AS authorization_header,
  log_attributes['request.headers.accept_profile'] AS accept_profile_header,
  log_attributes['request.headers.content_profile'] AS content_profile_header
FROM logs
WHERE source = 'edge_logs'
  AND timestamp > '${cursorIso}'
  AND toInt32OrZero(log_attributes['response.status_code']) >= 400
ORDER BY timestamp ASC
LIMIT ${LIMITE_LINHAS_POR_CONSULTA}`
}

// Severidades filtradas conforme o proprio guia de logs do Supabase
// (ERROR|FATAL|PANIC) -- e o unico conjunto confirmado na doc pesquisada.
function sqlPostgresLogs(cursorIso: string): string {
  return `SELECT
  timestamp,
  event_message,
  log_attributes['parsed.error_severity'] AS error_severity,
  log_attributes['parsed.sql_state_code'] AS sql_state_code
FROM logs
WHERE source = 'postgres_logs'
  AND timestamp > '${cursorIso}'
  AND match(log_attributes['parsed.error_severity'], 'ERROR|FATAL|PANIC')
ORDER BY timestamp ASC
LIMIT ${LIMITE_LINHAS_POR_CONSULTA}`
}

// Retorna null em falha de rede/HTTP (trata como erro fatal da rodada --
// quem chama decide abortar) e [] quando a chamada respondeu ok mas nao veio
// nenhuma linha reconhecivel. Formato de resposta do endpoint nao esta
// documentado explicitamente (a doc so diz "200: No description"), entao
// aceita tanto `{ result: [...] }` quanto um array bruto na raiz.
async function consultarManagementApiLogs(
  sql: string,
  inicioIso: string,
  fimIso: string,
): Promise<Array<Record<string, unknown>> | null> {
  const url = new URL(`https://api.supabase.com/v1/projects/${projectRef}/analytics/endpoints/logs.all`)
  url.searchParams.set('sql', sql)
  url.searchParams.set('iso_timestamp_start', inicioIso)
  url.searchParams.set('iso_timestamp_end', fimIso)

  try {
    const resposta = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${managementPat}` },
    })
    if (!resposta.ok) {
      const corpoErro = await resposta.text().catch(() => '')
      console.error(`log-puller: Management API respondeu ${resposta.status}`, corpoErro)
      return null
    }
    const corpo = await resposta.json().catch(() => null)
    if (Array.isArray(corpo)) return corpo
    if (corpo && Array.isArray((corpo as { result?: unknown }).result)) {
      return (corpo as { result: Array<Record<string, unknown>> }).result
    }
    console.error('log-puller: formato de resposta inesperado da Management API', corpo)
    return []
  } catch (erro) {
    console.error('log-puller: falha de rede consultando a Management API', erro)
    return null
  }
}

function paraRegistroEdgeLogs(linha: Record<string, unknown>): RegistroComSchema {
  const caminho = typeof linha?.path === 'string' && linha.path ? linha.path : null
  const statusCode = linha?.status_code ?? null
  const metodo = linha?.method ?? null
  const authorizationHeader = typeof linha?.authorization_header === 'string' ? linha.authorization_header : null
  const acceptProfileHeader = typeof linha?.accept_profile_header === 'string' ? linha.accept_profile_header : null
  const contentProfileHeader = typeof linha?.content_profile_header === 'string' ? linha.content_profile_header : null

  return {
    schema: resolverSchema(acceptProfileHeader, contentProfileHeader),
    registro: {
      fonte: 'log-puller',
      rota: caminho,
      user_id: extrairUserId(authorizationHeader),
      nivel: 'error',
      mensagem: typeof linha?.event_message === 'string' && linha.event_message ? linha.event_message : '(sem mensagem)',
      contexto: { status_code: statusCode, metodo, fonte_log: 'edge_logs' },
      ocorrido_em: String(linha?.timestamp ?? new Date().toISOString()),
    },
  }
}

// postgres_logs nao tem contexto HTTP: sem rota de API real (usa o literal
// 'postgres'), sem headers (schema sempre 'public', per instrucao explicita
// de default quando o header nao esta presente), sem user_id (o log so
// mostra a role de conexao do Postgres, ex: 'authenticator', nunca o
// auth.uid() do usuario final).
function paraRegistroPostgresLogs(linha: Record<string, unknown>): RegistroComSchema {
  const severidade = linha?.error_severity ?? null
  const sqlState = linha?.sql_state_code ?? null

  return {
    schema: 'public',
    registro: {
      fonte: 'log-puller',
      rota: 'postgres',
      user_id: null,
      nivel: 'error',
      mensagem: typeof linha?.event_message === 'string' && linha.event_message ? linha.event_message : '(sem mensagem)',
      contexto: { error_severity: severidade, sql_state_code: sqlState, fonte_log: 'postgres_logs' },
      ocorrido_em: String(linha?.timestamp ?? new Date().toISOString()),
    },
  }
}

// Timestamp mais recente entre o que ja tinhamos e o que acabou de ser visto
// -- nunca anda pra tras. Comparacao lexicografica de string ISO-8601 basta
// (mesmo formato, mesmo fuso) sem precisar parsear pra Date.
function maisRecente(a: string, b: string): string {
  return a > b ? a : b
}

async function inserirRegistros(supabase: SupabaseClient, registros: RegistroComSchema[]): Promise<void> {
  const porSchema = new Map<SchemaAlvo, RegistroAuditoria[]>()
  for (const { schema, registro } of registros) {
    const lista = porSchema.get(schema) ?? []
    lista.push(registro)
    porSchema.set(schema, lista)
  }

  for (const [schema, lista] of porSchema) {
    if (lista.length === 0) continue
    const { error } = await supabase.schema(schema).from('audit_logs').insert(lista)
    if (error) throw error
  }
}

Deno.serve(async (_req: Request) => {
  if (!managementPat) {
    return respostaJson({ erro: 'LOG_PULLER_MANAGEMENT_PAT nao configurado' }, 500)
  }
  if (!projectRef) {
    return respostaJson({ erro: 'LOG_PULLER_PROJECT_REF nao configurado' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let travaAdquirida = false
  let cursorAnterior: string | null = null
  let novoUltimoProcessado: string | null = null

  try {
    // Lock otimista: so avanca se ninguem estiver processando (ou se travou
    // ha mais de 2 minutos, sinal de execucao anterior morta sem cleanup).
    const limiteTravaAntiga = new Date(Date.now() - JANELA_TRAVA_MS).toISOString()
    const { data: linhasTrava, error: erroTrava } = await supabase
      .from('audit_logs_cursor')
      .update({ processando_desde: new Date().toISOString() })
      .eq('id', ID_CURSOR)
      .or(`processando_desde.is.null,processando_desde.lt.${limiteTravaAntiga}`)
      .select('ultimo_processado')

    if (erroTrava) throw erroTrava

    if (!linhasTrava || linhasTrava.length === 0) {
      return respostaJson({ pulado: true, motivo: 'outra execucao em andamento' }, 200)
    }

    travaAdquirida = true
    cursorAnterior = String(linhasTrava[0].ultimo_processado)
    novoUltimoProcessado = cursorAnterior

    // Janela de consulta obrigatoria da Management API (teto de 24h). Se o
    // cursor estiver mais velho que isso (cron parado por muito tempo), a
    // janela e truncada -- o filtro `timestamp > cursorAnterior` dentro do
    // SQL continua correto, so a busca em si comeca mais tarde que o cursor.
    const agora = new Date()
    let inicioConsulta = new Date(cursorAnterior)
    if (agora.getTime() - inicioConsulta.getTime() > JANELA_MAXIMA_CONSULTA_MS) {
      inicioConsulta = new Date(agora.getTime() - JANELA_MAXIMA_CONSULTA_MS)
    }
    if (inicioConsulta.getTime() >= agora.getTime()) {
      inicioConsulta = new Date(agora.getTime() - 60 * 1000)
    }
    const inicioIso = inicioConsulta.toISOString()
    const fimIso = agora.toISOString()

    const linhasEdge = await consultarManagementApiLogs(sqlEdgeLogs(cursorAnterior), inicioIso, fimIso)
    if (linhasEdge === null) throw new Error('falha ao consultar edge_logs na Management API')

    const linhasPostgres = await consultarManagementApiLogs(sqlPostgresLogs(cursorAnterior), inicioIso, fimIso)
    if (linhasPostgres === null) throw new Error('falha ao consultar postgres_logs na Management API')

    const registros: RegistroComSchema[] = [
      ...linhasEdge.map(paraRegistroEdgeLogs),
      ...linhasPostgres.map(paraRegistroPostgresLogs),
    ]

    // So calcula o candidato a novo cursor -- so vira `novoUltimoProcessado`
    // (o valor que o finally realmente grava) depois que o insert confirmar.
    // Se o insert falhar no meio (ex: schema dev grava, public quebra), o
    // cursor tem que continuar parado no valor antigo, senao a proxima
    // rodada pula linhas que nunca foram gravadas.
    let candidatoUltimoProcessado = cursorAnterior
    for (const linha of [...linhasEdge, ...linhasPostgres]) {
      const ts = linha?.timestamp
      if (typeof ts === 'string' && ts) {
        candidatoUltimoProcessado = maisRecente(candidatoUltimoProcessado, ts)
      }
    }

    if (registros.length > 0) {
      await inserirRegistros(supabase, registros)
    }

    novoUltimoProcessado = candidatoUltimoProcessado

    return respostaJson(
      {
        pulado: false,
        edge_logs_processados: linhasEdge.length,
        postgres_logs_processados: linhasPostgres.length,
        cursor_avancado_para: novoUltimoProcessado,
      },
      200,
    )
  } catch (erro) {
    console.error('log-puller: execucao falhou', erro)
    // Nao avanca o cursor em falha -- proxima rodada tenta a mesma janela de
    // novo. `novoUltimoProcessado` continua igual a `cursorAnterior` (ou
    // null, se a falha foi antes de adquirir a trava).
    return respostaJson({ erro: erro instanceof Error ? erro.message : String(erro) }, 500)
  } finally {
    if (travaAdquirida) {
      const { error: erroLiberar } = await supabase
        .from('audit_logs_cursor')
        .update({ processando_desde: null, ultimo_processado: novoUltimoProcessado })
        .eq('id', ID_CURSOR)
      if (erroLiberar) {
        console.error('log-puller: falha ao liberar a trava/avancar o cursor', erroLiberar)
      }
    }
  }
})
