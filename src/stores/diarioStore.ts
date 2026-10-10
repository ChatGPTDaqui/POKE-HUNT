// Estado do Diário (metas do dia e login do mês), lido de `abrir_dia()`.
//
// Store próprio, fora do `GameStateData`, pelo mesmo motivo do `passosStore`:
// o estado do jogador viaja inteiro no flush da caçada e apagaria uma lista que
// o servidor de sessão não conhece.
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

interface RespostaDoDia {
  dia: string
  abatesBase: number
  coletados: string[]
  loginsNoMes: number
}

interface DiarioState {
  carregado: boolean
  dia: string | null
  abatesBase: number
  coletados: ReadonlySet<string>
  loginsNoMes: number
  abrir: () => Promise<void>
  limpar: () => void
}

export const useDiarioStore = create<DiarioState>((set) => ({
  carregado: false,
  dia: null,
  abatesBase: 0,
  coletados: new Set(),
  loginsNoMes: 0,

  abrir: async () => {
    const { data, error } = await supabase.rpc('abrir_dia')
    // Falha não marca carregado: sem a base do servidor, a HUD não mostra meta.
    if (error || !data) return console.error('diario: abrir_dia falhou', error)
    const r = data as unknown as RespostaDoDia
    set({ carregado: true, dia: r.dia, abatesBase: Number(r.abatesBase), coletados: new Set(r.coletados), loginsNoMes: r.loginsNoMes })
  },

  limpar: () => set({ carregado: false, dia: null, abatesBase: 0, coletados: new Set(), loginsNoMes: 0 }),
}))
