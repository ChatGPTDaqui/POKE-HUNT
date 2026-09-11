import { schema, supabase } from '@/lib/supabase'
import type { PokeInstance } from '@/data/pokes'

const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

export type EstadoPvp = 'convidada' | 'aberta' | 'concluida' | 'cancelada' | 'expirada'

export interface SessaoPvp {
  id: string
  anfitriaoId: string
  convidadoId: string
  estado: EstadoPvp
  criadaEm: string
  expiraEm: string
  encerradaPor: string | null
  encerradaEm: string | null
  vencedorId: string | null
  anfitriaoPoke: PokeInstance | null
  convidadoPoke: PokeInstance | null
}

export interface HistoricoPvp {
  id: string
  sessaoId: string
  anfitriaoId: string
  convidadoId: string
  vencedorId: string | null
  encerradaEm: string
}

interface LinhaPvp {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: EstadoPvp
  criada_em: string
  expira_em: string
  encerrada_por: string | null
  encerrada_em: string | null
  vencedor_id: string | null
  anfitriao_poke: PokeInstance | null
  convidado_poke: PokeInstance | null
}

function falhou(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

function daLinha(l: LinhaPvp): SessaoPvp {
  return {
    id: l.id,
    anfitriaoId: l.anfitriao_id,
    convidadoId: l.convidado_id,
    estado: l.estado,
    criadaEm: l.criada_em,
    expiraEm: l.expira_em,
    encerradaPor: l.encerrada_por,
    encerradaEm: l.encerrada_em,
    vencedorId: l.vencedor_id,
    anfitriaoPoke: l.anfitriao_poke,
    convidadoPoke: l.convidado_poke,
  }
}

export async function buscarTreinadorPorNick(nick: string): Promise<{ userId: string; nome: string } | null> {
  const { data, error } = await db.from('treinadores_publico')
    .select('user_id, trainer_name')
    .ilike('trainer_name', nick.trim())
    .limit(1)
    .maybeSingle()
  falhou(error)
  return data ? { userId: data.user_id, nome: data.trainer_name } : null
}

export async function abrirPvp(convidadoId: string, meuPoke: PokeInstance): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('abrir_pvp', {
    p_convidado_id: convidadoId,
    p_pokemon_id: meuPoke.uid,
    p_poke: meuPoke,
  })
  falhou(error)
  return daLinha(data as LinhaPvp)
}

export async function aceitarPvp(sessaoId: string, meuPoke: PokeInstance): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('aceitar_pvp', {
    p_sessao_id: sessaoId,
    p_pokemon_id: meuPoke.uid,
    p_poke: meuPoke,
  })
  falhou(error)
  return daLinha(data as LinhaPvp)
}

export async function encerrarPvp(sessaoId: string): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('encerrar_pvp', { p_sessao_id: sessaoId })
  falhou(error)
  return daLinha(data as LinhaPvp)
}

export async function registrarResultadoPvp(sessaoId: string, vencedorId: string | null): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('registrar_resultado_pvp', {
    p_sessao_id: sessaoId,
    p_vencedor_id: vencedorId,
  })
  falhou(error)
  return daLinha(data as LinhaPvp)
}

export async function meuPvpVivo(): Promise<SessaoPvp | null> {
  const { data, error } = await db.from('pvp_sessao')
    .select('*')
    .in('estado', ['convidada', 'aberta'])
    .gt('expira_em', new Date().toISOString())
    .order('criada_em', { ascending: false })
    .limit(1)
  falhou(error)
  const linhas = (data ?? []) as LinhaPvp[]
  return linhas[0] ? daLinha(linhas[0]) : null
}

export async function historicoPvp(limite = 20): Promise<HistoricoPvp[]> {
  const { data, error } = await db.from('pvp_historico')
    .select('*')
    .order('encerrada_em', { ascending: false })
    .limit(limite)
  falhou(error)
  return ((data ?? []) as any[]).map((l) => ({
    id: l.id,
    sessaoId: l.sessao_id,
    anfitriaoId: l.anfitriao_id,
    convidadoId: l.convidado_id,
    vencedorId: l.vencedor_id,
    encerradaEm: l.encerrada_em,
  }))
}

export function assinarMeuPvp(userId: string, aoMudar: () => void): () => void {
  const canal = supabase
    .channel(`pvp-${userId}`)
    .on('postgres_changes', { event: '*', schema, table: 'pvp_sessao' }, () => aoMudar())
    .on('postgres_changes', { event: '*', schema, table: 'pvp_historico' }, () => aoMudar())
    .subscribe()
  return () => { void supabase.removeChannel(canal) }
}
