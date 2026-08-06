// Substitui o `showPokeProfileModal(poke, species)` global de
// js/ui/panels/PokeProfileModal.js — no vanilla qualquer painel importava
// essa funcao e ela anexava um node direto no <body>. Em React o modal e um
// componente montado uma vez na arvore; quem quer abri-lo so escreve aqui.
//
// Contrato compartilhado com o componente PokeProfileModal (construido em
// paralelo): exatamente estes 3 campos.
import { create } from 'zustand'
import type { PokeInstance, Species } from '@/data/pokes'

export interface PokeProfileTarget {
  poke: PokeInstance
  species: Species
}

interface PokeProfileState {
  open: PokeProfileTarget | null
  showProfile: (poke: PokeInstance, species: Species) => void
  close: () => void
}

export const usePokeProfileStore = create<PokeProfileState>((set) => ({
  open: null,
  showProfile: (poke, species) => set({ open: { poke, species } }),
  close: () => set({ open: null }),
}))
