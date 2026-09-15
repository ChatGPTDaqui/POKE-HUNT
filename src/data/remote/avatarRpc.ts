// Foto de perfil do treinador (PH-548): leitura em lote pela view
// `treinadores_publico` e escrita pela RPC `definir_avatar`.
//
// O avatar NAO faz parte do GameState nem do snapshot da autoridade: e um
// dado social (quem ve e o OUTRO jogador), lido pelo mesmo caminho que o nome
// no ranking/mercado/amigos. Assim o motor, o flush e os tipos do servidor
// ficam intocados.
import { supabase } from '@/lib/supabase'

const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** `Map<user_id, avatar|null>`; id que nao existe na view simplesmente nao vem. */
export async function avataresDe(userIds: readonly string[]): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds)].filter(Boolean)
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  const { data, error } = await db.from('treinadores_publico')
    .select('user_id, avatar')
    .in('user_id', ids)
  falhou(error)
  for (const r of (data ?? []) as { user_id: string; avatar: string | null }[]) mapa.set(r.user_id, r.avatar ?? null)
  return mapa
}

/** `null` limpa a foto (volta ao icone padrao). Devolve o valor gravado. */
export async function definirAvatar(avatar: string | null): Promise<string | null> {
  const { data, error } = await db.rpc('definir_avatar', { p_avatar: avatar })
  falhou(error)
  return (data?.avatar as string | null | undefined) ?? null
}
