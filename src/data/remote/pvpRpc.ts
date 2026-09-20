import { schema, supabase } from '@/lib/supabase'
import type { PokeInstance } from '@/data/pokes'
import { pvpRowToPoke, type LinhaTimePvp } from '@/engine/pokeDoSnapshotDePvp'

const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
}

export type EstadoPvp = 'convidada' | 'aberta' | 'concluida' | 'cancelada' | 'expirada'
// `ranqueado_bot` (PH-539/565): pareado com bot por falta de defensor humano
// na faixa de MMR; sem MMR/PDL, mas consome o limite diario.
export type ModoPvp = 'amistoso' | 'ranqueado' | 'ranqueado_bot'

export interface SessaoPvp {
  id: string
  anfitriaoId: string
  convidadoId: string
  estado: EstadoPvp
  modo: ModoPvp
  criadaEm: string
  expiraEm: string
  encerradaPor: string | null
  encerradaEm: string | null
  vencedorId: string | null
  anfitriaoPoke: PokeInstance | null
  convidadoPoke: PokeInstance | null
  /** Snapshots dos times (PH-529) como POKEs pela regra do servidor — e o que a arena luta. */
  anfitriaoTime: PokeInstance[]
  convidadoTime: PokeInstance[]
}

export interface HistoricoPvp {
  id: string
  sessaoId: string
  anfitriaoId: string
  convidadoId: string
  vencedorId: string | null
  encerradaEm: string
  modo: ModoPvp
  pdlDeltaAnfitriao: number | null
  pdlDeltaConvidado: number | null
}

interface LinhaPvp {
  id: string
  anfitriao_id: string
  convidado_id: string
  estado: EstadoPvp
  modo?: ModoPvp
  criada_em: string
  expira_em: string
  encerrada_por: string | null
  encerrada_em: string | null
  vencedor_id: string | null
  anfitriao_poke: PokeInstance | null
  convidado_poke: PokeInstance | null
  anfitriao_time?: LinhaTimePvp[] | null
  convidado_time?: LinhaTimePvp[] | null
}

// Mesmo mapeador do servidor (PH-540): o POKE que a arena luta aqui e
// byte a byte o que o servidor resolveu.
function timeDoSnapshot(linhas: LinhaTimePvp[] | null | undefined): PokeInstance[] {
  return (linhas ?? []).map(pvpRowToPoke).filter((p): p is PokeInstance => p != null)
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
    modo: l.modo ?? 'amistoso',
    criadaEm: l.criada_em,
    expiraEm: l.expira_em,
    encerradaPor: l.encerrada_por,
    encerradaEm: l.encerrada_em,
    vencedorId: l.vencedor_id,
    anfitriaoPoke: l.anfitriao_poke,
    convidadoPoke: l.convidado_poke,
    anfitriaoTime: timeDoSnapshot(l.anfitriao_time),
    convidadoTime: timeDoSnapshot(l.convidado_time),
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

export async function nomeDoTreinador(userId: string): Promise<string | null> {
  const { data, error } = await db.from('treinadores_publico')
    .select('trainer_name')
    .eq('user_id', userId)
    .maybeSingle()
  falhou(error)
  return data?.trainer_name ?? null
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

// Amistoso com time completo (PH-531): anfitriao convida com o proprio time
// de PvP salvo (aba Build); convidado aceita com o array explicito que
// escolheu no client (time atual de aventura ou o salvo de PvP).
export async function abrirPvpTime(convidadoId: string): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('abrir_pvp_time', { p_convidado_id: convidadoId })
  falhou(error)
  return daLinha(data as LinhaPvp)
}

export async function aceitarPvpTime(sessaoId: string, pokemonIds: string[]): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('aceitar_pvp_time', { p_sessao_id: sessaoId, p_pokemon_ids: pokemonIds })
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

// PH-565: sessao ranqueada em que sou o CONVIDADO e a defesa salva sendo
// atacada — nao e um duelo meu pra entrar; o atacante resolve sozinho.
export async function meuPvpVivo(meuId: string): Promise<SessaoPvp | null> {
  const { data, error } = await db.from('pvp_sessao')
    .select('*')
    .in('estado', ['convidada', 'aberta'])
    .gt('expira_em', new Date().toISOString())
    .or(`anfitriao_id.eq.${meuId},modo.eq.amistoso`)
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
    modo: (l.modo ?? 'amistoso') as ModoPvp,
    pdlDeltaAnfitriao: l.pdl_delta_anfitriao ?? null,
    pdlDeltaConvidado: l.pdl_delta_convidado ?? null,
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

// --- time e rank do PvP ranqueado (PH-529/PH-530) --------------------------

export interface RankPvp {
  mmr: number
  partidas: number
  pdl: number
  divisao: string
  vitorias: number
  derrotas: number
  partidasHoje: number
  resetEm: string
}

// --- presets de time (PH-563): 3 de ataque + 3 de defesa, 1 ativo por tipo ---

export type TipoPresetPvp = 'ataque' | 'defesa'

export interface SlotPresetPvp {
  pokemonId: string
  /** Vazio = usa os golpes ativos do POKE. */
  golpes: string[]
}

export interface PresetPvp {
  tipo: TipoPresetPvp
  posicao: number
  nome: string
  slots: SlotPresetPvp[]
  ativo: boolean
  atualizadoEm: string
}

interface LinhaPreset {
  tipo: TipoPresetPvp
  posicao: number
  nome: string
  slots: { pokemon_id: string; golpes?: string[] | null }[] | null
  ativo: boolean
  atualizado_em: string
}

function presetDaLinha(l: LinhaPreset): PresetPvp {
  return {
    tipo: l.tipo,
    posicao: l.posicao,
    nome: l.nome ?? '',
    slots: (l.slots ?? []).map((s) => ({ pokemonId: s.pokemon_id, golpes: s.golpes ?? [] })),
    ativo: l.ativo,
    atualizadoEm: l.atualizado_em,
  }
}

export async function meusPresetsPvp(): Promise<PresetPvp[]> {
  const { data, error } = await db.rpc('meus_presets_pvp', {})
  falhou(error)
  return ((data ?? []) as LinhaPreset[]).map(presetDaLinha)
}

export async function salvarPresetPvp(preset: Pick<PresetPvp, 'tipo' | 'posicao' | 'nome' | 'slots'>): Promise<PresetPvp> {
  const { data, error } = await db.rpc('salvar_preset_pvp', {
    p_tipo: preset.tipo,
    p_posicao: preset.posicao,
    p_nome: preset.nome,
    p_slots: preset.slots.map((s) => ({ pokemon_id: s.pokemonId, golpes: s.golpes })),
  })
  falhou(error)
  return presetDaLinha(data as LinhaPreset)
}

export async function ativarPresetPvp(tipo: TipoPresetPvp, posicao: number): Promise<PresetPvp> {
  const { data, error } = await db.rpc('ativar_preset_pvp', { p_tipo: tipo, p_posicao: posicao })
  falhou(error)
  return presetDaLinha(data as LinhaPreset)
}

export async function meuRankPvp(): Promise<RankPvp> {
  const { data, error } = await db.rpc('meu_rank_pvp', {})
  falhou(error)
  return {
    mmr: data.mmr,
    partidas: data.partidas,
    pdl: data.pdl,
    divisao: data.divisao,
    vitorias: data.vitorias,
    derrotas: data.derrotas,
    partidasHoje: data.partidas_hoje,
    resetEm: data.reset_em,
  }
}

// PH-565: ranqueado assincrono — pareia na hora com a defesa salva de um
// jogador de MMR proximo (ou bot) e devolve a sessao ja 'aberta'.
export async function atacarRanqueado(): Promise<SessaoPvp> {
  const { data, error } = await db.rpc('atacar_ranqueado', {})
  falhou(error)
  return daLinha(data as LinhaPvp)
}
