// Vinheta do chefe da sala (21/10/2026, pedido do dono): quando o 29o comum
// cai, o Guardian/Lord nasce num ponto aleatorio e uma vinheta curta o
// anuncia. Store vanilla porque quem dispara e o motor (simulation.ts), que
// tambem roda no servidor — la ninguem assina, e o set e inofensivo.
import { createStore } from 'zustand/vanilla'
import type { TipoDeProtetor } from '@/engine/systems/salaSystem'

export interface AnuncioDoChefe {
  id: number
  tipo: TipoDeProtetor
  speciesId: string
  isShiny: boolean
}

export interface AnuncioDoChefeState {
  atual: AnuncioDoChefe | null
  anunciar: (tipo: TipoDeProtetor, speciesId: string, isShiny: boolean) => void
  encerrar: (id: number) => void
}

let proximoId = 1

export const anuncioDoChefeStore = createStore<AnuncioDoChefeState>()((set) => ({
  atual: null,
  anunciar: (tipo, speciesId, isShiny) => set({ atual: { id: proximoId++, tipo, speciesId, isShiny } }),
  encerrar: (id) => set((s) => (s.atual?.id === id ? { atual: null } : s)),
}))
