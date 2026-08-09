// O servico, como um handler `fetch(Request) => Response`.
//
// Por que essa forma e nao Fastify: um Worker do Cloudflare E exatamente
// `export default { fetch }`, e o Node 22 tem `Request`/`Response` nativos —
// entao o mesmo arquivo roda nos dois sem camada de compatibilidade. A escolha
// de hospedagem continua aberta (ver CLAUDE.md, Fase D) e este desenho e o que
// mantem ela aberta de graca. Sao 4 rotas; framework nao pagaria seu custo.
import { autenticar } from './auth.js'
import { ErroHttp, selecionar, inserir, atualizar, chamarRpc, type Config } from './db.js'
import {
  aplicarFlush, carregarEstado, comEstadoParaEscrita, gravarEstado,
  FLUSH_OCUPADO, type LinhaSessao,
} from './progresso.js'
import { aplicarAcao, type Acao } from './acoes.js'
import {
  livroDoItem, resumoDosItens, anunciosAtivos, minhasOrdens, meuHistorico,
  criarOrdem, cancelarOrdem, anunciarPoke, cancelarAnuncio, comprarAnuncio,
  ofertarNoAnuncio, responderOferta, cancelarOferta,
} from './mercado.js'
import {
  lerChat, enviarChat, caixaDeEntrada, pedirAmizade, responderPedido, marcarLida, coletarAnexo,
} from './social.js'
import { criarEstadoDoJogador } from './estadoDoJogador.js'
import { limparMundoDoJogador } from './reiniciar.js'
import {
  perfilDoJogador, rankingDeTreinadores, rankingDePokemon, hallDaFama,
  ehCriterioPoke, CONQUISTA_LANCE,
} from './ranking.js'
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
    // Le E LIQUIDA as entregas pendentes do Mercado. E o unico ponto por onde
    // um jogador que so abriu o jogo (sem entrar em hunt nem comprar nada)
    // recebe o que vendeu enquanto estava fora — por isso ele grava, apesar de
    // ser um GET. `carregarEstadoParaEscrita` carimba a entrega como aplicada,
    // entao o `gravarEstado` logo abaixo nao e opcional.
    return comEstadoParaEscrita(cfg, jogador.id, async ({ estado, pokeIdsNoLoad }) => {
      await gravarEstado(cfg, jogador.id, estado, pokeIdsNoLoad)
      return json({ estado })
    })
  }
  if (url.pathname.startsWith('/mercado')) return mercado(cfg, jogador.id, req, url)
  if (url.pathname.startsWith('/chat') || url.pathname.startsWith('/correio')) {
    return social(cfg, jogador.id, req, url)
  }
  if (url.pathname === '/perfil' && req.method === 'GET') {
    return json(await perfilDoJogador(cfg, jogador.id))
  }
  if (url.pathname === '/ranking/treinadores' && req.method === 'GET') {
    return json({ entradas: await rankingDeTreinadores(cfg, url.searchParams.get('limite')) })
  }
  if (url.pathname === '/ranking/pokemon' && req.method === 'GET') {
    const criterio = url.searchParams.get('criterio') ?? 'level'
    // Lista branca: o criterio vira nome de coluna numa URL do PostgREST.
    if (!ehCriterioPoke(criterio)) throw new ErroHttp(400, 'criterio desconhecido')
    return json({ entradas: await rankingDePokemon(cfg, criterio, url.searchParams.get('limite')) })
  }
  if (url.pathname === '/ranking/hall' && req.method === 'GET') {
    return json({ entradas: await hallDaFama(cfg, CONQUISTA_LANCE, url.searchParams.get('limite')) })
  }
  if (url.pathname === '/acao' && req.method === 'POST') {
    return acao(cfg, jogador.id, req)
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
 * Liquida a sessao aberta, se houver, e devolve o resultado.
 *
 * `aplicarFlush` devolve `null` quando o POKE da sessao nao existe mais (conta
 * reiniciada, POKE vendido/liberado). Nesse caso a sessao e insimulavel PRA
 * SEMPRE — a unica saida e fecha-la. Antes isso era um 409, e como TODA rota
 * passa por um flush obrigatorio, uma sessao nesse estado travava a conta
 * inteira: nem escolher um novo inicial funcionava depois de "Iniciar novo
 * jogo".
 */
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

async function liquidarSessaoAberta(cfg: Config, userId: string) {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) return { sessao: null, resultado: null }
  const resultado = await aplicarFlush(cfg, userId, sessao)
  // Outro request do mesmo jogador esta creditando este intervalo agora mesmo.
  // A sessao continua valida: so nao ha o que liquidar aqui.
  if (resultado === FLUSH_OCUPADO) return { sessao, resultado: null }
  if (!resultado) {
    await sairDaHunt(cfg, userId, sessao.id)
    return { sessao: null, resultado: null }
  }
  // POKE caido sem como levantar: a cacada acabou. Manter a sessao aberta era o
  // que fazia o farm offline "nao funcionar" — ver o comentario de
  // `ResultadoFlush.encerrada`.
  if (resultado.encerrada) await sairDaHunt(cfg, userId, sessao.id)
  return { sessao, resultado }
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
  // POKE caido nao luta. Sem esta recusa, abrir a hunt com ele desmaiado
  // iniciava uma sessao que so sabe queimar o relogio: o primeiro passo da
  // simulacao ja encontra o POKE no chao, para ali, e cada flush seguinte
  // credita o intervalo inteiro por 0,1 segundo de jogo. Uma ausencia de uma
  // noite virava zero de ouro, sem erro em lugar nenhum.
  if (poke.hp <= 0) {
    throw new ErroHttp(409, 'Seu POKE esta desmaiado. Cure na Enfermeira antes de cacar.')
  }
  // A regra real do jogo e "hunt sem custo nasce liberada; hunt com custo exige
  // ter pago" — nao "tem que estar na coluna `unlocked_maps`". A diferenca
  // importa: as hunts do Modo Pesadelo e as BOSS sao geradas em RUNTIME
  // (data/nightmareMaps.ts) e nunca entraram na tabela `maps`, entao nunca
  // apareceriam naquela coluna. Checar so a coluna trancava o Modo Pesadelo
  // inteiro pra todo mundo, em silencio.
  const temCusto = MAPS[mapId].unlockCost != null
  if (temCusto && !estado.unlockedMaps.includes(mapId)) {
    throw new ErroHttp(403, 'hunt nao desbloqueada')
  }
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
    await fecharLinhaDeSessao(cfg, anterior.id)
  }

  // A semente NASCE no servidor. Se o cliente pudesse escolher, escolheria a
  // que da shiny.
  const semente = randomSeed()
  let criada: LinhaSessao
  try {
    ;[criada] = await inserir<LinhaSessao>(cfg, 'game_sessions', {
      user_id: userId,
      map_id: mapId,
      poke_uid: pokeUid,
      seed: semente,
      // A sequencia comeca NA semente e avanca a cada flush (ver aplicarFlush).
      // `seed` fica imutavel como origem auditavel da sessao; `rng_state` e onde a
      // sequencia esta agora.
      rng_state: semente,
      rng_draws: 0,
    }, { retornar: true })
  } catch {
    // O indice unico parcial recusou: outro request do mesmo jogador abriu uma
    // sessao no intervalo entre o fechamento acima e este INSERT (clique duplo
    // em "Entrar", ou dois aparelhos). Isso NAO e erro pro jogador — a intencao
    // dele foi atendida —, entao devolvemos a sessao que venceu a corrida em vez
    // de um 502. Sem isso, o unico jeito de impedir a duplicacao seria recusar a
    // segunda entrada com uma mensagem de falha que nao descreve nada.
    const vencedora = await sessaoAberta(cfg, userId)
    if (!vencedora) throw new ErroHttp(409, 'nao foi possivel abrir a sessao — tente de novo')
    return json({ sessaoId: vencedora.id, mapId: vencedora.map_id, iniciadaEm: vencedora.last_flush_at })
  }

  // Zera a amostra de taxa (perfStats) ao entrar na hunt — mesmo comportamento
  // que `controller.enterMap` sempre teve no cliente. E o que faz o piso do farm
  // offline ser medido POR HUNT: sem isso, a referencia seria a media de tudo que
  // o jogador ja fez, e daria pra farmar uma hunt facil, trocar pra uma brutal e
  // deslogar levando a taxa da facil.
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
  // Corrida com outro flush do mesmo jogador: responde o estado como esta, sem
  // simular nem gravar. Gravar aqui sobrescreveria o resultado do vencedor com
  // um estado lido antes dele — que e exatamente o bug que o claim fecha.
  if (resultado === FLUSH_OCUPADO) {
    return json({
      segundosCreditados: 0,
      truncado: false,
      resumo: createEmptySummary(),
      piso: { aplicado: false, ouroAdicionado: 0, xpAdicionado: 0 },
      estado: await carregarEstado(cfg, userId),
    })
  }
  // POKE da sessao sumiu — fecha e responde 409, que o cliente ja trata como
  // "nao ha sessao aberta" (nao e erro do jogador, nao gera toast).
  if (!resultado) {
    await sairDaHunt(cfg, userId, sessao.id)
    throw new ErroHttp(409, 'nenhuma sessao aberta')
  }
  // O POKE caiu e nao ha como reanima-lo. A sessao morre aqui, e o cliente
  // precisa SABER: sem o aviso ele continua desenhando a hunt e o jogador acha
  // que esta farmando enquanto o servidor ja nao credita nada.
  if (resultado.encerrada) await sairDaHunt(cfg, userId, sessao.id)
  return json({
    segundosCreditados: resultado.segundosCreditados,
    truncado: resultado.truncado,
    resumo: resultado.resumo,
    piso: resultado.piso,
    sessaoEncerrada: resultado.encerrada,
    // O cliente sobrescreve o estado local com isto. Ele e predicao; a verdade
    // e o que volta daqui.
    estado: resultado.estado,
  })
}

async function fechar(cfg: Config, userId: string): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) return json({ fechada: false })
  const resultado = await aplicarFlush(cfg, userId, sessao)
  await sairDaHunt(cfg, userId, sessao.id)
  // Sem resultado = POKE da sessao sumiu (ou outro request estava creditando o
  // intervalo). A sessao fica fechada (acima), mas nao ha resumo pra mostrar —
  // `fechada: false` faz o cliente nao abrir o modal de Farm Offline com numeros
  // vazios.
  if (!resultado || resultado === FLUSH_OCUPADO) return json({ fechada: false })
  return json({ fechada: true, resumo: resultado.resumo, piso: resultado.piso, estado: resultado.estado })
}

// Aplica UMA acao de jogador e devolve o estado resultante.
//
// Uma acao por request de proposito: em lote, uma acao invalida no meio deixaria
// o cliente sem saber quais das outras foram aplicadas — e o cliente sobrescreve
// o estado local com a resposta, entao ambiguidade ali vira dessincronizacao.
//
// Se ha uma sessao de hunt aberta, ela e liquidada ANTES da acao. Sem isso,
// vender o POKE que esta cacando (ou usar a ultima pocao) mudaria o estado sob
// os pes de uma simulacao que ainda nao foi creditada, e o flush seguinte
// simularia com dado que ja nao vale.
async function acao(cfg: OpcoesApp, userId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as Acao | null
  if (!corpo || typeof corpo.tipo !== 'string') throw new ErroHttp(400, 'informe { tipo }')

  await liquidarSessaoAberta(cfg, userId)

  // `reiniciarJogo` destroi o POKE que qualquer sessao aberta esta usando, entao
  // a sessao tem que morrer JUNTO — deixa-la aberta apontando pra um POKE
  // inexistente era o que travava a conta depois de "Iniciar novo jogo".
  //
  // `limparMundoDoJogador` cuida do resto que o `gravarEstado` nao alcanca
  // (Mercado, entregas, historico de sessao) — ver o cabecalho de reiniciar.ts.
  // Roda ANTES da acao: o estado que vai ser gravado logo abaixo ja e o zerado,
  // e apagar depois deixaria uma janela em que a conta esta zerada mas o POKE
  // anunciado ainda esta a venda.
  if (corpo.tipo === 'reiniciarJogo') {
    const aberta = await sessaoAberta(cfg, userId)
    if (aberta) await fecharLinhaDeSessao(cfg, aberta.id)
    await limparMundoDoJogador(cfg, userId)
  }

  // `comEstadoParaEscrita` e obrigatorio aqui, e nao conveniencia: uma acao
  // RECUSADA (409 — ouro insuficiente, item travado, POKE indisponivel) lanca
  // antes do `gravarEstado`, e as entregas do Mercado ja tinham sido carimbadas
  // como aplicadas. Medido: uma venda de 500 de ouro sumiu porque o jogador
  // tentou, em seguida, comprar algo que nao podia pagar.
  return comEstadoParaEscrita(cfg, userId, async ({ estado: dados, pokeIdsNoLoad }) => {
    // Unicidade do nick: pergunta de BANCO, entao nao cabe em `aplicarAcao` (que e
    // sincrona e pura por desenho). Sem esta checagem, escolher um nome ocupado
    // batia no indice unico `players_trainer_name_unico` e voltava como 502
    // "falha ao falar com o banco" — erro de servidor pra um erro de jogador.
    //
    // Reescolher o proprio nome atual e permitido: a RPC responde "ocupado" pra
    // ele (o dono e o proprio), e recusar seria dizer que o nome que a tela ja
    // mostra e invalido.
    if (corpo.tipo === 'definirNomeDoTreinador' && typeof corpo.nome === 'string') {
      const nome = corpo.nome.trim()
      const meuNome = dados.trainer.name.toLowerCase()
      if (nome.toLowerCase() !== meuNome) {
        const livre = await chamarRpc<boolean>(cfg, 'nome_de_treinador_disponivel', { nome })
        if (livre === false) throw new ErroHttp(409, `O nome "${nome}" ja esta em uso. Escolha outro.`)
      }
    }

    const { store, dados: estado } = criarEstadoDoJogador(dados)
    const resultado = aplicarAcao(store, estado, corpo)
    await gravarEstado(cfg, userId, estado, pokeIdsNoLoad)

    return json({ ...resultado, estado })
  })
}

// --- Mercado ----------------------------------------------------------------
//
// Rotas proprias em vez de entradas na lista branca de `/acao` por um motivo
// concreto: toda operacao de mercado e ASSINCRONA e toca linhas de OUTRO
// jogador (ordem alheia, entrega, transferencia de POKE). `aplicarAcao` e uma
// funcao sincrona e pura sobre a store do proprio jogador — enfiar I/O ali
// quebraria a garantia que faz aquele arquivo ser auditavel.
async function mercado(cfg: OpcoesApp, userId: string, req: Request, url: URL): Promise<Response> {
  if (req.method === 'GET') {
    if (url.pathname === '/mercado/itens') {
      const itemId = url.searchParams.get('itemId')
      if (itemId) return json(await livroDoItem(cfg, itemId))
      return json({ itens: await resumoDosItens(cfg) })
    }
    if (url.pathname === '/mercado/pokes') return json({ anuncios: await anunciosAtivos(cfg) })
    if (url.pathname === '/mercado/meus') return json(await minhasOrdens(cfg, userId))
    if (url.pathname === '/mercado/historico') return json({ negocios: await meuHistorico(cfg, userId) })
    return json({ erro: 'rota desconhecida' }, 404)
  }

  if (req.method !== 'POST') return json({ erro: 'rota desconhecida' }, 404)
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!corpo) throw new ErroHttp(400, 'corpo invalido')

  // Mesma razao de `/acao`: uma sessao de hunt aberta ainda nao creditada
  // mudaria o inventario sob os pes desta operacao. Liquida antes de decidir
  // qualquer coisa sobre ouro ou itens.
  await liquidarSessaoAberta(cfg, userId)

  if (url.pathname === '/mercado/ordem') return json(await criarOrdem(cfg, userId, corpo))
  if (url.pathname === '/mercado/ordem/cancelar') {
    return json(await cancelarOrdem(cfg, userId, String(corpo.ordemId ?? '')))
  }
  if (url.pathname === '/mercado/anuncio') return json(await anunciarPoke(cfg, userId, corpo))
  if (url.pathname === '/mercado/anuncio/cancelar') {
    return json(await cancelarAnuncio(cfg, userId, String(corpo.anuncioId ?? '')))
  }
  if (url.pathname === '/mercado/comprar') {
    return json(await comprarAnuncio(cfg, userId, String(corpo.anuncioId ?? '')))
  }
  if (url.pathname === '/mercado/oferta') return json(await ofertarNoAnuncio(cfg, userId, corpo))
  if (url.pathname === '/mercado/oferta/responder') {
    return json(await responderOferta(cfg, userId, String(corpo.ofertaId ?? ''), corpo.aceitar === true))
  }
  if (url.pathname === '/mercado/oferta/cancelar') {
    return json(await cancelarOferta(cfg, userId, String(corpo.ofertaId ?? '')))
  }
  return json({ erro: 'rota desconhecida' }, 404)
}

// --- Chat e Correio ---------------------------------------------------------
async function social(cfg: OpcoesApp, userId: string, req: Request, url: URL): Promise<Response> {
  if (req.method === 'GET') {
    if (url.pathname === '/chat') return json({ mensagens: await lerChat(cfg) })
    if (url.pathname === '/correio') return json(await caixaDeEntrada(cfg, userId))
    return json({ erro: 'rota desconhecida' }, 404)
  }
  if (req.method !== 'POST') return json({ erro: 'rota desconhecida' }, 404)

  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!corpo) throw new ErroHttp(400, 'corpo invalido')

  if (url.pathname === '/chat') return json({ mensagens: await enviarChat(cfg, userId, corpo) })
  if (url.pathname === '/correio/amizade') {
    return json(await pedirAmizade(cfg, userId, String(corpo.nick ?? '')))
  }
  if (url.pathname === '/correio/responder') {
    return json(await responderPedido(cfg, userId, String(corpo.mensagemId ?? ''), corpo.aceitar === true))
  }
  if (url.pathname === '/correio/ler') {
    return json(await marcarLida(cfg, userId, String(corpo.mensagemId ?? '')))
  }
  if (url.pathname === '/correio/coletar') {
    return json(await coletarAnexo(cfg, userId, String(corpo.mensagemId ?? '')))
  }
  return json({ erro: 'rota desconhecida' }, 404)
}
