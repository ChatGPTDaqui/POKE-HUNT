// Ranking e Perfil sob RPC-everything: leitura publica via RLS-direto
// (dev.treinadores_publico, dev.ranking_pokemon, dev.hall_da_fama) + a RPC
// dev.meu_perfil() pro que precisa agregar entre jogadores (rank, total,
// tempo jogado) — RLS de `players`/`game_sessions` sozinha so mostra a
// propria linha, sem view/RPC publica nao da pra contar as dos outros.
import { supabase } from '@/lib/supabase'
import { rowToPoke } from './playerMapper'
import type { CriterioPoke, EntradaHall, EntradaPoke, EntradaTreinador, PerfilPublico, PerfilRemoto } from './servidor'

// `treinadores_publico`/`ranking_pokemon`/`meu_perfil` vivem so no schema
// `dev` — mesma razao (gerador de tipos so conhece `public`) documentada em
// `mercadoRpc.ts`.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

const COLUNA_POR_CRITERIO: Record<CriterioPoke, string> = {
  level: 'level',
  atkFis: 'stat_atk_fis',
  atkEsp: 'stat_atk_esp',
  hp: 'stat_hp',
  def: 'stat_def',
  defEsp: 'stat_def_esp',
  speed: 'stat_speed',
}

export async function rankingTreinadores(limite = 50): Promise<{ entradas: EntradaTreinador[] }> {
  const { data, error } = await db.from('treinadores_publico')
    .select('user_id, trainer_name, trainer_level, trainer_exp')
    .order('trainer_level', { ascending: false }).order('trainer_exp', { ascending: false }).limit(limite)
  if (error) throw new Error(error.message)
  const entradas: EntradaTreinador[] = (data ?? []).map((r: any) => ({
    userId: r.user_id, nome: r.trainer_name, nivel: r.trainer_level, exp: r.trainer_exp,
  }))
  return { entradas }
}

/**
 * Teto de linhas do ranking de POKE, e nao um `default` qualquer: a view
 * `ranking_pokemon` MATERIALIZA o top 50 de cada criterio (PH-105 — ela deixou
 * de ser `select *` da tabela inteira pra parar de vazar POKE de terceiro).
 * Pedir mais de 50 nao daria erro: encheria o fim da lista com linha que entrou
 * ali pelo top de OUTRO criterio. Cortar aqui e explicito; a alternativa e uma
 * lista silenciosamente errada.
 */
const TETO_POR_CRITERIO = 50

export async function rankingPokemon(criterio: CriterioPoke, limite = TETO_POR_CRITERIO): Promise<{ entradas: EntradaPoke[] }> {
  const coluna = COLUNA_POR_CRITERIO[criterio]
  const { data, error } = await db.from('ranking_pokemon').select('*').order(coluna, { ascending: false })
    .limit(Math.min(limite, TETO_POR_CRITERIO))
  if (error) throw new Error(error.message)
  const entradas: EntradaPoke[] = (data ?? []).map((r: any) => ({
    userId: r.user_id,
    treinador: r.treinador,
    treinadorOriginal: r.original_trainer ?? null,
    valor: r[coluna],
    poke: rowToPoke(r),
  }))
  return { entradas }
}

export async function hallDaFama(limite = 50): Promise<{ entradas: EntradaHall[] }> {
  const { data, error } = await db.from('hall_da_fama').select('user_id, conquistado_em').order('conquistado_em', { ascending: true }).limit(limite)
  if (error) throw new Error(error.message)
  const linhas = (data ?? []) as { user_id: string; conquistado_em: string }[]
  const ids = linhas.map((r) => r.user_id)
  const { data: nomes } = ids.length
    ? await db.from('treinadores_publico').select('user_id, trainer_name').in('user_id', ids)
    : { data: [] as { user_id: string; trainer_name: string }[] }
  const nomePorId = new Map<string, string>((nomes ?? []).map((n: { user_id: string; trainer_name: string }) => [n.user_id, n.trainer_name]))
  const entradas: EntradaHall[] = linhas.map((r) => ({
    userId: r.user_id, nome: nomePorId.get(r.user_id) ?? '?', conquistadoEm: r.conquistado_em,
  }))
  return { entradas }
}

export async function perfil(): Promise<PerfilRemoto> {
  const { data, error } = await db.rpc('meu_perfil')
  if (error) throw new Error(error.message)
  const r = data as { rank: number; totalJogadores: number; segundosJogados: number; contaCriadaEm: string | null; noHallDaFama: string | null }
  return {
    rank: r.rank, totalJogadores: r.totalJogadores, segundosJogados: Number(r.segundosJogados),
    contaCriadaEm: r.contaCriadaEm, noHallDaFama: r.noHallDaFama,
  }
}

/**
 * O perfil de OUTRO jogador (PH-119).
 *
 * `null` quando o treinador não existe mais — a RPC devolve `{ existe: false }`
 * em vez de estourar, porque chegar aqui a partir de um anúncio de conta apagada
 * é um caso real, e um toast vermelho seria a resposta errada para "esse
 * treinador não existe mais".
 */
export async function perfilPublico(userId: string): Promise<PerfilPublico | null> {
  const { data, error } = await db.rpc('perfil_publico', { p_user_id: userId })
  if (error) throw new Error(error.message)
  const r = data as ({ existe: false } | (PerfilPublico & { existe: true })) | null
  if (!r || !r.existe) return null
  return {
    userId: r.userId,
    nome: r.nome,
    nivel: Number(r.nivel),
    exp: Number(r.exp),
    rank: Number(r.rank),
    totalJogadores: Number(r.totalJogadores),
    // `numeric` do Postgres chega como string no PostgREST quando passa do
    // alcance do `number` — o mesmo `Number()` que `perfil()` já faz acima.
    segundosJogados: Number(r.segundosJogados),
    contaCriadaEm: r.contaCriadaEm,
    noHallDaFama: r.noHallDaFama,
    capturas: Number(r.capturas),
    anunciosAtivos: Number(r.anunciosAtivos),
  }
}
