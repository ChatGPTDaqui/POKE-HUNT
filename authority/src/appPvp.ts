// Resolucao SERVER-SIDE do PvP ranqueado — nunca o client reportando o
// proprio veredito (esse e o modelo antigo de `registrar_resultado_pvp`,
// aceitavel pro amistoso sem stakes, inaceitavel com MMR em jogo).
//
// PH-535 Fase 2: trocou `pvpSimulator.ts` (dano reimplementado do zero, sem
// stage/status/trait/escudo) pelo MESMO motor real headless que o Modo
// Duelo usa (`confrontoHeadless.ts` — `combatSystem.ts#updateCombat`,
// compartilhado com `appDuelo.ts`). Habilidade de entrada (Intimidate etc.)
// passa a ter efeito mecanico de verdade tambem no PvP contra jogador.
//
// Resultado e persistido atomicamente via a RPC `aplicar_resultado_pvp`
// (service_role).
import type { PokeInstance } from '@/data/pokes'
import { eventosParaCliente, rodarConfronto, type ResultadoConfronto } from './confrontoHeadless.js'
import { ErroHttp, chamarRpc, selecionar, type Config } from './db.js'
import { calcularResultadoRanqueado, type EntradaJogador, type Resultado } from './pvpElo.js'
import { pvpRowToPoke, type LinhaTimePvp } from './pvpRow.js'

interface LinhaSessaoPvp {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: string
  modo: 'amistoso' | 'ranqueado' | 'ranqueado_bot'
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

// Exportado so pra teste direto (appPvp.test.ts) — sem precisar montar o
// Request/Config/mocks de RPC inteiros pra provar que a linha crua do
// banco vira um time que o motor aceita.
export function montarTime(linhas: LinhaTimePvp[] | null): PokeInstance[] {
  return (linhas ?? []).map(pvpRowToPoke).filter((p): p is PokeInstance => p != null)
}

function resultadoDoAnfitriao(r: ResultadoConfronto): Resultado {
  if (r.vencedor === 'A') return 'vitoria'
  if (r.vencedor === 'B') return 'derrota'
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
  const timeAnfitriao = montarTime(sessao.anfitriao_time)
  const timeConvidado = montarTime(sessao.convidado_time)
  if (timeAnfitriao.length === 0 || timeConvidado.length === 0) {
    throw new ErroHttp(409, 'Um dos times deste PvP esta vazio ou invalido.')
  }

  // Lado A do motor = anfitriao, lado B = convidado (ver
  // confrontoHeadless.ts#eventosParaCliente) — os dois times ja chegam com
  // HP cheio/sem status (pvpRowToPoke sempre grava `hp: stat_hp` e
  // `status: null`, nao um snapshot de batalha em andamento).
  const resultado = rodarConfronto(timeAnfitriao, timeConvidado, { ladoBGolpesProprios: true })
  const eventosTraduzidos = eventosParaCliente(resultado.eventos)
  const resultadoAnfitriao = resultadoDoAnfitriao(resultado)
  const vencedorId = resultadoAnfitriao === 'vitoria'
    ? sessao.anfitriao_id
    : resultadoAnfitriao === 'derrota' ? sessao.convidado_id : null

  // Amistoso e partida contra bot (PH-539) nao mexem em MMR/PDL — so o
  // ranqueado tem stakes de temporada.
  if (sessao.modo !== 'ranqueado') {
    await chamarRpc(cfg, 'aplicar_resultado_pvp', {
      p_sessao_id: sessaoId,
      p_vencedor_id: vencedorId,
      p_eventos: eventosTraduzidos,
      p_mmr_anfitriao: null,
      p_pdl_anfitriao: null,
      p_divisao_anfitriao: null,
      p_mmr_convidado: null,
      p_pdl_convidado: null,
      p_divisao_convidado: null,
      p_pdl_delta_anfitriao: null,
      p_pdl_delta_convidado: null,
    })
    return json({ vencedorId, eventos: eventosTraduzidos, turnos: resultado.eventos.length })
  }

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
    p_eventos: eventosTraduzidos,
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
    eventos: eventosTraduzidos,
    turnos: resultado.eventos.length,
    pdlDeltaAnfitriao: calculo.anfitriao.pdlDelta,
    pdlDeltaConvidado: calculo.convidado.pdlDelta,
  })
}
