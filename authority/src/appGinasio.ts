// Ginasios (23/10/2026): o servidor do jogo roda a luta de um desafio e aplica
// o resultado. Mesmo padrao do PvP (appPvp.ts): a luta e deterministica pela
// semente do desafio, o cliente assiste a MESMA luta ao vivo, e quem decide e
// esta rota. As equipes vem congeladas no desafio (`desafiar_ginasio`).
import { LIVE_SIM_STEP_SECONDS, equipeDoGinasio, rodarArena, sementeDaSessao, type PokeDeGinasio } from '#engine'
import { ErroHttp, chamarRpc, selecionar, type Config } from './db.js'

interface LinhaDesafio {
  id: string
  user_id: string
  ginasio_id: string
  estado: string
  ticks: number | null
  equipe_desafiante: PokeDeGinasio[]
  equipe_lider: PokeDeGinasio[]
}

function json(dado: unknown, status = 200): Response {
  return new Response(JSON.stringify(dado), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
}

/** Teto de nivel da faixa, pelo id do ginasio (`FIRE_300` -> 300). */
export function tetoDoGinasio(ginasioId: string): number {
  const n = Number(ginasioId.split('_')[1])
  if (![100, 200, 300, 400, 500].includes(n)) throw new ErroHttp(409, 'Ginasio invalido.')
  return n
}

/** A luta de um desafio, pura. Desafiante e o "meu time"; o lider e a casa. */
export function lutaDoDesafio(d: Pick<LinhaDesafio, 'id' | 'ginasio_id' | 'equipe_desafiante' | 'equipe_lider'>) {
  const teto = tetoDoGinasio(d.ginasio_id)
  const meuTime = equipeDoGinasio(d.equipe_desafiante, teto, `d-${d.id}`)
  const rivalTime = equipeDoGinasio(d.equipe_lider, teto, `l-${d.id}`)
  if (meuTime.length === 0 || rivalTime.length === 0) throw new ErroHttp(409, 'Uma das equipes deste desafio esta vazia.')
  const { resultado, ticks } = rodarArena({
    semente: sementeDaSessao(d.id), meuTime, rivalTime, nomeDoRival: '', casaEhOJogador: false,
  }, LIVE_SIM_STEP_SECONDS)
  return { resultado: resultado === 'lutando' ? 'empate' : resultado, ticks }
}

export async function resolverGinasio(cfg: Config, jogadorId: string, req: Request): Promise<Response> {
  const corpo = (await req.json().catch(() => null)) as { desafioId?: string } | null
  const desafioId = corpo?.desafioId
  if (!desafioId) throw new ErroHttp(400, 'desafioId e obrigatorio')
  const [d] = await selecionar<LinhaDesafio>(cfg, `ginasio_desafio?id=eq.${desafioId}&select=*`)
  if (!d) throw new ErroHttp(404, 'Desafio nao encontrado.')
  if (d.user_id !== jogadorId) throw new ErroHttp(403, 'Este desafio nao e seu.')
  if (d.estado !== 'aberto') return json({ resultado: d.estado, ticks: d.ticks, jaResolvido: true })

  const { resultado, ticks } = lutaDoDesafio(d)
  const aplicado = await chamarRpc<{ estado: string; ticks: number; insigniaNova?: boolean }>(cfg, '_aplicar_resultado_ginasio', {
    p_desafio: d.id, p_resultado: resultado, p_ticks: ticks,
  })
  return json({ resultado: aplicado?.estado ?? resultado, ticks: aplicado?.ticks ?? ticks, insigniaNova: aplicado?.insigniaNova ?? false })
}
