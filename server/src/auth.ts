// Quem e o jogador que mandou este request.
//
// A verificacao e LOCAL: confere a assinatura do JWT com a chave PUBLICA do
// projeto (ES256 / JWKS). Nenhuma ida de rede por request.
//
// COMO CHEGAMOS AQUI (o caminho importa, porque duas abordagens obvias falham):
//
// 1. A versao original perguntava ao Supabase — `GET /auth/v1/user` a cada
//    request. Medido em producao com `pg_stat_statements` numa janela de 8 dias:
//    ~44 mil dessas verificacoes contra ~1.065 transacoes de escrita do Auth
//    (login, cadastro, refresh — o trafego legitimo). 97% do servico de Auth era
//    reverificar o MESMO token, porque o cliente liquida a sessao de hunt a cada
//    30s (INTERVALO_FLUSH_MS) e cada flush pagava a ida de rede inteira.
//
// 2. A primeira tentativa de conserto foi um cache por token em memoria. MEDIDO
//    EM PRODUCAO DEPOIS DO DEPLOY: 20 chamadas seguidas gastaram 21
//    verificacoes — zero acerto de cache. Estado de modulo NAO sobrevive entre
//    requests na Edge Function; cada invocacao pega um isolate limpo. Qualquer
//    solucao baseada em guardar coisa na memoria entre requests e inutil aqui, e
//    e o tipo de coisa que so aparece medindo depois de publicar.
//
// 3. Sobra verificar local. O projeto assina com chave ASSIMETRICA (ES256, veja
//    `alg` no cabecalho do token), entao o que este arquivo precisa e a chave
//    PUBLICA — que o Supabase publica em `/auth/v1/.well-known/jwks.json`. Nao
//    ha segredo pra guardar aqui, e foi justamente o medo de guardar segredo que
//    manteve a versao 1 por tanto tempo.
//
// O QUE SE PERDE: revogacao imediata. `GET /auth/v1/user` recusava na hora um
// token de quem deslogou ou foi banido; a verificacao local so para de aceitar
// quando o token expira (1h, `jwt_expiry` no config.toml). Hoje isso nao custa
// nada — nao existe coluna de ban em `players` e `auth.users.banned_until` esta
// zerado em toda a base. Se banimento entrar, o lugar de barrar e no
// carregamento do estado (todas as rotas ja leem a linha do jogador com a
// service_role, entao a checagem sai de graca), NAO voltando a pagar uma ida de
// rede por request.
import { ErroHttp, type Config } from './db.js'

export interface Jogador {
  id: string
  email: string | null
}

// So ES256. Fixar o algoritmo e o que fecha o ataque de confusao de algoritmo:
// sem isto, um token forjado com `"alg":"none"` (ou com HS256 usando a chave
// publica como segredo compartilhado) passaria pela mesma funcao de verificacao.
// O algoritmo NUNCA pode vir do token — o token e a parte nao confiavel.
const ALGORITMO = 'ES256'

// Tolerancia de relogio na expiracao. O gateway das Edge Functions ja recusa
// token vencido antes de chegar aqui; esta folga existe so pra um desalinho de
// alguns segundos entre maquinas nao virar 401 no ultimo tique de vida do token.
const FOLGA_DE_RELOGIO_S = 30

// Cache de chave por `kid`. Vale dentro de UMA invocacao (ver ponto 2 acima:
// nao ha estado entre requests). O que evita a busca de rede no caso normal e a
// `jwksJson` injetada por env — o cache aqui e so pra nao reimportar a chave se
// o mesmo isolate atender mais de um request, caso a plataforma passe a reusar.
const chaves = new Map<string, CryptoKey>()

interface Jwk { kid?: string; alg?: string; kty?: string; crv?: string; x?: string; y?: string }

function base64UrlParaBytes(s: string): Uint8Array {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

function base64UrlParaJson<T>(s: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlParaBytes(s))) as T
}

async function importar(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    jwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )
}

/**
 * A chave publica com este `kid`.
 *
 * Ordem: cache do isolate -> `jwksJson` do env -> busca no endpoint publico. A
 * busca so acontece quando o `kid` e desconhecido, que na pratica e uma vez por
 * ROTACAO de chave, nao por request. E isso e o que faz a rotacao ser segura sem
 * intervencao: se a chave girar e o env ficar velho, o `kid` novo nao esta la, e
 * o fallback resolve sozinho.
 */
async function chavePublica(cfg: Config, kid: string): Promise<CryptoKey> {
  const emCache = chaves.get(kid)
  if (emCache) return emCache

  const deEnv = cfg.jwksJson ? (JSON.parse(cfg.jwksJson) as { keys?: Jwk[] }).keys ?? [] : []
  const doEnv = deEnv.find((k) => k.kid === kid)
  if (doEnv) {
    const chave = await importar(doEnv)
    chaves.set(kid, chave)
    return chave
  }

  const resposta = await fetch(`${cfg.supabaseUrl}/auth/v1/.well-known/jwks.json`)
  if (!resposta.ok) throw new ErroHttp(503, 'nao foi possivel validar a sessao agora')
  const { keys } = (await resposta.json()) as { keys?: Jwk[] }
  const jwk = (keys ?? []).find((k) => k.kid === kid)
  // Token assinado por uma chave que o projeto nao publica: nao e nosso.
  if (!jwk) throw new ErroHttp(401, 'sessao invalida ou expirada')

  const chave = await importar(jwk)
  chaves.set(kid, chave)
  return chave
}

interface Payload {
  sub?: string
  email?: string | null
  exp?: number
  iss?: string
  aud?: string | string[]
}

export async function autenticar(cfg: Config, req: Request): Promise<Jogador> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ErroHttp(401, 'faltou o token de sessao')

  const partes = token.split('.')
  if (partes.length !== 3) throw new ErroHttp(401, 'sessao invalida ou expirada')

  let cabecalho: { alg?: string; kid?: string }
  let payload: Payload
  try {
    cabecalho = base64UrlParaJson(partes[0])
    payload = base64UrlParaJson(partes[1])
  } catch {
    throw new ErroHttp(401, 'sessao invalida ou expirada')
  }

  if (cabecalho.alg !== ALGORITMO || !cabecalho.kid) throw new ErroHttp(401, 'sessao invalida ou expirada')

  const chave = await chavePublica(cfg, cabecalho.kid)
  // A assinatura JWS de ES256 ja e R||S cru (64 bytes), que e exatamente o
  // formato que o Web Crypto espera pra ECDSA — nao ha DER pra desembrulhar.
  const assinatura = base64UrlParaBytes(partes[2])
  const assinado = new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, chave, assinatura, assinado)
  if (!ok) throw new ErroHttp(401, 'sessao invalida ou expirada')

  // Assinatura boa nao basta. Sem estas tres checagens, um token legitimo de
  // OUTRO proposito passaria: `exp` e o que faz o logout eventualmente valer,
  // `iss` impede um token de outro projeto Supabase, e `aud` impede que um token
  // de servico ou de outro publico seja lido como jogador.
  const agora = Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== 'number' || payload.exp + FOLGA_DE_RELOGIO_S < agora) {
    throw new ErroHttp(401, 'sessao invalida ou expirada')
  }
  if (payload.iss !== `${cfg.supabaseUrl}/auth/v1`) throw new ErroHttp(401, 'sessao invalida ou expirada')
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes('authenticated')) throw new ErroHttp(401, 'sessao invalida ou expirada')
  if (!payload.sub) throw new ErroHttp(401, 'sessao sem usuario')

  return { id: payload.sub, email: payload.email ?? null }
}

/** Exposto so pra teste: o cache de chaves e estado de modulo e vaza entre casos. */
export function limparCacheDeChaves(): void {
  chaves.clear()
}
