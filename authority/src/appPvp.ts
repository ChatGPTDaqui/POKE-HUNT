// Resolucao SERVER-SIDE do PvP ranqueado — nunca o client reportando o
// proprio veredito (esse e o modelo antigo de `registrar_resultado_pvp`,
// aceitavel pro amistoso sem stakes, inaceitavel com MMR em jogo).
//
// Reaproveita `pvpSimulator` (o mesmo motor do duelo amistoso ao vivo) — so
// roda aqui, com os dois times ja validados no banco, e o resultado e
// persistido atomicamente via a RPC `aplicar_resultado_pvp` (service_role).
import { simularPvp, type PvpCombatente, type PvpResultado } from '@/features/pvp/pvpSimulator'
import { ErroHttp, chamarRpc, selecionar, type Config } from './db.js'
import { calcularResultadoRanqueado, type EntradaJogador, type Resultado } from './pvpElo.js'
import { pvpRowToPoke, type LinhaTimePvp } from './pvpRow.js'

interface LinhaSessaoPvp {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: string
  modo: 'amistoso' | 'ranqueado'
  anfitriao_time: LinhaTimePvp[] | null
  convidado_time: LinhaTimePvp[] | null
}

interface LinhaRankPvp {
  user_id: string
  mmr: number
  partidas: number
  pdl: number
  divisao: string
}

function json(dado: unknown, status = 200): Response {
  return new Response(JSON.stringify(dado), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

function montarTime(nome: string, linhas: LinhaTimePvp[] | null): PvpCombatente {
  const time = (linhas ?? []).map(pvpRowToPoke).filter((p) => p != null)
  return { nome, time }
}

function resultadoDoAnfitriao(r: PvpResultado): Resultado {
  if (r.vencedor === 'jogador') return 'vitoria'
  if (r.vencedor === 'oponente') return 'derrota'
  return 'empate'
}

export async function resolverPvp(cfg: Config, jogadorId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { sessaoId?: string } | null
  const sessaoId = corpo?.sessaoId
  if (!sessaoId) throw new ErroHttp(400, 'sessaoId e obrigatorio')

  const [sessao] = await selecionar<LinhaSessaoPvp>(cfg, `pvp_sessao?id=eq.${sessaoId}&select=*`)
  if (!sessao) throw new ErroHttp(404, 'PvP nao encontrado.')
  if (sessao.anfitriao_id !== jogadorId && sessao.convidado_id !== jogadorId) {
    throw new ErroHttp(403, 'Este PvP nao e seu.')
  }
  if (sessao.estado !== 'aberta') {
    // Idempotente: outro participante ja disparou a resolucao primeiro.
    return json({ jaResolvido: true })
  }
  if (sessao.modo !== 'ranqueado') {
    throw new ErroHttp(400, 'Resolucao automatica ainda so cobre o ranqueado.')
  }

  const timeAnfitriao = montarTime('anfitriao', sessao.anfitriao_time)
  const timeConvidado = montarTime('convidado', sessao.convidado_time)
  if (timeAnfitriao.time.length === 0 || timeConvidado.time.length === 0) {
    throw new ErroHttp(409, 'Um dos times deste PvP esta vazio ou invalido.')
  }

  const resultado = simularPvp(timeAnfitriao, timeConvidado)
  const resultadoAnfitriao = resultadoDoAnfitriao(resultado)
  const vencedorId = resultadoAnfitriao === 'vitoria'
    ? sessao.anfitriao_id
    : resultadoAnfitriao === 'derrota' ? sessao.convidado_id : null

  const ranks = await selecionar<LinhaRankPvp>(
    cfg,
    `pvp_rank?user_id=in.(${sessao.anfitriao_id},${sessao.convidado_id})&select=user_id,mmr,partidas,pdl,divisao`,
  )
  const rankAnfitriao = ranks.find((r) => r.user_id === sessao.anfitriao_id)
  const rankConvidado = ranks.find((r) => r.user_id === sessao.convidado_id)
  if (!rankAnfitriao || !rankConvidado) {
    // `entrar_fila_ranqueada` sempre chama `pvp_garantir_rank` antes de
    // enfileirar — chegar aqui sem as duas linhas e estado impossivel, nao
    // caminho normal de erro do usuario.
    throw new ErroHttp(500, 'Rank ranqueado ausente para um dos participantes.')
  }

  const entradaAnfitriao: EntradaJogador = rankAnfitriao
  const entradaConvidado: EntradaJogador = rankConvidado
  const calculo = calcularResultadoRanqueado(entradaAnfitriao, entradaConvidado, resultadoAnfitriao)

  await chamarRpc(cfg, 'aplicar_resultado_pvp', {
    p_sessao_id: sessaoId,
    p_vencedor_id: vencedorId,
    p_eventos: resultado.eventos,
    p_mmr_anfitriao: calculo.anfitriao.mmr,
    p_pdl_anfitriao: calculo.anfitriao.pdl,
    p_divisao_anfitriao: calculo.anfitriao.divisao,
    p_mmr_convidado: calculo.convidado.mmr,
    p_pdl_convidado: calculo.convidado.pdl,
    p_divisao_convidado: calculo.convidado.divisao,
    p_pdl_delta_anfitriao: calculo.anfitriao.pdlDelta,
    p_pdl_delta_convidado: calculo.convidado.pdlDelta,
  })

  return json({
    vencedorId,
    eventos: resultado.eventos,
    turnos: resultado.turnos,
    pdlDeltaAnfitriao: calculo.anfitriao.pdlDelta,
    pdlDeltaConvidado: calculo.convidado.pdlDelta,
  })
}
