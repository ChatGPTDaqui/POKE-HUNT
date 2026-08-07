// Substitui o `showLevelUpSplash()` global de js/ui/panels/levelUpSplash.js
// (anexava um node direto no <body> e se auto-removia em 2s). Em React o
// splash e um componente montado uma vez; quem quer dispara-lo escreve aqui.
import { create } from 'zustand'

interface LevelUpSplashState {
  visible: boolean
  show: () => void
  hide: () => void
}

export const useLevelUpSplashStore = create<LevelUpSplashState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}))
