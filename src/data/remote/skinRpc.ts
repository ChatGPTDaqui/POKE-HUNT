// Skin do treinador em campo (09/10): leitura em lote pela view
// `treinadores_publico` e escrita pela RPC `definir_skin_treinador`.
//
// Mesmo molde do avatar (`avatarRpc.ts`): dado social, fora do GameState e do
// snapshot da autoridade. Consulta PROPRIA, e nao uma coluna a mais nas
// consultas que ja existem — enquanto a migration nao aplicou, so esta falha.
import { supabase } from '@/lib/supabase'

const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** `Map<user_id, skin|null>`; id que nao existe na view simplesmente nao vem. */
export async function skinsDe(userIds: readonly string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds)].filter(Boolean)
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  const { data, error } = await db.from('treinadores_publico')
    .select('user_id, skin_treinador')
    .in('user_id', ids)
  falhou(error)
  for (const r of (data ?? []) as { user_id: string; skin_treinador: string | null }[]) mapa.set(r.user_id, r.skin_treinador ?? null)
  return mapa
}

/** Grava a skin do proprio jogador. Devolve o valor gravado. */
export async function definirSkin(skin: string | null): Promise<string | null> {
  const { data, error } = await db.rpc('definir_skin_treinador', { p_skin: skin })
  falhou(error)
  return (data?.skin as string | null | undefined) ?? null
}
