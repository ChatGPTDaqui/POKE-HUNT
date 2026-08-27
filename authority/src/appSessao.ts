// Router MINIMO da Edge Function de sessao — extraido de app.ts na migracao
// RPC-everything (ver _Architecture.md, secao "Sessao ao vivo"). So as rotas
// que dependem de simulacao real (`stepWorld`/`aplicarFlush`), que nao roda em
// `plpgsql`. Mercado/acoes/social/ranking/reset viraram RPC (`dev.*`) e nao
// passam mais por aqui — ver as ~20 funcoes ja criadas.
import { autenticar } from './auth.js'
import { ErroHttp, selecionar, inserir, atualizar, chamarRpc, type Config } from './db.js'
import {
  aplicarFlush, carregarEstado, comEstadoParaEscrita, gravarEstado,
  FLUSH_OCUPADO, type LinhaSessao,
} from './progresso.js'
import {
  MAPS, randomSeed, createEmptySummary, createRng, novaSala, temSalas, climaDaSala,
  ORDEM_DOS_BIOMAS, BIOMA_POR_CHAVE, type BiomaProgress,
} from '#engine'

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
        // `await`, nao fire-and-forget: a Edge Function pode matar o isolate
        // assim que a resposta e devolvida, entao um `void` sem esperar
        // arriscava o report nunca terminar. `.catch` mudo de proposito —
        // reportar o erro nunca pode virar outro erro (se o banco esta fora
        // do ar, e exatamente isso que estamos tentando registrar).
        await chamarRpc(cfg, 'registrar_evento_auditoria', {
          p_rota: url.pathname, p_mensagem: String(erro), p_contexto: { origem_execucao: 'server' },
        }).catch(() => {})
        resposta = json({ erro: 'erro interno' }, 500)
      }
    }
    for (const [k, v] of Object.entries(cors)) resposta.headers.set(k, v)
    return resposta
  }
}

/**
 * O cliente sabe lidar com um `estado` que traz so as capturas da janela em
 * `bagPokes`, em vez da mochila inteira?
 *
 * Isto e uma trava de COMPATIBILIDADE, nao uma opcao de produto: uma aba aberta
 * antes deste deploy faz `setState(estado)` cru e ficaria com a Mochila vazia na
 * tela ate o proximo F5. Ela declara `{"parcial":true}` no corpo; cliente antigo
 * manda corpo vazio e continua recebendo o estado inteiro.
 *
 * Custo de ler o corpo: nenhum — as duas rotas que usam isto nao tinham corpo.
 * Corpo ausente/invalido cai em `false`, o lado seguro.
 */
async function aceitaEstadoParcial(req: Request): Promise<boolean> {
  const corpo = (await req.json().catch(() => null)) as { parcial?: unknown } | null
  return corpo?.parcial === true
}

async function rotear(cfg: OpcoesApp, req: Request, url: URL): Promise<Response> {
  // Schema ecoado aqui pra CI confirmar pos-deploy que `jogo-dev` esta mesmo
  // rodando com JOGO_SCHEMA_DEV=dev (nao com o fallback ou, pior, com o
  // schema de outra function por engano de secret) -- ver docs/15,
  // "Mudanca necessaria no gate da Parte 2".
  if (url.pathname === '/saude') return json({ ok: true, schema: cfg.schema ?? 'public' })

  // Toda rota abaixo exige um jogador autenticado.
  const jogador = await autenticar(cfg, req)

  if (url.pathname === '/sessao/abrir' && req.method === 'POST') {
    return abrirSessao(cfg, jogador.id, req)
  }
  if (url.pathname === '/sessao/flush' && req.method === 'POST') {
    return flush(cfg, jogador.id, await aceitaEstadoParcial(req))
  }
  if (url.pathname === '/sessao/fechar' && req.method === 'POST') {
    return fechar(cfg, jogador.id, await aceitaEstadoParcial(req))
  }
  if (url.pathname === '/sessao/avancar-sala' && req.method === 'POST') {
    return avancarSala(cfg, jogador.id, await aceitaEstadoParcial(req))
  }
  if (url.pathname === '/estado' && req.method === 'GET') {
    // Le E LIQUIDA as entregas pendentes do Mercado (uso interno, ver
    // entregas.ts — nenhuma RPC client-facing escreve mais na fila, mas o
    // que sobrou de antes ainda precisa ser assentado).
    //
    // So grava quando ha o que gravar (entrega recem-carimbada). Sem isso,
    // TODO carregamento de pagina fazia uma escrita inutil (regravava o
    // snapshot identico ao que acabou de ler) que so aumentava a chance de
    // colidir com um flush em andamento — metade do que causava progresso
    // regredindo em recarga perto do tique de 30s.
    // `?parcial=1`: o cliente busca a mochila por conta propria (direto no
    // PostgREST, quando abre uma tela que a usa) e nao quer os megabytes dela
    // aqui. Medido: numa conta de 456 POKEs, 97,8% desta resposta era mochila.
    // Sem o parametro, responde completo — cliente antigo depende disso.
    const parcial = url.searchParams.get('parcial') === '1'
    return comEstadoParaEscrita(cfg, jogador.id, async ({ estado, pokeIdsNoLoad, playerUpdatedAt, entregas, linhasNoLoad }) => {
      if (entregas.length) await gravarEstado(cfg, jogador.id, estado, pokeIdsNoLoad, playerUpdatedAt, linhasNoLoad)
      return json({ estado, estadoParcial: parcial })
    }, { comBag: !parcial })
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

/**
 * PH-227: mensagem de bloqueio (ou `null` se liberado) do gate sequencial de
 * bioma — vencer o boss ultimate do bioma N libera o N+1 (PH-207/226).
 * `mapId` e `huntId(bioma, faixa) = "${bioma}_${faixa}"` (biomas.ts) — a
 * faixa (`grupo`) ja veio de `MAPS[mapId].continent`, entao so sobra tirar o
 * sufixo pra achar o bioma, mesmo com bioma tendo underscore no proprio
 * nome (`aguas_interiores`, `campo_aberto`).
 *
 * Pura de proposito: testavel isolada, sem precisar mockar `db.js`/HTTP
 * inteiro so pra exercitar uma regra de negocio.
 */
export function bloqueioDeBiomaPendente(
  mapId: string, grupo: string, biomaProgress: BiomaProgress,
): string | null {
  const biomaChave = mapId.endsWith(`_${grupo}`) ? mapId.slice(0, -(grupo.length + 1)) : null
  const indiceEsperado = biomaChave ? ORDEM_DOS_BIOMAS.indexOf(biomaChave) : -1
  // Bioma sem boss habilitado (indice -1, nao acontece hoje com os 12 todos
  // habilitados — PH-225) ou o PRIMEIRO da ordem (indice 0) libera
  // automatico, sem checar nada — nao ha "boss anterior" pra vencer.
  if (indiceEsperado <= 0) return null
  const progresso = (biomaProgress?.[grupo as keyof BiomaProgress] ?? 0) as number
  if (progresso >= indiceEsperado) return null
  const anteriorChave = ORDEM_DOS_BIOMAS[indiceEsperado - 1]
  const anteriorNome = BIOMA_POR_CHAVE[anteriorChave]?.nome ?? anteriorChave
  return `Vença o boss de ${anteriorNome} para liberar esta área.`
}

async function abrirSessao(cfg: Config, userId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { mapId?: string; pokeUid?: string } | null
  const mapId = corpo?.mapId
  const pokeUid = corpo?.pokeUid
  if (!mapId || !pokeUid) throw new ErroHttp(400, 'mapId e pokeUid sao obrigatorios')

  if (!MAPS[mapId]) throw new ErroHttp(400, 'hunt desconhecida')

  // `comBag: false`: esta rota so olha `team`, `unlockedMaps` e
  // `unlockedContinents`. Nao devolve estado nenhum pro cliente, entao nao ha
  // nem a questao de parcial — ler a mochila aqui era desperdicio puro.
  const estado = await carregarEstado(cfg, userId, { comBag: false })
  const poke = estado.team.find((p) => p.uid === pokeUid)
  if (!poke) throw new ErroHttp(403, 'este POKE nao esta na sua equipe')
  if (poke.hp <= 0) {
    throw new ErroHttp(409, 'Seu POKE esta desmaiado. Cure na Enfermeira antes de cacar.')
  }
  const temCusto = MAPS[mapId].unlockCost != null
  if (temCusto && !estado.unlockedMaps.includes(mapId)) {
    throw new ErroHttp(403, 'hunt nao desbloqueada')
  }
  // `continent` e o GRUPO DE GATE da hunt (faixa1/faixa2/faixa3/nightmare, ver
  // data/biomas.ts) — deixou de ser regiao quando as hunts viraram biomas
  // tematicos. A faixa III e o Modo Pesadelo (com as 11 BOSS dentro) so entram
  // depois do Campeao Lance.
  const grupo = MAPS[mapId].continent
  if (!estado.unlockedContinents.includes(grupo)) {
    throw new ErroHttp(403, 'Derrote o Campeao Lance para acessar esta area.')
  }
  // PH-227: gate sequencial de bioma (PH-207/226) — sem isto, qualquer
  // jogador chama esta rota direto (curl/devtools) com o mapId de um bioma
  // ainda bloqueado e entra mesmo assim. Regra do projeto: limite de
  // negocio so no cliente vira bypass.
  const bloqueio = bloqueioDeBiomaPendente(mapId, grupo, estado.biomaProgress)
  if (bloqueio) throw new ErroHttp(403, bloqueio)

  const anterior = await sessaoAberta(cfg, userId)
  if (anterior) {
    await aplicarFlush(cfg, userId, anterior)
    await fecharLinhaDeSessao(cfg, anterior.id)
  }

  const semente = randomSeed()
  // A SALA INICIAL SAI DAQUI, e nao do primeiro flush.
  //
  // Ela nascia lazy, dentro do `buildMapWorld` da primeira janela — ou seja, ~30
  // segundos depois de o jogador entrar. Nesse intervalo o cliente exibia a sala
  // que a predicao dele sorteou, e quando a do servidor chegava o sub-bioma
  // trocava (hoje com aviso na tela, antes em silencio) logo depois da entrada.
  // Decidindo aqui, os dois lados comecam com a MESMA sala: o cliente recebe a
  // dela na resposta e constroi o mundo com ela.
  //
  // O `rng` avanca junto e e gravado avancado: a sequencia da sessao continua
  // sendo uma so, e o sorteio da sala inicial faz parte dela.
  const rng = createRng(semente)
  const salaInicial = temSalas(mapId) ? novaSala(rng, mapId, 0, 0) : null
  let criada: LinhaSessao
  try {
    ;[criada] = await inserir<LinhaSessao>(cfg, 'game_sessions', {
      user_id: userId,
      map_id: mapId,
      poke_uid: pokeUid,
      seed: semente,
      rng_state: rng.state,
      rng_draws: rng.draws,
      sala_indice: salaInicial?.indice ?? 0,
      sala_chave: salaInicial?.chave ?? null,
      sala_abates: 0,
      ciclos: 0,
    }, { retornar: true })
  } catch {
    const vencedora = await sessaoAberta(cfg, userId)
    if (!vencedora) throw new ErroHttp(409, 'nao foi possivel abrir a sessao — tente de novo')
    // Corrida: outra aba abriu a sessao primeiro. A sala que vale e a DELA, e a
    // que este request sorteou nunca foi gravada.
    return json({
      sessaoId: vencedora.id,
      mapId: vencedora.map_id,
      iniciadaEm: vencedora.last_flush_at,
      sala: vencedora.sala_chave
        ? {
            indice: Number(vencedora.sala_indice ?? 0),
            chave: vencedora.sala_chave,
            abates: Number(vencedora.sala_abates ?? 0),
            ciclos: Number(vencedora.ciclos ?? 0),
          }
        : null,
    })
  }

  await atualizar(cfg, `players?user_id=eq.${userId}`, {
    current_map_id: mapId,
    perf_stats: { gold: 0, xp: 0, mobs: 0, shinys: 0, since: Date.now() },
  })
  // PH-140: o clima da sala inicial vai junto. O cliente NAO consegue derivar
  // o dele — a semente da sessao nunca sai do servidor (e ela que decide shiny,
  // IV, raridade e crit; ver core/rng.ts). Sem este campo, os dois lados
  // sorteariam climas diferentes e o jogador levaria dano de areia sob um ceu
  // que a tela dele mostra limpo.
  const climaInicial = climaDaSala(semente, salaInicial)
  return json({
    sessaoId: criada.id, mapId, iniciadaEm: criada.last_flush_at,
    sala: salaInicial, clima: climaInicial,
  })
}

async function flush(cfg: Config, userId: string, parcial: boolean): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) throw new ErroHttp(409, 'nenhuma sessao aberta')
  const resultado = await aplicarFlush(cfg, userId, sessao, { comBag: !parcial })
  if (resultado === FLUSH_OCUPADO) {
    return json({
      segundosCreditados: 0,
      truncado: false,
      resumo: createEmptySummary(),
      piso: { aplicado: false, ouroAdicionado: 0, xpAdicionado: 0 },
      estadoParcial: parcial,
      estado: await carregarEstado(cfg, userId, { comBag: !parcial }),
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
    // Idem pra sala: o cliente sorteia a propria como predicao, e quem decidiu
    // o pool e o loot que de fato foram creditados foi esta aqui.
    sala: resultado.sala,
    // PH-140: `aplicarFlush` ja resolvia o clima da sala, e esta linha e que
    // faltava pra ele CHEGAR ao cliente. Sem ela, `/sessao/abrir` mandava o
    // clima e todo flush seguinte vinha sem o campo — e como campo ausente
    // significa "sem informacao, mantenha o que tem", a primeira troca de sala
    // sob autoridade deixava o jogador sem clima nenhum pelo resto da hunt.
    // Passou pela suite inteira: so aparece chamando a funcao publicada.
    clima: resultado.clima,
    // `estadoParcial` anda SEMPRE junto de `estado`: e ele que diz ao cliente se
    // `bagPokes` e a mochila inteira ou so as capturas desta janela. Mandar o
    // estado sem a marca e a unica forma de esta otimizacao virar perda de dado
    // na tela do jogador.
    estadoParcial: parcial,
    estado: resultado.estado,
  })
}

/**
 * PH-178: avanco manual de sala. Mesmo formato de resposta de `flush` —
 * roda a MESMA infra de claim/CAS/retry (`aplicarFlush`), so com a flag que
 * destrava a sala parada em 30/30 depois de simular o intervalo normal. Nao
 * existe caminho de escrita paralelo: se corresse por fora do claim atomico
 * de `aplicarFlush`, reabriria a classe de bug de corrida que aquele claim
 * foi criado pra fechar (ver comentario dele, "BUG DE DUPLICACAO").
 */
async function avancarSala(cfg: Config, userId: string, parcial: boolean): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) throw new ErroHttp(409, 'nenhuma sessao aberta')
  const resultado = await aplicarFlush(cfg, userId, sessao, { comBag: !parcial, forcarAvancoDeSala: true })
  if (resultado === FLUSH_OCUPADO) throw new ErroHttp(409, 'flush em andamento, tente novamente')
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
    sala: resultado.sala,
    clima: resultado.clima,
    // `false` quando a sala nao estava mais travada em 30/30 ao fim da
    // simulacao (corrida rara: outro flush avancou primeiro) — nao e erro,
    // o cliente so nao tem uma sala nova pra aplicar.
    avancoAplicado: resultado.avancoDeSalaAplicado,
    estadoParcial: parcial,
    estado: resultado.estado,
  })
}

async function fechar(cfg: Config, userId: string, parcial: boolean): Promise<Response> {
  const sessao = await sessaoAberta(cfg, userId)
  if (!sessao) return json({ fechada: false })
  const resultado = await aplicarFlush(cfg, userId, sessao, { comBag: !parcial })
  await sairDaHunt(cfg, userId, sessao.id)
  if (!resultado || resultado === FLUSH_OCUPADO) return json({ fechada: false })
  return json({
    fechada: true,
    resumo: resultado.resumo,
    piso: resultado.piso,
    estadoParcial: parcial,
    estado: resultado.estado,
  })
}
