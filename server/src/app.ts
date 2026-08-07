// O servico, como um handler `fetch(Request) => Response`.
//
// Por que essa forma e nao Fastify: um Worker do Cloudflare E exatamente
// `export default { fetch }`, e o Node 22 tem `Request`/`Response` nativos —
// entao o mesmo arquivo roda nos dois sem camada de compatibilidade. A escolha
// de hospedagem continua aberta (ver CLAUDE.md, Fase D) e este desenho e o que
// mantem ela aberta de graca. Sao 4 rotas; framework nao pagaria seu custo.
import { autenticar } from './auth.js'
import { ErroHttp, selecionar, inserir, atualizar, type Config } from './db.js'
import { aplicarFlush, carregarEstado, type LinhaSessao } from './progresso.js'
import { MAPS, randomSeed } from '#engine'

function json(dado: unknown, status = 200): Response {
  return new Response(JSON.stringify(dado), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

// O jogo e servido de outra origem (o app Vite), entao precisa de CORS. A lista
// de origens permitidas e explicita: `*` com `Authorization` liberado deixaria
// qualquer site do mundo chamar isto com o token do jogador.
function corsHeaders(origem: string | null, permitidas: string[]): Record<string, string> {
  if (!origem || !permitidas.includes(origem)) return {}
  return {
    'access-control-allow-origin': origem,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-max-age': '86400',
  }
}

export interface OpcoesApp extends Config {
  origensPermitidas: string[]
}

export function criarApp(cfg: OpcoesApp) {
  return async function handler(req: Request): Promise<Response> {
    const cors = corsHeaders(req.headers.get('origin'), cfg.origensPermitidas)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    const url = new URL(req.url)
    let resposta: Response
    try {
      resposta = await rotear(cfg, req, url)
    } catch (erro) {
      if (erro instanceof ErroHttp) {
        resposta = json({ erro: erro.message }, erro.status)
      } else {
        // Erro nao previsto nao vaza detalhe pro cliente (stack trace conta
        // estrutura interna). Vai inteiro pro log do servidor.
        console.error('erro nao tratado:', erro)
        resposta = json({ erro: 'erro interno' }, 500)
      }
    }
    for (const [k, v] of Object.entries(cors)) resposta.headers.set(k, v)
    return resposta
  }
}

async function rotear(cfg: OpcoesApp, req: Request, url: URL): Promise<Response> {
  if (url.pathname === '/saude') return json({ ok: true })

  // Toda rota abaixo exige um jogador autenticado.
  const jogador = await autenticar(cfg, req)

  if (url.pathname === '/sessao/abrir' && req.method === 'POST') {
    return abrirSessao(cfg, jogador.id, req)
  }
  if (url.pathname === '/sessao/flush' && req.method === 'POST') {
    return flush(cfg, jogador.id)
  }
  if (url.pathname === '/sessao/fechar' && req.method === 'POST') {
    return fechar(cfg, jogador.id)
  }
  if (url.pathname === '/estado' && req.method === 'GET') {
    return json({ estado: await carregarEstado(cfg, jogador.id) })
  }
  return json({ erro: 'rota desconhecida' }, 404)
}

async function sessaoAberta(cfg: Config, userId: string): Promise<LinhaSessao | null> {
  const linhas = await selecionar<LinhaSessao>(
    cfg,
    `game_sessions?user_id=eq.${userId}&closed_at=is.null&select=*&order=started_at.desc&limit=1`,
  )
  return linhas[0] ?? null
}

async function abrirSessao(cfg: Config, userId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { mapId?: string; pokeUid?: string } | null
  const mapId = corpo?.mapId
  const pokeUid = corpo?.pokeUid
  if (!mapId || !pokeUid) throw new ErroHttp(400, 'mapId e pokeUid sao obrigatorios')

  // Validar a INTENCAO e o ponto todo: sem isto, "estou na hunt dos lendarios
  // com um POKE que nao e meu" seria aceito e simulado.
  if (!MAPS[mapId]) throw new ErroHttp(400, 'hunt desconhecida')

  const estado = await carregarEstado(cfg, userId)
  const poke = estado.team.find((p) => p.uid === pokeUid)
  if (!poke) throw new ErroHttp(403, 'este POKE nao esta na sua equipe')
  if (!estado.unlockedMaps.includes(mapId)) throw new ErroHttp(403, 'hunt nao desbloqueada')
  const continente = MAPS[mapId].continent || 'johto'
  if (!estado.unlockedContinents.includes(continente)) {
    throw new ErroHttp(403, 'continente nao desbloqueado')
  }

  // Uma sessao aberta por vez. Sem isso, abrir N sessoes em paralelo e dar
  // flush em todas multiplicaria o mesmo intervalo de tempo por N — a forma
  // mais direta de imprimir ouro neste desenho.
  const anterior = await sessaoAberta(cfg, userId)
  if (anterior) {
    await aplicarFlush(cfg, userId, anterior)
    await atualizar(cfg, `game_sessions?id=eq.${anterior.id}`, { closed_at: new Date().toISOString() })
  }

  const [criada] = await inserir<LinhaSessao>(cfg, 'game_sessions', {
    user_id: userId,
    map_id: mapId,
    poke_uid: pokeUid,
    // A semente NASCE no servidor. Se o cliente pudesse escolher, escolheria a
    // que da shiny.
    seed: randomSeed(),
  }, { retornar: true })

  await atualizar(cfg, `players?user_id=eq.${userId}`, { current_map_id: mapId })
  return json({ sessaoId: criada.id, mapId, iniciadaEm: criada.last_flush_at })
}

async function flush(cfg: Config, userId: string): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) throw new ErroHttp(409, 'nenhuma sessao aberta')
  const resultado = await aplicarFlush(cfg, userId, sessao)
  return json({
    segundosCreditados: resultado.segundosCreditados,
    truncado: resultado.truncado,
    resumo: resultado.resumo,
    // O cliente sobrescreve o estado local com isto. Ele e predicao; a verdade
    // e o que volta daqui.
    estado: resultado.estado,
  })
}

async function fechar(cfg: Config, userId: string): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) return json({ fechada: false })
  const resultado = await aplicarFlush(cfg, userId, sessao)
  await atualizar(cfg, `game_sessions?id=eq.${sessao.id}`, { closed_at: new Date().toISOString() })
  await atualizar(cfg, `players?user_id=eq.${userId}`, { current_map_id: null })
  return json({ fechada: true, resumo: resultado.resumo, estado: resultado.estado })
}
