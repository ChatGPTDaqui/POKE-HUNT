// Resolucao SERVER-SIDE do PvP — nunca o client reportando o proprio
// veredito (esse e o modelo antigo de `registrar_resultado_pvp`, aceitavel
// pro duelo social sem stakes, inaceitavel com MMR em jogo).
//
// PH-540: o duelo e a ARENA do motor (engine/arena.ts) — a mesma funcao que
// o cliente roda ao vivo, aqui headless, com a semente derivada do id da
// sessao. O cliente reproduz a luta com a mesma semente e os mesmos
// snapshots; o veredito que vale e o daqui.
//
// LADO A = ANFITRIAO. A arena e assimetrica (jogador x inimigo do motor),
// entao a reproducao exata so acontece no cliente que monta o anfitriao como
// `meuTime` — o proprio anfitriao, e todo caso contra bot. O convidado humano
// monta espelhado (ele como `meuTime`) e ve uma luta equivalente, nao a
// mesma; se ela discordar do veredito, a tela mostra o oficial (ver
// features/arena/arena.ts#vereditoParaTela).
//
// Resultado e persistido atomicamente via a RPC `aplicar_resultado_pvp`
// (service_role).
import type { PokeInstance } from '@/data/pokes'
import { LIVE_SIM_STEP_SECONDS, rodarArena, sementeDaSessao } from '#engine'
import { ErroHttp, chamarRpc, selecionar, type Config } from './db.js'
import { FATOR_DEFENSOR, calcularResultadoRanqueado, type EntradaJogador, type Resultado } from './pvpElo.js'
import { pvpRowToPoke, type LinhaTimePvp } from '#engine'

interface LinhaSessaoPvp {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: string
  modo: 'amistoso' | 'ranqueado' | 'ranqueado_bot'
  vencedor_id: string | null
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

// Exportado so pra teste direto (appPvp.test.ts).
export function montarTime(linhas: LinhaTimePvp[] | null): PokeInstance[] {
  return (linhas ?? []).map(pvpRowToPoke).filter((p): p is PokeInstance => p != null)
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
  const semente = sementeDaSessao(sessao.id)
  if (sessao.estado !== 'aberta') {
    // Idempotente: o outro participante ja disparou a resolucao primeiro —
    // este ainda precisa do veredito pra reproduzir a luta do lado dele.
    return json({ jaResolvido: true, vencedorId: sessao.vencedor_id, semente })
  }
  const timeAnfitriao = montarTime(sessao.anfitriao_time)
  const timeConvidado = montarTime(sessao.convidado_time)
  if (timeAnfitriao.length === 0 || timeConvidado.length === 0) {
    throw new ErroHttp(409, 'Um dos times deste PvP esta vazio ou invalido.')
  }

  // PH-552: quem apresenta primeiro. So no amistoso o anfitriao (quem
  // convidou) e a casa; no ranqueado e contra bot a casa e o convidado —
  // `meuTime` aqui e sempre o anfitriao, entao o valor segue esse lado.
  const casaEhOJogador = sessao.modo === 'amistoso'
  const { resultado } = rodarArena({ semente, meuTime: timeAnfitriao, rivalTime: timeConvidado, nomeDoRival: '', casaEhOJogador }, LIVE_SIM_STEP_SECONDS)
  const resultadoAnfitriao: Resultado = resultado === 'vitoria' ? 'vitoria' : resultado === 'derrota' ? 'derrota' : 'empate'
  const vencedorId = resultadoAnfitriao === 'vitoria'
    ? sessao.anfitriao_id
    : resultadoAnfitriao === 'derrota' ? sessao.convidado_id : null

  // Amistoso e partida contra bot (PH-539) nao mexem em MMR/PDL — so o
  // ranqueado tem stakes de temporada.
  if (sessao.modo !== 'ranqueado') {
    await chamarRpc(cfg, 'aplicar_resultado_pvp', {
      p_sessao_id: sessaoId,
      p_vencedor_id: vencedorId,
      p_eventos: null,
      p_mmr_anfitriao: null,
      p_pdl_anfitriao: null,
      p_divisao_anfitriao: null,
      p_mmr_convidado: null,
      p_pdl_convidado: null,
      p_divisao_convidado: null,
      p_pdl_delta_anfitriao: null,
      p_pdl_delta_convidado: null,
    })
    return json({ vencedorId, semente })
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
  // PH-565: ranqueado e sempre atacante (anfitriao) x defesa salva (convidado).
  const calculo = calcularResultadoRanqueado(entradaAnfitriao, entradaConvidado, resultadoAnfitriao, FATOR_DEFENSOR)

  await chamarRpc(cfg, 'aplicar_resultado_pvp', {
    p_sessao_id: sessaoId,
    p_vencedor_id: vencedorId,
    p_eventos: null,
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
    semente,
    pdlDeltaAnfitriao: calculo.anfitriao.pdlDelta,
    pdlDeltaConvidado: calculo.convidado.pdlDelta,
  })
}
