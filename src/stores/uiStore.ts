// Substitui js/ui/UIManager.js's `currentScreen` (qual tela DOM em tela
// cheia esta aberta por cima do canvas). Decisao #5 do plano: sem React
// Router — o jogo nunca teve URL por tela, troca de tela e 100% estado
// local, entao vira so um campo de store em vez de rota.
//
// Hospital nao esta na lista: e uma cena do canvas (mapDef null), nao uma
// tela DOM — nunca passou pelo `PANEL_RENDERERS`/overlay original. Auto
// tambem fica fora: e um painel flutuante fora do sistema de overlay (ver
// CLAUDE.md "Auto vira botao compacto flutuante"), tera seu proprio estado
// de aberto/fechado quando for portado na Fase 6.
import { create } from 'zustand'

export type ScreenName = 'team' | 'bag' | 'hunt' | 'shop' | 'pokedex' | 'wiki' | 'settings'

interface UiState {
  currentScreen: ScreenName | null
  openScreen: (screen: ScreenName) => void
  closeScreen: () => void

  // Filtros da tela de Hunts. Ficam aqui (e nao em useState local do
  // HuntMenu) por um motivo unico e concreto: a Pokedex precisa escrever
  // neles ANTES de abrir a tela de Hunts (o "onde encontrar" -> pula pra
  // hunt ja filtrada), exatamente o que o `focusHunt(map)` module-level de
  // js/ui/panels/HuntMenu.js fazia. Estado que dois paineis escrevem nao
  // pode viver dentro de um deles.
  huntContinent: string
  huntSearchTerm: string
  huntType: string
  setHuntContinent: (continent: string) => void
  setHuntSearchTerm: (term: string) => void
  setHuntType: (type: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  currentScreen: null,
  openScreen: (screen) => set({ currentScreen: screen }),
  closeScreen: () => set({ currentScreen: null }),

  huntContinent: 'johto',
  huntSearchTerm: '',
  huntType: 'all',
  setHuntContinent: (huntContinent) => set({ huntContinent }),
  setHuntSearchTerm: (huntSearchTerm) => set({ huntSearchTerm }),
  setHuntType: (huntType) => set({ huntType }),
}))
