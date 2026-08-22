// Substitui o `showPokeProfileModal(poke, species)` global de
// js/ui/panels/PokeProfileModal.js — no vanilla qualquer painel importava
// essa funcao e ela anexava um node direto no <body>. Em React o modal e um
// componente montado uma vez na arvore; quem quer abri-lo so escreve aqui.
//
// Contrato compartilhado com o componente PokeProfileModal (construido em
// paralelo): exatamente estes 3 campos.
import { create } from 'zustand'
import type { PokeInstance, Species } from '@/data/pokes'

/**
 * As abas do perfil. Mora aqui, e nao no componente, porque quem ABRE o perfil
 * as vezes sabe pra onde quer ir: a Equipe tem um botao que vai direto pros
 * golpes, e sem isso o unico caminho ate a gestao dos 4 slots era clicar no
 * POKE e depois descobrir a aba.
 */
export type AbaDoPerfil = 'status' | 'golpes'

export interface PokeProfileTarget {
  poke: PokeInstance
  species: Species
  /** Aba em que o perfil abre. Ausente = Status, o padrao de sempre. */
  aba?: AbaDoPerfil
}

interface PokeProfileState {
  open: PokeProfileTarget | null
  showProfile: (poke: PokeInstance, species: Species, aba?: AbaDoPerfil) => void
  close: () => void
}

export const usePokeProfileStore = create<PokeProfileState>((set) => ({
  open: null,
  showProfile: (poke, species, aba) => set({ open: { poke, species, aba } }),
  close: () => set({ open: null }),
}))
