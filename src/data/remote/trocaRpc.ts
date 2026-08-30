// Troca direta entre dois jogadores (PH-120), fatia 1: a MESA.
//
// O QUE ESTE ARQUIVO FAZ, E O QUE ELE AINDA NAO FAZ
// ---------------------------------------------------------------------------
// Abrir, aceitar e encerrar a mesa, e ler a mesa viva do jogador. O que vai EM
// CIMA dela — a oferta versionada, a reserva do que esta na mesa, a confirmacao
// dupla e a execucao atomica — e das fatias 2 e 3, e nao ha nenhum caminho aqui
// que mova POKE ou item.
//
// TODA ESCRITA PASSA POR RPC, e a tabela nao tem policy de INSERT/UPDATE. As
// regras que impedem o golpe (bloqueio, sessao dupla, quem pode aceitar, quem
// pode cancelar) vivem dentro das funcoes `security definer` — uma policy de
// escrita abriria rota paralela sem nenhuma delas, o mesmo furo que a PH-23
// achou no chat mundial e que o Correio evita do mesmo jeito.
//
// A LEITURA e RLS-direta: a policy da tabela ja limita a linha a quem esta nela.
import { supabase } from '@/lib/supabase'
import { ErroServidor } from './servidor'
import { ESTADOS_VIVOS, type EstadoDeTroca } from '@/data/troca'

// As RPCs so existem no banco depois do `db push`, e o gerador de tipos so
// conhece o schema atual — mesmo escape hatch de `correioRealtime.ts`,
// `mercadoRpc.ts` e `acoesRpc.ts`.
const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

/** A mesa como ela chega do banco. */
export interface SessaoDeTroca {
  id: string
  anfitriaoId: string
  convidadoId: string
  estado: EstadoDeTroca
  criadaEm: string
  expiraEm: string
  encerradaPor: string | null
  encerradaEm: string | null
}

interface LinhaDeTroca {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: EstadoDeTroca
  criada_em: string
  expira_em: string
  encerrada_por: string | null
  encerrada_em: string | null
}

function daLinha(l: LinhaDeTroca): SessaoDeTroca {
  return {
    id: l.id,
    anfitriaoId: l.anfitriao_id,
    convidadoId: l.convidado_id,
    estado: l.estado,
    criadaEm: l.criada_em,
    expiraEm: l.expira_em,
    encerradaPor: l.encerrada_por,
    encerradaEm: l.encerrada_em,
  }
}

/**
 * A mensagem do `raise exception` chega inteira do Postgres e ela E a mensagem
 * do jogador — as do SQL foram escritas assim de proposito ("Este jogador ja
 * esta em outra troca."). Repetir a traducao aqui criaria duas frases pro mesmo
 * caso, e a de fora envelheceria calada.
 */
function aoFalhar(erro: { message: string } | null): void {
  if (!erro) return
  throw new ErroServidor(400, erro.message)
}

/** Convida alguem pra trocar. O outro lado ainda precisa aceitar. */
export async function abrirTroca(convidadoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('abrir_troca', { p_convidado_id: convidadoId })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/** Aceita um convite. So o convidado consegue — o servidor confere. */
export async function aceitarTroca(sessaoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('aceitar_troca', { p_sessao_id: sessaoId })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/**
 * Sai da mesa. QUALQUER UM DOS DOIS pode, a qualquer momento, ate a fatia 3
 * executar — e isso e o oposto do golpe: quem desconfia sai sem depender do
 * outro.
 */
export async function encerrarTroca(sessaoId: string): Promise<SessaoDeTroca> {
  const { data, error } = await db.rpc('encerrar_troca', {
    p_sessao_id: sessaoId,
    p_motivo: 'cancelada',
  })
  aoFalhar(error)
  return daLinha(data as LinhaDeTroca)
}

/**
 * A mesa viva do jogador, ou `null`.
 *
 * Leitura direta com RLS: a policy ja limita as linhas a quem esta nelas, entao
 * nao ha filtro por `user_id` aqui — pedir isso ao cliente seria confiar nele
 * pra uma regra que o banco ja aplica.
 *
 * FILTRA POR `expira_em` ALEM DO ESTADO. A varredura do cron roda de 5 em 5
 * minutos, entao existe uma janela em que a linha ainda diz 'aberta' e o banco
 * ja a recusaria. Sem este corte a tela mostraria uma mesa que nao aceita mais
 * nada — e o jogador ficaria clicando num botao que so devolve erro.
 */
export async function minhaTrocaViva(): Promise<SessaoDeTroca | null> {
  const { data, error } = await db
    .from('troca_sessao')
    .select('*')
    .in('estado', [...ESTADOS_VIVOS])
    .gt('expira_em', new Date().toISOString())
    .order('criada_em', { ascending: false })
    .limit(1)
  aoFalhar(error)
  const linhas = (data ?? []) as LinhaDeTroca[]
  return linhas.length > 0 ? daLinha(linhas[0]) : null
}
