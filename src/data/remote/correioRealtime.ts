// O correio como CONVERSA (PH-81), nao mais como caixa de cartas avulsas.
//
// Antes daqui havia duas camadas, `correioRealtime.ts` (carta, por `para_id`) e
// `dmRealtime.ts` (fio, por par, so entre amigos), e a mesma pessoa tinha duas
// caixas com o mesmo interlocutor. `dmRealtime.ts` foi absorvido por este
// arquivo junto com `friend_messages`; o que sobrou dele de melhor — a leitura
// paginada por cursor e o schema do Realtime vindo do env — veio junto.
//
// Leitura continua RLS-direta (`mail_messages` tem policy pros dois lados) e
// escrita continua so por RPC: a tabela NAO tem policy de INSERT de proposito,
// porque bloqueio, rate limit e debito de anexo vivem dentro de
// `enviar_mensagem`. Uma policy de insert abriria rota paralela sem nenhuma
// dessas checagens — o mesmo furo que PH-23 achou no chat mundial.
import { schema, supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import type {
  AmigoDetalhado, AnexoItemCorreio, BloqueadoRemoto, ConversaResumo, MensagemCorreio,
} from './servidor'
import { useGameStateStore } from '@/stores/gameStateStore'
import { refetchEquipeInteira } from './acoesRpc'


// `treinadores_publico` e view exclusiva do schema `dev`, e as RPCs novas so
// existem depois do `db push` — o gerador de tipos so conhece o `public` do
// banco atual. Mesmo escape hatch de `mercadoRpc.ts`/`acoesRpc.ts`.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

async function userIdAtual(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new ErroServidor(401, 'sem sessão — faca login de novo')
  return id
}

export interface CaixaDoCorreio {
  /** Um registro por CONTATO, mais recente primeiro. A tela inicial. */
  conversas: ConversaResumo[]
  /**
   * Aviso de sistema e pedido de amizade. Ficam FORA da conversa de proposito:
   * aviso de sistema nao tem interlocutor (`de_id` nulo) e pedido de amizade e
   * uma decisao a tomar, nao uma fala num fio.
   */
  avisos: MensagemCorreio[]
  amigos: AmigoDetalhado[]
  bloqueados: BloqueadoRemoto[]
  /** Soma das nao lidas de todas as conversas, mais os avisos pendentes. */
  naoLidas: number
}

export async function correio(): Promise<CaixaDoCorreio> {
  const uid = await userIdAtual()
  const [fios, avisosQ, detalhes] = await Promise.all([
    db.rpc('conversas'),
    // Avisos continuam RLS-direto: sao poucos, so chegam (nunca saem) e nao
    // precisam do agrupamento por par que a RPC de conversas faz.
    supabase.from('mail_messages').select('*').eq('para_id', uid)
      .neq('tipo', 'texto')
      .is('excluido_destinatario_em', null)
      .order('created_at', { ascending: false }).limit(100),
    db.rpc('amigos_detalhados'),
  ])
  if (fios.error) throw new ErroServidor(409, fios.error.message)
  if (avisosQ.error) throw new ErroServidor(409, avisosQ.error.message)
  if (detalhes.error) throw new ErroServidor(409, detalhes.error.message)

  const conversas = (fios.data ?? []) as ConversaResumo[]
  const avisos = (avisosQ.data ?? []) as unknown as MensagemCorreio[]
  const retorno = (detalhes.data ?? {}) as { amigos?: AmigoDetalhado[]; bloqueados?: BloqueadoRemoto[] }

  const naoLidas = conversas.reduce((t, c) => t + c.naoLidas, 0)
    + avisos.filter((a) => a.estado === 'pendente').length

  return {
    conversas,
    avisos,
    amigos: retorno.amigos ?? [],
    bloqueados: retorno.bloqueados ?? [],
    naoLidas,
  }
}

/** Quantas mensagens o fio carrega por vez. */
export const PAGINA_CONVERSA = 30

/**
 * Um trecho do fio com um contato, do mais antigo pro mais novo.
 *
 * `antesDe` pagina pra tras (historico): passa o `created_at` da mensagem mais
 * antiga que ja esta na tela. Cursor, e nao OFFSET, porque mensagem nova
 * chegando no meio da rolagem desalinharia todas as paginas seguintes.
 */
export async function lerConversa(
  contatoId: string, antesDe?: string,
): Promise<{ mensagens: MensagemCorreio[]; temMais: boolean }> {
  const uid = await userIdAtual()

  let q = db.from('mail_messages')
    .select('*')
    .eq('tipo', 'texto')
    // As duas direcoes do fio. `or` com and-aninhado e a forma que o PostgREST
    // aceita: (de=eu e para=ele) ou (de=ele e para=eu).
    .or(`and(de_id.eq.${uid},para_id.eq.${contatoId}),and(de_id.eq.${contatoId},para_id.eq.${uid})`)
    .order('created_at', { ascending: false })
    // Pede uma a mais que a pagina so pra saber se ainda ha historico — mais
    // barato que um count() separado.
    .limit(PAGINA_CONVERSA + 1)
  if (antesDe) q = q.lt('created_at', antesDe)

  const { data, error } = await q
  if (error) throw new ErroServidor(409, error.message)

  // A exclusao e por LADO, e o filtro depende de qual lado eu sou em cada
  // linha — nao da pra expressar num `.is()` so. Feito aqui, sobre a pagina.
  const linhas = ((data ?? []) as MensagemCorreio[]).filter((m) => (
    m.de_id === uid ? !m.excluido_remetente_em : !m.excluido_destinatario_em
  ))
  const temMais = linhas.length > PAGINA_CONVERSA
  const pagina = temMais ? linhas.slice(0, PAGINA_CONVERSA) : linhas
  // Veio decrescente (pro `limit` pegar as mais RECENTES); a tela le de cima
  // pra baixo.
  return { mensagens: pagina.reverse(), temMais }
}

/**
 * Manda mensagem num fio. `paraId` quando a conversa ja esta aberta (o caminho
 * normal), `paraNick` quando o jogador esta comecando uma nova.
 */
export async function enviarMensagem(
  destino: { paraId?: string; paraNick?: string },
  corpo: string,
  anexos: AnexoItemCorreio[] = [],
): Promise<{ id: string; paraId: string; paraNome: string }> {
  const { data, error } = await db.rpc('enviar_mensagem', {
    p_corpo: corpo,
    p_para_id: destino.paraId ?? null,
    p_para_nick: destino.paraNick ?? null,
    p_anexos: anexos,
  })
  if (error) throw new ErroServidor(409, error.message)

  // A RPC debita o anexo do inventario do REMETENTE na mesma transacao — o
  // estado local precisa refletir isso na hora, senao a Mochila mostra item que
  // ja saiu. Refetch cirurgico, so dos ids anexados.
  if (anexos.length) {
    const uid = await userIdAtual()
    const ids = [...new Set(anexos.map((a) => a.itemId))]
    const { data: linhas, error: erroRefetch } = await supabase
      .from('player_items').select('item_id, quantity').eq('user_id', uid).in('item_id', ids)
    if (erroRefetch) {
      console.error('enviarMensagem: refetch de itens falhou, mantendo estado local', erroRefetch)
    } else {
      const porId = new Map((linhas ?? []).map((r) => [r.item_id, r.quantity]))
      useGameStateStore.setState((s) => ({
        items: { ...s.items, ...Object.fromEntries(ids.map((id) => [id, porId.get(id) ?? 0])) },
      }))
    }
  }
  return data as { id: string; paraId: string; paraNome: string }
}

/** Zera as nao lidas de UM contato. Substituiu `marcar_dm_lidas`. */
export async function marcarConversaLida(contatoId: string): Promise<{ marcadas: number }> {
  const { data, error } = await db.rpc('marcar_conversa_lida', { p_contato_id: contatoId })
  if (error) throw new ErroServidor(409, error.message)
  return { marcadas: (data as { marcadas: number }).marcadas }
}

/** Apaga o fio inteiro do MEU lado. O outro continua com a copia dele. */
export async function excluirConversa(contatoId: string): Promise<{ apagadas: number }> {
  const { data, error } = await db.rpc('excluir_conversa', { p_contato_id: contatoId })
  if (error) throw new ErroServidor(409, error.message)
  return { apagadas: (data as { apagadas: number }).apagadas }
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
  // anexo pendente" precisa rodar no banco, nao so na UI.
  const { error } = await db.rpc('marcar_correio_lido', { p_mensagem_id: mensagemId })
  if (error) throw new ErroServidor(409, error.message)
  return { ok: true }
}

/**
 * POKE que a coleta acabou de criar (PH-164). Nulo quando o anexo era so item.
 *
 * Vem da RPC porque quem sabe o resultado e ela: a receita do anexo diz
 * `speciesId`, e o NOME da especie e o que a tela de recebimento mostra — pedir
 * de volta aqui seria uma leitura a mais pra um dado que a transacao ja tinha
 * em maos.
 */
export interface PokeRecebido {
  speciesId: string
  nome: string
  level: number
  isShiny: boolean
}

export interface ResultadoDaColeta {
  ok: boolean
  itens: AnexoItemCorreio[]
  poke: PokeRecebido | null
  mensagem: string
}

export async function coletarAnexo(mensagemId: string): Promise<ResultadoDaColeta> {
  const { data, error } = await db.rpc('coletar_anexo_correio', { p_mensagem_id: mensagemId })
  if (error) throw new ErroServidor(409, error.message)
  const resultado = data as ResultadoDaColeta

  // A RPC ja creditou os itens na mesma transacao — so falta o client saber.
  // Refetch cirurgico so dos itemIds que vieram no retorno.
  const uid = await userIdAtual()
  const idsUnicos = [...new Set(resultado.itens.map((i) => i.itemId))]
  if (idsUnicos.length > 0) {
    const { data: linhas, error: erroRefetch } = await supabase
      .from('player_items').select('item_id, quantity').eq('user_id', uid).in('item_id', idsUnicos)
    // A RPC ja creditou de verdade — se so o refetch de exibicao falhar, zerar
    // aqui mostraria quantidade errada pra um item recem-recebido.
    if (erroRefetch) {
      console.error('coletarAnexo: refetch de itens falhou, mantendo estado local', erroRefetch)
    } else {
      const porId = new Map((linhas ?? []).map((r) => [r.item_id, r.quantity]))
      useGameStateStore.setState((s) => ({
        items: { ...s.items, ...Object.fromEntries(idsUnicos.map((id) => [id, porId.get(id) ?? 0])) },
      }))
    }
  }

  // O POKE nasceu no SERVIDOR, dentro da mesma transacao (PH-164), e o estado
  // local nao sabe dele: sem isto a equipe so apareceria certa depois de um F5.
  //
  // O POKE novo nao corre risco de ser apagado nesse meio tempo — `savePlayerState`
  // so deleta o que estava em `idsNoBancoPorUsuario` na ultima carga, e um id que
  // nasceu depois nao esta la. O que se perde sem o refetch e a TELA, nao o POKE.
  //
  // Reusa o refetch das acoes de equipe em vez de refazer a leitura aqui: e ele
  // que carrega a regra do `order('team_slot')`, e uma copia que se desatualize
  // poe o POKE errado no campo.
  if (resultado.poke) await refetchEquipeInteira()

  return resultado
}

/**
 * Assina o que CHEGA pra mim em `mail_messages` — mensagem de conversa, aviso
 * de sistema e pedido de amizade, todos na mesma tabela.
 *
 * O filtro e so `para_id`: o Realtime aceita um filtro por assinatura, e o eco
 * das MINHAS mensagens ja vem do retorno de `enviarMensagem`, sem depender do
 * socket. `aoChegar` recebe a linha nova pra quem estiver com um fio aberto
 * poder anexar sem refetch; `aoMudar` avisa a lista pra recontar.
 */
export function assinarCorreioAoVivo(
  userId: string,
  aoMudar: () => void,
  aoChegar?: (m: MensagemCorreio) => void,
  /**
   * Sufixo do nome do canal. OBRIGATORIO quando ha mais de um assinante vivo ao
   * mesmo tempo — e ha: o menu escuta pra recontar os badges e o fio aberto
   * escuta pra anexar a linha nova.
   *
   * `supabase.channel(nome)` com um nome JA INSCRITO devolve o MESMO canal, e o
   * `.on()` seguinte estoura com "cannot add postgres_changes callbacks after
   * subscribe()". E o mesmo defeito que o comentario de `CorreioMenu.tsx`
   * descreve pro caso de remontagem — aqui seriam dois componentes distintos
   * disputando um nome so.
   */
  sufixo = 'menu',
): () => void {
  const canal = supabase
    .channel(`correio-${userId}-${sufixo}`)
    .on(
      'postgres_changes',
      { event: '*', schema, table: 'mail_messages', filter: `para_id=eq.${userId}` },
      (payload) => {
        if (payload.eventType === 'INSERT' && aoChegar) aoChegar(payload.new as unknown as MensagemCorreio)
        aoMudar()
      },
    )
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
