// O hook React do aviso de chegada em sala nova (PH-395).
//
// Mesma divisao de `celebracaoStore.ts`: a declaracao mora em
// `splashDeSalaVanilla.ts` porque `engine/simulation.ts` empurra ali e vai pro
// bundle da Edge. Aqui so se acrescenta o `useStore`.
//
// Seletor OBRIGATORIO, como no toast e na celebracao — ver a nota longa em
// `toastStore.ts` sobre por que a sobrecarga sem seletor foi descartada.
import { useStore } from 'zustand'

import { splashDeSalaStore } from './splashDeSalaVanilla'

export * from './splashDeSalaVanilla'

export const useSplashDeSalaStore = Object.assign(
  <T,>(selector: (estado: ReturnType<typeof splashDeSalaStore.getState>) => T): T =>
    useStore(splashDeSalaStore, selector),
  splashDeSalaStore,
)
