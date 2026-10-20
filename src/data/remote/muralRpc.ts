// Mural de contratos e ovos (20/10/2026): chamadas as RPCs e a store da tela.
// Quem sorteia, valida e grava e o banco (`mural_de_contratos`,
// `refresh_mural`, `reivindicar_contrato`, `mover_ovo`, `chocar_ovo`); aqui so
// chama e sincroniza o que mudou.
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useMochilaStore } from '@/stores/mochilaStore'
import type { Contrato, Mural, RaridadeDoOvo } from '@/data/ovos'
import type { RarityKey } from '@/data/rarity'
import { ErroServidor } from './servidor'
import { COLUNAS_DE_OVO, rowToOvo, type OvoRow } from './playerMapper'
import { refetchEquipeInteira } from './acoesRpc'

const db = supabase as unknown as {
  from: (tabela: string) => any
  rpc: (nome: string, params?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>
  auth: typeof supabase.auth
}

async function chamar<T>(nome: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(nome, params)
  if (error) throw new ErroServidor(409, error.message)
  return data as T
}

interface MuralBruto {
  dia: string
  refreshes: number
  contratos: Array<Omit<Contrato, 'base'> & { base: number | string }>
}

function lerMural(bruto: MuralBruto): Mural {
  return {
    dia: bruto.dia,
    refreshes: Number(bruto.refreshes) || 0,
    contratos: (bruto.contratos ?? []).map((c) => ({
      slot: Number(c.slot),
      speciesId: c.speciesId,
      baseId: c.baseId,
      raridade: c.raridade as RaridadeDoOvo,
      tipo: c.tipo,
      alvo: Number(c.alvo),
      base: Number(c.base),
      reivindicado: Boolean(c.reivindicado),
    })),
  }
}

export async function refetchOvos(): Promise<void> {
  const { data: sessao } = await supabase.auth.getSession()
  const uid = sessao.session?.user.id
  if (!uid) return
  const { data, error } = await db.from('player_ovos').select(COLUNAS_DE_OVO).eq('user_id', uid)
  if (error) return
  useGameStateStore.setState({ ovos: ((data ?? []) as OvoRow[]).map(rowToOvo) })
}

export interface Nascimento {
  pokeId: string
  speciesId: string
  rarity: RarityKey
  isShiny: boolean
  local: 'team' | 'bag'
}

interface MuralState {
  mural: Mural | null
  carregando: boolean
  erro: string | null
  carregar: () => Promise<void>
  refresh: () => Promise<void>
  reivindicar: (slot: number) => Promise<string>
}

export const useMuralStore = create<MuralState>((set, get) => ({
  mural: null,
  carregando: false,
  erro: null,
  carregar: async () => {
    if (get().carregando) return
    set({ carregando: true, erro: null })
    try {
      set({ mural: lerMural(await chamar<MuralBruto>('mural_de_contratos')) })
    } catch (e) {
      set({ erro: e instanceof Error ? e.message : String(e) })
    } finally {
      set({ carregando: false })
    }
  },
  refresh: async () => {
    const mural = lerMural(await chamar<MuralBruto>('refresh_mural'))
    set({ mural })
    const { data } = await db.from('players').select('diamonds').maybeSingle()
    if (data) useGameStateStore.setState((s) => ({ wallet: { ...s.wallet, diamonds: Number(data.diamonds) } }))
  },
  reivindicar: async (slot) => {
    const r = await chamar<{ mensagem?: string }>('reivindicar_contrato', { p_slot: slot })
    set((s) => s.mural ? {
      mural: { ...s.mural, contratos: s.mural.contratos.map((c) => (c.slot === slot ? { ...c, reivindicado: true } : c)) },
    } : s)
    await refetchOvos()
    return r?.mensagem ?? 'Você ganhou um ovo!'
  },
}))

export async function moverOvo(ovoId: string, paraEquipe: boolean): Promise<string> {
  const r = await chamar<{ mensagem?: string }>('mover_ovo', { p_ovo: ovoId, p_para_equipe: paraEquipe })
  useGameStateStore.setState((s) => ({ ovos: s.ovos.map((o) => (o.id === ovoId ? { ...o, naEquipe: paraEquipe } : o)) }))
  return r?.mensagem ?? ''
}

export async function chocarOvo(ovoId: string): Promise<Nascimento> {
  const r = await chamar<Nascimento>('chocar_ovo', { p_ovo: ovoId })
  useGameStateStore.setState((s) => ({ ovos: s.ovos.filter((o) => o.id !== ovoId) }))
  // O POKE novo nasce na equipe (se o ovo estava la) ou na Mochila.
  if (r.local === 'team') await refetchEquipeInteira()
  else useMochilaStore.getState().invalidar()
  return r
}
