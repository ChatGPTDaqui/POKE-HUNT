// O hook React da fila de celebracao (PH-192).
//
// Mesma divisao de `toastStore.ts`: a declaracao mora em
// `celebracaoStoreVanilla.ts` porque `engine/simulation.ts` empurra ali e vai
// pro bundle da Edge. Aqui so se acrescenta o `useStore`.
//
// Seletor OBRIGATORIO, como no toast — ver a nota longa em `toastStore.ts`
// sobre por que a sobrecarga sem seletor foi descartada (o `Object.assign`
// colapsa as assinaturas e os call sites COM seletor caem em `any`).
import { useStore } from 'zustand'

import { celebracaoStore } from './celebracaoStoreVanilla'

export * from './celebracaoStoreVanilla'

export const useCelebracaoStore = Object.assign(
  <T,>(selector: (estado: ReturnType<typeof celebracaoStore.getState>) => T): T =>
    useStore(celebracaoStore, selector),
  celebracaoStore,
)
