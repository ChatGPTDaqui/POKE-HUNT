// Correio sob RPC-everything: leitura RLS-direta (mail_messages.para_id =
// auth.uid(), friendships.user_id = auth.uid()) + as 3 RPCs de escrita ja
// testadas (#10) + Supabase Realtime no lugar de poll de 15s — pedido de
// amizade/mensagem nova chega por websocket.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type { AmigoRemoto, AnexoItemCorreio, MensagemCorreio } from './servidor'
import { useGameStateStore } from '@/stores/gameStateStore'

// `treinadores_publico` e view exclusiva do schema `dev` (ver migracao #9) —
// o gerador de tipos so conhece `public`, mesma razao documentada em
// `mercadoRpc.ts`/`acoesRpc.ts`.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

async function userIdAtual(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new ErroServidor(401, 'sem sessao — faca login de novo')
  return id
}

export async function correio(): Promise<{ mensagens: MensagemCorreio[]; amigos: AmigoRemoto[]; naoLidas: number }> {
  const uid = await userIdAtual()
  const [msgs, amizades] = await Promise.all([
    supabase.from('mail_messages').select('*').eq('para_id', uid).order('created_at', { ascending: false }).limit(100),
    supabase.from('friendships').select('amigo_id').eq('user_id', uid),
  ])
  if (msgs.error) throw new ErroServidor(409, msgs.error.message)
  if (amizades.error) throw new ErroServidor(409, amizades.error.message)

  const amigoIds = (amizades.data ?? []).map((r) => r.amigo_id)
  const { data: nomes } = amigoIds.length
    ? await db.from('treinadores_publico').select('user_id, trainer_name, trainer_level').in('user_id', amigoIds)
    : { data: [] as { user_id: string; trainer_name: string; trainer_level: number }[] }

  const mensagens = (msgs.data ?? []) as unknown as MensagemCorreio[]
  const amigos: AmigoRemoto[] = (nomes ?? []).map((n: { user_id: string; trainer_name: string; trainer_level: number }) =>
    ({ userId: n.user_id, nome: n.trainer_name, nivel: n.trainer_level }))
  const naoLidas = mensagens.filter((m) => m.estado === 'pendente').length
  return { mensagens, amigos, naoLidas }
}

export async function pedirAmizade(nick: string): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('pedir_amizade', { p_nick: nick })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function responderPedido(mensagemId: string, aceitar: boolean): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('responder_pedido_amizade', { p_mensagem_id: mensagemId, p_aceitar: aceitar })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function marcarLida(mensagemId: string): Promise<{ ok: boolean }> {
  // RPC em vez de UPDATE direto (PH-22): o filtro de "nao marcar lido com
  // anexo pendente" precisa rodar no banco, nao so na UI (CorreioMenu.tsx so
  // evita CLICAR nesse caso, mas RLS-direct nao tem como aplicar essa regra).
  const { error } = await db.rpc('marcar_correio_lido', { p_mensagem_id: mensagemId })
  if (error) throw new ErroServidor(409, error.message)
  return { ok: true }
}

export async function coletarAnexo(mensagemId: string): Promise<{ ok: boolean; itens: AnexoItemCorreio[]; mensagem: string }> {
  const { data, error } = await db.rpc('coletar_anexo_correio', { p_mensagem_id: mensagemId })
  if (error) throw new ErroServidor(409, error.message)
  const resultado = data as { ok: boolean; itens: AnexoItemCorreio[]; mensagem: string }

  // A RPC ja creditou os itens na mesma transacao (sem fila de entrega, ver
  // migracao #10) — so falta o client saber. Refetch cirurgico so dos itemIds
  // que vieram no retorno, em vez de recarregar o estado inteiro.
  const uid = await userIdAtual()
  const idsUnicos = [...new Set(resultado.itens.map((i) => i.itemId))]
  if (idsUnicos.length > 0) {
    const { data: linhas } = await supabase.from('player_items').select('item_id, quantity').eq('user_id', uid).in('item_id', idsUnicos)
    const porId = new Map((linhas ?? []).map((r) => [r.item_id, r.quantity]))
    useGameStateStore.setState((s) => ({
      items: { ...s.items, ...Object.fromEntries(idsUnicos.map((id) => [id, porId.get(id) ?? 0])) },
    }))
  }
  return resultado
}

/** Assina INSERT+UPDATE nas MINHAS mensagens. Devolve a funcao de cancelar. */
export function assinarCorreioAoVivo(userId: string, aoMudar: () => void): () => void {
  const canal = supabase
    .channel(`correio-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'dev', table: 'mail_messages', filter: `para_id=eq.${userId}` },
      () => aoMudar(),
    )
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
