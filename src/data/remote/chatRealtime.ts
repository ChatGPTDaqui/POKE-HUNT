// Chat Mundo sob RPC-everything: leitura+escrita RLS-direta (insert simples,
// sem invariante alem do dono da linha e do check de tamanho ja no banco) +
// Supabase Realtime no lugar do polling de 6s — mensagem de outro jogador
// chega via websocket, nao por reconsulta periodica.
import { supabase, SCHEMA_DO_BANCO } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type { AnexoChat, MensagemChat } from './servidor'

const LIMITE_HISTORICO = 50

export async function lerChat(): Promise<{ mensagens: MensagemChat[] }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(LIMITE_HISTORICO)
  if (error) throw new ErroServidor(409, error.message)
  return { mensagens: (data ?? []).slice().reverse() as unknown as MensagemChat[] }
}

export async function enviarChat(body: string, anexos: AnexoChat[]): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession()
  const userId = sessao.session?.user.id
  if (!userId) throw new ErroServidor(401, 'sem sessao — faca login de novo')
  const { data: jogador } = await supabase.from('players').select('trainer_name').eq('user_id', userId).maybeSingle()
  const { error } = await supabase.from('chat_messages').insert({
    user_id: userId, trainer_name: jogador?.trainer_name ?? 'Treinador', body, anexos,
  } as never)
  if (error) throw new ErroServidor(409, error.message)
}

/** Assina o INSERT ao vivo. Devolve a funcao de cancelar a assinatura. */
export function assinarChatAoVivo(aoChegar: (mensagem: MensagemChat) => void): () => void {
  const canal = supabase
    .channel('chat-mundo')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: SCHEMA_DO_BANCO, table: 'chat_messages' },
      (payload) => aoChegar(payload.new as unknown as MensagemChat),
    )
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
