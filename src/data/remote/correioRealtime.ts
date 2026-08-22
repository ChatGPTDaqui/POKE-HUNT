// Correio sob RPC-everything: leitura RLS-direta (mail_messages.para_id =
// auth.uid(), friendships.user_id = auth.uid()) + as 3 RPCs de escrita ja
// testadas (#10) + Supabase Realtime no lugar de poll de 15s — pedido de
// amizade/mensagem nova chega por websocket.
import { schema, supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type {
  AmigoDetalhado, AnexoItemCorreio, BloqueadoRemoto, MensagemCorreio,
} from './servidor'
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

export interface CaixaDoCorreio {
  mensagens: MensagemCorreio[]
  /** Caixa de enviados: so as que EU escrevi e ainda nao apaguei do meu lado. */
  enviados: MensagemCorreio[]
  amigos: AmigoDetalhado[]
  bloqueados: BloqueadoRemoto[]
  naoLidas: number
}

export async function correio(): Promise<CaixaDoCorreio> {
  const uid = await userIdAtual()
  const [msgs, enviadas, detalhes] = await Promise.all([
    // `excluido_destinatario_em is null`: exclusao e soft e por lado (PH-74).
    // Filtrar aqui e nao na tela mantem `naoLidas` e o badge do HUD honestos —
    // mensagem apagada nao pode continuar contando como pendencia.
    supabase.from('mail_messages').select('*').eq('para_id', uid)
      .is('excluido_destinatario_em', null)
      .order('created_at', { ascending: false }).limit(100),
    // Enviados so lista `texto`: pedido de amizade e aviso de sistema tambem
    // gravam `de_id`, mas ninguem pensa neles como "mensagem que eu mandei".
    supabase.from('mail_messages').select('*').eq('de_id', uid).eq('tipo', 'texto')
      .is('excluido_remetente_em', null)
      .order('created_at', { ascending: false }).limit(100),
    db.rpc('amigos_detalhados'),
  ])
  if (msgs.error) throw new ErroServidor(409, msgs.error.message)
  if (enviadas.error) throw new ErroServidor(409, enviadas.error.message)
  if (detalhes.error) throw new ErroServidor(409, detalhes.error.message)

  const mensagens = (msgs.data ?? []) as unknown as MensagemCorreio[]
  const enviados = (enviadas.data ?? []) as unknown as MensagemCorreio[]

  // `para_nome` nao existe como coluna (so `de_nome` e desnormalizado). Uma
  // consulta pros destinatarios distintos, nao uma por linha.
  const destinatarios = [...new Set(enviados.map((m) => m.para_id).filter(Boolean))] as string[]
  if (destinatarios.length) {
    const { data: nomes } = await db.from('treinadores_publico')
      .select('user_id, trainer_name').in('user_id', destinatarios)
    const porId = new Map<string, string>(
      (nomes ?? []).map((n: { user_id: string; trainer_name: string }) => [n.user_id, n.trainer_name]),
    )
    for (const m of enviados) m.para_nome = porId.get(m.para_id ?? '') ?? 'Treinador'
  }

  const retorno = (detalhes.data ?? {}) as { amigos?: AmigoDetalhado[]; bloqueados?: BloqueadoRemoto[] }
  const naoLidas = mensagens.filter((m) => m.estado === 'pendente').length
  return {
    mensagens,
    enviados,
    amigos: retorno.amigos ?? [],
    bloqueados: retorno.bloqueados ?? [],
    naoLidas,
  }
}

export async function enviarCorreio(
  paraNick: string, assunto: string, corpo: string, anexos: AnexoItemCorreio[] = [],
): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('enviar_correio', {
    p_para_nick: paraNick, p_assunto: assunto, p_corpo: corpo, p_anexos: anexos,
  })
  if (error) throw new ErroServidor(409, error.message)

  // A RPC debita o anexo do inventario do REMETENTE na mesma transacao — o
  // estado local precisa refletir isso na hora, senao a Mochila mostra item que
  // ja saiu. Mesmo refetch cirurgico de `coletarAnexo`, no sentido inverso.
  if (anexos.length) {
    const uid = await userIdAtual()
    const ids = [...new Set(anexos.map((a) => a.itemId))]
    const { data: linhas, error: erroRefetch } = await supabase
      .from('player_items').select('item_id, quantity').eq('user_id', uid).in('item_id', ids)
    if (erroRefetch) {
      console.error('enviarCorreio: refetch de itens falhou, mantendo estado local', erroRefetch)
    } else {
      const porId = new Map((linhas ?? []).map((r) => [r.item_id, r.quantity]))
      useGameStateStore.setState((s) => ({
        items: { ...s.items, ...Object.fromEntries(ids.map((id) => [id, porId.get(id) ?? 0])) },
      }))
    }
  }
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function responderCorreio(mensagemId: string, corpo: string): Promise<{ mensagem: string }> {
  // Destinatario e assunto saem da mensagem original DENTRO da RPC. Mandar o
  // nick daqui deixaria um client adulterado escrever pra qualquer um alegando
  // que e resposta.
  const { data, error } = await db.rpc('responder_correio', { p_mensagem_id: mensagemId, p_corpo: corpo })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function excluirCorreio(mensagemId: string): Promise<{ ok: boolean }> {
  const { error } = await db.rpc('excluir_correio', { p_mensagem_id: mensagemId })
  if (error) throw new ErroServidor(409, error.message)
  return { ok: true }
}

export async function removerAmizade(amigoId: string): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('remover_amizade', { p_amigo_id: amigoId })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function bloquearJogador(alvoId: string): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('bloquear_jogador', { p_alvo_id: alvoId })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
}

export async function desbloquearJogador(alvoId: string): Promise<{ mensagem: string }> {
  const { data, error } = await db.rpc('desbloquear_jogador', { p_alvo_id: alvoId })
  if (error) throw new ErroServidor(409, error.message)
  return { mensagem: (data as { mensagem: string }).mensagem }
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
    const { data: linhas, error: erroRefetch } = await supabase
      .from('player_items').select('item_id, quantity').eq('user_id', uid).in('item_id', idsUnicos)
    // A RPC ja creditou de verdade (linha 72) — se so o refetch de exibicao
    // falhar, zerar aqui mostraria quantidade errada pra um item que o
    // jogador acabou de receber. Loga e mantem o estado local.
    if (erroRefetch) {
      console.error('coletarAnexo: refetch de itens falhou, mantendo estado local', erroRefetch)
    } else {
      const porId = new Map((linhas ?? []).map((r) => [r.item_id, r.quantity]))
      useGameStateStore.setState((s) => ({
        items: { ...s.items, ...Object.fromEntries(idsUnicos.map((id) => [id, porId.get(id) ?? 0])) },
      }))
    }
  }
  return resultado
}

/** Assina INSERT+UPDATE nas MINHAS mensagens. Devolve a funcao de cancelar. */
export function assinarCorreioAoVivo(userId: string, aoMudar: () => void): () => void {
  const canal = supabase
    .channel(`correio-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema, table: 'mail_messages', filter: `para_id=eq.${userId}` },
      () => aoMudar(),
    )
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
