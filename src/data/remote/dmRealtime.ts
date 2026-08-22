// Conversa privada entre amigos (PH-74).
//
// Leitura RLS-direta (`friend_messages` tem policy de SELECT pros dois lados do
// fio) + escrita so por RPC. A tabela NAO tem policy de INSERT de proposito:
// amizade, bloqueio e rate limit sao verificados dentro de `enviar_dm`, e uma
// policy de insert abriria rota paralela sem nenhuma dessas checagens — o mesmo
// furo que PH-23 encontrou no chat mundial.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type { MensagemDM } from './servidor'

/**
 * Schema alvo do Realtime.
 *
 * Resolvido aqui em vez de importado porque `src/lib/supabase.ts` guarda o dele
 * como `const` privado. Exportar de la seria uma linha, mas aquele arquivo ja e
 * modificado por outra PR aberta (#34) e pelas duas tentativas de PH-38/PH-66 —
 * mexer nele daqui so cria conflito de merge por uma constante de 1 linha.
 *
 * O valor tem que sair do env, NAO ser a string 'dev' fixa que
 * `chatRealtime.ts`/`correioRealtime.ts` ainda usam: no Realtime o schema e
 * parametro do filtro de `postgres_changes` e o client nao o preenche sozinho,
 * entao em producao aquilo assina eventos de uma tabela que o jogo nao le
 * (PH-38/PH-66, ainda em aberto — nao corrigido aqui, e outra issue).
 */
const SCHEMA_DO_REALTIME = (import.meta.env.VITE_SUPABASE_SCHEMA as string | undefined) || 'public'

// Mesmo escape hatch de `correioRealtime.ts`/`acoesRpc.ts`: o gerador de tipos
// so conhece as tabelas de `public` do schema ATIVO no banco, e `friend_messages`
// so passa a existir la depois do `db push` desta migration.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

/** Quantas mensagens o fio carrega por vez. */
export const PAGINA_DM = 30

/**
 * Um trecho da conversa com um amigo, do mais antigo pro mais novo.
 *
 * `antesDe` pagina pra tras (historico): passa o `created_at` da mensagem mais
 * antiga que ja esta na tela. Sem cursor a paginacao por OFFSET desalinharia a
 * cada mensagem nova que chega no meio da rolagem.
 */
export async function lerConversa(
  amigoId: string, antesDe?: string,
): Promise<{ mensagens: MensagemDM[]; temMais: boolean }> {
  const { data: sessao } = await supabase.auth.getSession()
  const uid = sessao.session?.user.id
  if (!uid) throw new ErroServidor(401, 'sem sessao — faca login de novo')

  let q = db.from('friend_messages')
    .select('*')
    // As duas direcoes do fio. `or` com and-aninhado e a forma que o PostgREST
    // aceita: (de=eu e para=ele) ou (de=ele e para=eu).
    .or(`and(de_id.eq.${uid},para_id.eq.${amigoId}),and(de_id.eq.${amigoId},para_id.eq.${uid})`)
    .order('created_at', { ascending: false })
    // Pede uma a mais que a pagina so pra saber se ainda ha historico — mais
    // barato que um count() separado.
    .limit(PAGINA_DM + 1)
  if (antesDe) q = q.lt('created_at', antesDe)

  const { data, error } = await q
  if (error) throw new ErroServidor(409, error.message)

  const linhas = (data ?? []) as MensagemDM[]
  const temMais = linhas.length > PAGINA_DM
  const pagina = temMais ? linhas.slice(0, PAGINA_DM) : linhas
  // Veio do banco em ordem decrescente (pro `limit` pegar as mais RECENTES);
  // a tela le de cima pra baixo.
  return { mensagens: pagina.reverse(), temMais }
}

export async function enviarDm(paraId: string, corpo: string): Promise<{ id: string }> {
  const { data, error } = await db.rpc('enviar_dm', { p_para_id: paraId, p_corpo: corpo })
  if (error) throw new ErroServidor(409, error.message)
  return { id: (data as { id: string }).id }
}

export async function marcarDmLidas(amigoId: string): Promise<{ marcadas: number }> {
  const { data, error } = await db.rpc('marcar_dm_lidas', { p_amigo_id: amigoId })
  if (error) throw new ErroServidor(409, error.message)
  return { marcadas: (data as { marcadas: number }).marcadas }
}

/**
 * Assina as DMs que CHEGAM pra mim. Devolve a funcao de cancelar.
 *
 * Usa `SCHEMA_DO_REALTIME` (ver acima), nao a string 'dev' fixa das outras duas
 * assinaturas do jogo — escrito certo aqui pra nao herdar o bug de PH-38/PH-66.
 *
 * O filtro e so `para_id`: o Realtime aceita um filtro por assinatura, e o eco
 * das MINHAS mensagens ja vem do retorno de `enviarDm`, sem depender do socket.
 */
export function assinarDmAoVivo(userId: string, aoChegar: (m: MensagemDM) => void): () => void {
  const canal = supabase
    .channel(`dm-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: SCHEMA_DO_REALTIME, table: 'friend_messages', filter: `para_id=eq.${userId}` },
      (payload) => aoChegar(payload.new as unknown as MensagemDM),
    )
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
