// Conquistas: o que o jogador tem, o progresso do resto, titulo/vitrine e o
// que os OUTROS exibem (perfil publico e ranking).
//
// A RPC `minhas_conquistas` AVALIA antes de responder (migration
// 20261014130000): e assim que fecham as conquistas que nao dependem da hunt
// (PvP, troca, Especialidades, Diario) sem cada uma dessas RPCs precisar
// avisar o sistema de conquistas.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'

// Mesmo escape de rankingRpc.ts: as views/RPCs vivem nos dois schemas e o tipo
// gerado so conhece um deles.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

export interface MinhasConquistas {
  /** Ids que fecharam NESTA chamada (celebrar). */
  novas: string[]
  /** id -> quando desbloqueou (ISO). */
  desbloqueadas: Record<string, string>
  /** id -> valor atual, so das que ainda faltam. */
  progresso: Record<string, number>
}

export async function lerMinhasConquistas(): Promise<MinhasConquistas> {
  const { data, error } = await db.rpc('minhas_conquistas')
  if (error) throw new ErroServidor(409, error.message)
  const r = (data ?? {}) as Partial<MinhasConquistas>
  return {
    novas: Array.isArray(r.novas) ? r.novas : [],
    desbloqueadas: r.desbloqueadas ?? {},
    progresso: Object.fromEntries(Object.entries(r.progresso ?? {}).map(([k, v]) => [k, Number(v)])),
  }
}

/** O que um treinador exibe: titulo, vitrine e quais conquistas tem. */
export interface ConquistasPublicas {
  titulo: string | null
  vitrine: string[]
  ids: string[]
}

export async function conquistasPublicas(userId: string): Promise<ConquistasPublicas> {
  const [perfil, lista] = await Promise.all([
    db.from('treinadores_publico').select('titulo, vitrine').eq('user_id', userId).maybeSingle(),
    db.from('player_conquistas').select('conquista_id').eq('user_id', userId),
  ])
  if (perfil.error) throw new Error(perfil.error.message)
  if (lista.error) throw new Error(lista.error.message)
  return {
    titulo: perfil.data?.titulo ?? null,
    vitrine: Array.isArray(perfil.data?.vitrine) ? perfil.data.vitrine : [],
    ids: (lista.data ?? []).map((r: { conquista_id: string }) => r.conquista_id),
  }
}

export async function definirTitulo(conquistaId: string | null): Promise<void> {
  const { error } = await db.rpc('definir_titulo', { p_conquista: conquistaId })
  if (error) throw new ErroServidor(409, error.message)
}

export async function definirVitrine(ids: string[]): Promise<void> {
  const { error } = await db.rpc('definir_vitrine', { p_conquistas: ids })
  if (error) throw new ErroServidor(409, error.message)
}

export interface EntradaRankingConquistas {
  userId: string
  nome: string
  titulo: string | null
  pontos: number
  feitas: number
  lendas: number
  platinado: boolean
}

export async function rankingConquistas(limite = 50): Promise<EntradaRankingConquistas[]> {
  const { data, error } = await db.rpc('ranking_conquistas', { p_limite: limite })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    userId: r.user_id,
    nome: r.trainer_name,
    titulo: r.titulo ?? null,
    pontos: Number(r.pontos),
    feitas: Number(r.feitas),
    lendas: Number(r.lendas),
    platinado: Boolean(r.platinado),
  }))
}
