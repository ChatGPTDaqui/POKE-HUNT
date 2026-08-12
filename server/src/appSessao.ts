// Router MINIMO da Edge Function de sessao — extraido de app.ts na migracao
// RPC-everything (ver _Architecture.md, secao "Sessao ao vivo"). So as rotas
// que dependem de simulacao real (`stepWorld`/`aplicarFlush`), que nao roda em
// `plpgsql`. Mercado/acoes/social/ranking/reset viraram RPC (`dev.*`) e nao
// passam mais por aqui — ver as ~20 funcoes ja criadas.
import { autenticar } from './auth.js'
import { ErroHttp, selecionar, inserir, atualizar, type Config } from './db.js'
import {
  aplicarFlush, carregarEstado, comEstadoParaEscrita, gravarEstado,
  FLUSH_OCUPADO, type LinhaSessao,
} from './progresso.js'
import { MAPS, randomSeed, createEmptySummary } from '#engine'

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
    // Le E LIQUIDA as entregas pendentes do Mercado (uso interno, ver
    // entregas.ts — nenhuma RPC client-facing escreve mais na fila, mas o
    // que sobrou de antes ainda precisa ser assentado).
    return comEstadoParaEscrita(cfg, jogador.id, async ({ estado, pokeIdsNoLoad, playerUpdatedAt }) => {
      await gravarEstado(cfg, jogador.id, estado, pokeIdsNoLoad, playerUpdatedAt)
      return json({ estado })
    })
  }
  return json({ erro: 'rota desconhecida' }, 404)
}

/**
 * A sessao aberta do jogador — e no maximo UMA.
 *
 * O indice unico parcial `game_sessions_abertas` garante isso desde a migration
 * `20260809180000`. A varredura abaixo continua existindo como defesa em
 * profundidade e como conserto de dado legado: uma orfa nascida antes do indice
 * (ou num ambiente sem a migration) seria flushada mais tarde e creditaria de
 * novo um periodo que a sessao vencedora ja pagou — o exploit de duplicacao que
 * aquela migration descreve. Fechar sem creditar e o certo: o tempo dela ja foi
 * pago pela outra.
 */
async function sessaoAberta(cfg: Config, userId: string): Promise<LinhaSessao | null> {
  const linhas = await selecionar<LinhaSessao>(
    cfg,
    `game_sessions?user_id=eq.${userId}&closed_at=is.null&select=*&order=started_at.desc`,
  )
  for (const orfa of linhas.slice(1)) await fecharLinhaDeSessao(cfg, orfa.id)
  return linhas[0] ?? null
}

async function fecharLinhaDeSessao(cfg: Config, sessaoId: string): Promise<void> {
  await atualizar(cfg, `game_sessions?id=eq.${sessaoId}`, { closed_at: new Date().toISOString() })
}

/**
 * Fecha a linha da sessao E tira o jogador da hunt.
 *
 * `current_map_id` tem que ser limpo junto: e ele que faz o cliente voltar pra
 * hunt no proximo carregamento. Deixar a coluna apontando pra um mapa sem
 * sessao poe o jogador dentro de uma cacada que nao credita nada.
 */
async function sairDaHunt(cfg: Config, userId: string, sessaoId: string): Promise<void> {
  await fecharLinhaDeSessao(cfg, sessaoId)
  await atualizar(cfg, `players?user_id=eq.${userId}`, { current_map_id: null })
}

async function abrirSessao(cfg: Config, userId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { mapId?: string; pokeUid?: string } | null
  const mapId = corpo?.mapId
  const pokeUid = corpo?.pokeUid
  if (!mapId || !pokeUid) throw new ErroHttp(400, 'mapId e pokeUid sao obrigatorios')

  if (!MAPS[mapId]) throw new ErroHttp(400, 'hunt desconhecida')

  const estado = await carregarEstado(cfg, userId)
  const poke = estado.team.find((p) => p.uid === pokeUid)
  if (!poke) throw new ErroHttp(403, 'este POKE nao esta na sua equipe')
  if (poke.hp <= 0) {
    throw new ErroHttp(409, 'Seu POKE esta desmaiado. Cure na Enfermeira antes de cacar.')
  }
  const temCusto = MAPS[mapId].unlockCost != null
  if (temCusto && !estado.unlockedMaps.includes(mapId)) {
    throw new ErroHttp(403, 'hunt nao desbloqueada')
  }
  const continente = MAPS[mapId].continent || 'johto'
  if (!estado.unlockedContinents.includes(continente)) {
    throw new ErroHttp(403, 'continente nao desbloqueado')
  }

  const anterior = await sessaoAberta(cfg, userId)
  if (anterior) {
    await aplicarFlush(cfg, userId, anterior)
    await fecharLinhaDeSessao(cfg, anterior.id)
  }

  const semente = randomSeed()
  let criada: LinhaSessao
  try {
    ;[criada] = await inserir<LinhaSessao>(cfg, 'game_sessions', {
      user_id: userId,
      map_id: mapId,
      poke_uid: pokeUid,
      seed: semente,
      rng_state: semente,
      rng_draws: 0,
    }, { retornar: true })
  } catch {
    const vencedora = await sessaoAberta(cfg, userId)
    if (!vencedora) throw new ErroHttp(409, 'nao foi possivel abrir a sessao — tente de novo')
    return json({ sessaoId: vencedora.id, mapId: vencedora.map_id, iniciadaEm: vencedora.last_flush_at })
  }

  await atualizar(cfg, `players?user_id=eq.${userId}`, {
    current_map_id: mapId,
    perf_stats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() },
  })
  return json({ sessaoId: criada.id, mapId, iniciadaEm: criada.last_flush_at })
}

async function flush(cfg: Config, userId: string): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) throw new ErroHttp(409, 'nenhuma sessao aberta')
  const resultado = await aplicarFlush(cfg, userId, sessao)
  if (resultado === FLUSH_OCUPADO) {
    return json({
      segundosCreditados: 0,
      truncado: false,
      resumo: createEmptySummary(),
      piso: { aplicado: false, ouroAdicionado: 0, xpAdicionado: 0 },
      estado: await carregarEstado(cfg, userId),
    })
  }
  if (!resultado) {
    await sairDaHunt(cfg, userId, sessao.id)
    throw new ErroHttp(409, 'nenhuma sessao aberta')
  }
  if (resultado.encerrada) await sairDaHunt(cfg, userId, sessao.id)
  return json({
    segundosCreditados: resultado.segundosCreditados,
    truncado: resultado.truncado,
    resumo: resultado.resumo,
    piso: resultado.piso,
    sessaoEncerrada: resultado.encerrada,
    estado: resultado.estado,
  })
}

async function fechar(cfg: Config, userId: string): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) return json({ fechada: false })
  const resultado = await aplicarFlush(cfg, userId, sessao)
  await sairDaHunt(cfg, userId, sessao.id)
  if (!resultado || resultado === FLUSH_OCUPADO) return json({ fechada: false })
  return json({ fechada: true, resumo: resultado.resumo, piso: resultado.piso, estado: resultado.estado })
}
