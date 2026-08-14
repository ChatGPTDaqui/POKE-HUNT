// Ranking e Perfil sob RPC-everything: leitura publica via RLS-direto
// (dev.treinadores_publico, dev.ranking_pokemon, dev.hall_da_fama) + a RPC
// dev.meu_perfil() pro que precisa agregar entre jogadores (rank, total,
// tempo jogado) — RLS de `players`/`game_sessions` sozinha so mostra a
// propria linha, sem view/RPC publica nao da pra contar as dos outros.
import { supabase } from '@/lib/supabase'
import { rowToPoke } from './playerMapper'
import type { CriterioPoke, EntradaHall, EntradaPoke, EntradaTreinador, PerfilRemoto } from './servidor'

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

export async function rankingPokemon(criterio: CriterioPoke, limite = 50): Promise<{ entradas: EntradaPoke[] }> {
  const coluna = COLUNA_POR_CRITERIO[criterio]
  const { data, error } = await db.from('ranking_pokemon').select('*').order(coluna, { ascending: false }).limit(limite)
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
