// Conquistas: leitura do que o jogador tem e do progresso do resto.
//
// A RPC `minhas_conquistas` AVALIA antes de responder (migration
// 20261014130000): e assim que fecham as conquistas que nao dependem da hunt
// (PvP, troca, Especialidades, Diario) sem cada uma dessas RPCs precisar
// avisar o sistema de conquistas.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'

export interface MinhasConquistas {
  /** Ids que fecharam NESTA chamada (celebrar). */
  novas: string[]
  /** id -> quando desbloqueou (ISO). */
  desbloqueadas: Record<string, string>
  /** id -> valor atual, so das que ainda faltam. */
  progresso: Record<string, number>
}

export async function lerMinhasConquistas(): Promise<MinhasConquistas> {
  const { data, error } = await supabase.rpc('minhas_conquistas' as never)
  if (error) throw new ErroServidor(409, error.message)
  const r = (data ?? {}) as Partial<MinhasConquistas>
  return {
    novas: Array.isArray(r.novas) ? r.novas : [],
    desbloqueadas: r.desbloqueadas ?? {},
    progresso: Object.fromEntries(Object.entries(r.progresso ?? {}).map(([k, v]) => [k, Number(v)])),
  }
}
