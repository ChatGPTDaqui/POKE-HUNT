// De uma sessao de PvP resolvida (veredito + semente do servidor) pra entrada
// da arena (PH-540). O anfitriao reproduz exatamente a luta do servidor
// (mesmo lado A); o convidado monta espelhado e ve uma luta equivalente —
// ver authority/src/appPvp.ts.
import type { RespostaResolverPvp } from '@/data/remote/servidor'
import * as pvpRpc from '@/data/remote/pvpRpc'
import type { EntradaNaArena, VereditoDaArena } from '@/features/arena/arena'

export async function arenaDaSessao(
  sessao: pvpRpc.SessaoPvp,
  meuId: string,
  res: RespostaResolverPvp,
  nomePadrao: string,
): Promise<EntradaNaArena | null> {
  const souAnfitriao = sessao.anfitriaoId === meuId
  const meuTime = souAnfitriao ? sessao.anfitriaoTime : sessao.convidadoTime
  const rivalTime = souAnfitriao ? sessao.convidadoTime : sessao.anfitriaoTime
  if (meuTime.length === 0 || rivalTime.length === 0) return null

  const oponenteId = souAnfitriao ? sessao.convidadoId : sessao.anfitriaoId
  const nomeDoRival = (await pvpRpc.nomeDoTreinador(oponenteId).catch(() => null)) ?? nomePadrao
  const veredito: VereditoDaArena = res.vencedorId == null
    ? 'empate'
    : res.vencedorId === meuId ? 'vitoria' : 'derrota'

  // PH-552: mesma regra do servidor (authority/src/appPvp.ts): no amistoso a
  // casa e o anfitriao; no ranqueado e contra bot, o convidado. O convidado
  // monta espelhado, entao pra ele o valor inverte.
  const casaEhOAnfitriao = sessao.modo === 'amistoso'
  const casaEhOJogador = souAnfitriao ? casaEhOAnfitriao : !casaEhOAnfitriao
  return { semente: res.semente, meuTime, rivalTime, nomeDoRival, rivalId: oponenteId, veredito, casaEhOJogador }
}
