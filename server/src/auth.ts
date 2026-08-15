// Quem e o jogador que mandou este request.
//
// A verificacao e feita PERGUNTANDO AO SUPABASE (`GET /auth/v1/user` com o
// token do jogador), e nao decodificando o JWT localmente. Custa uma ida de
// rede por token novo, e essa e a troca consciente:
//
//  - decodificar local exige guardar o segredo de assinatura aqui e acertar
//    algoritmo, `aud`, `exp`, rotacao de chave e revogacao. Errar qualquer um
//    desses e uma falha de autenticacao silenciosa — o tipo de bug que so
//    aparece quando alguem ja entrou na conta de outro;
//  - perguntar ao Supabase respeita revogacao e logout na hora, de graca.
//
// POR TOKEN NOVO, e nao por request: ver o cache abaixo.
import { ErroHttp, type Config } from './db.js'

export interface Jogador {
  id: string
  email: string | null
}

/**
 * Cache de verificacao, por token.
 *
 * Medido em producao (pg_stat_statements, janela de 8 dias): ~44 mil chamadas
 * de `GET /auth/v1/user` contra ~1.065 transacoes de escrita do Auth (login,
 * cadastro, refresh — o trafego legitimo). Ou seja 97% do que o servico de Auth
 * fazia era reverificar o MESMO token: o cliente liquida a sessao de hunt a
 * cada 30s (INTERVALO_FLUSH_MS), e cada flush pagava uma ida de rede completa
 * pra reconfirmar um token que nao mudou.
 *
 * O TTL e o unico parametro de seguranca aqui: ele e a JANELA em que um logout,
 * um ban ou uma revogacao ainda deixam o token passar. Expiracao normal NAO
 * depende disto — o gateway das Edge Functions valida assinatura e `exp` antes
 * do handler rodar (`verify_jwt`, ligado por padrao no `functions deploy`), e o
 * `exp` do proprio token ainda corta o cache mais cedo quando falta menos de
 * 5 min pra ele vencer.
 *
 * 5 minutos: derruba ~90% das chamadas (10 flushes por janela viram 1) e e
 * curto o bastante pra um banimento morder antes de o jogador terminar a
 * proxima cacada. Nao aumentar sem decidir que atraso de revogacao e aceitavel.
 */
const TTL_MS = 5 * 60 * 1000

/**
 * Teto de tokens guardados. O isolate da Edge Function vive minutos ou horas e
 * atende varios jogadores; sem teto, um pico de trafego deixaria um Map
 * crescendo ate o limite de memoria da invocacao. Com 200 cabe a base de
 * jogadores inteira com folga, e o descarte abaixo e o mais simples que
 * funciona (limpa vencidos; se ainda estourar, zera).
 */
const MAX_ENTRADAS = 200

// A entrada guarda a PROMESSA, nao o valor: dois requests do mesmo jogador que
// chegam juntos (flush + carregamento de tela) compartilham uma unica ida de
// rede em vez de disparar duas. Promessa rejeitada e removida na hora, pra uma
// falha de rede nao virar 401 grudado por 5 minutos.
interface Entrada {
  jogador: Promise<Jogador>
  expiraEm: number
}

const cache = new Map<string, Entrada>()

/** Exposto so pra teste: o cache e estado de modulo e vaza entre casos. */
export function limparCacheDeAutenticacao(): void {
  cache.clear()
}

function podar(agora: number): void {
  for (const [token, entrada] of cache) {
    if (entrada.expiraEm <= agora) cache.delete(token)
  }
  if (cache.size >= MAX_ENTRADAS) cache.clear()
}

/**
 * Quando o cache pode valer, no maximo.
 *
 * Le o `exp` do JWT SEM verificar assinatura — e seguro porque o valor so pode
 * ENCURTAR a validade (o `Math.min` com o TTL), nunca estende-la. Um `exp`
 * forjado gigante cai no TTL; um `exp` proximo faz o cache morrer junto com o
 * token, em vez de manter vivo um token que o gateway ja vai recusar.
 */
function validoAte(token: string, agora: number): number {
  const teto = agora + TTL_MS
  const partes = token.split('.')
  if (partes.length !== 3) return teto
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    if (typeof payload.exp !== 'number') return teto
    return Math.min(teto, payload.exp * 1000)
  } catch {
    // Payload ilegivel nao e motivo pra recusar o request: quem decide se o
    // token presta e o `/auth/v1/user` logo abaixo. So perdemos o corte extra.
    return teto
  }
}

async function consultarSupabase(cfg: Config, token: string): Promise<Jogador> {
  // A `apikey` aqui e a service_role so pra o gateway aceitar a chamada; quem
  // identifica o usuario e o Bearer com o token DELE. Nao trocar a ordem: usar
  // a service_role como Bearer devolveria um usuario de servico, nao o jogador.
  const resposta = await fetch(`${cfg.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: cfg.serviceRoleKey, Authorization: `Bearer ${token}` },
  })
  if (!resposta.ok) throw new ErroHttp(401, 'sessao invalida ou expirada')

  const corpo = (await resposta.json()) as { id?: string; email?: string | null }
  if (!corpo?.id) throw new ErroHttp(401, 'sessao sem usuario')
  return { id: corpo.id, email: corpo.email ?? null }
}

export async function autenticar(cfg: Config, req: Request): Promise<Jogador> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ErroHttp(401, 'faltou o token de sessao')

  const agora = Date.now()
  const emCache = cache.get(token)
  if (emCache && emCache.expiraEm > agora) return emCache.jogador

  podar(agora)

  const entrada: Entrada = {
    // O `catch` nao engole nada — remove a entrada e relanca, pra quem chamou
    // continuar recebendo o 401/erro de rede. Sem ele, uma falha viraria uma
    // promessa rejeitada GUARDADA no Map, que o Deno/Node reporta como
    // unhandled rejection.
    //
    // Confere a identidade antes de apagar: se um request posterior ja trocou a
    // entrada deste token, apagar aqui derrubaria um cache valido do vizinho.
    jogador: consultarSupabase(cfg, token).catch((erro: unknown) => {
      if (cache.get(token) === entrada) cache.delete(token)
      throw erro
    }),
    expiraEm: validoAte(token, agora),
  }
  cache.set(token, entrada)
  return entrada.jogador
}
