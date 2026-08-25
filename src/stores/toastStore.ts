// O hook React do store de avisos.
//
// A declaracao mora em `toastStoreVanilla.ts` — ver a nota longa la pro
// porque. Aqui so se acrescenta o `useStore`, que e a unica parte que precisa
// do React.
//
// `Object.assign(hook, store)` e exatamente o que `create` do zustand faz por
// dentro (`createImpl` em zustand/esm/react.mjs): a funcao devolvida tambem
// carrega `getState`/`setState`/`subscribe`. Por isso os ~19 call sites de
// `useToastStore` — tanto os que chamam como hook quanto os que fazem
// `.getState()` — continuam identicos.
import { useStore } from 'zustand'

import { toastStore } from './toastStoreVanilla'

export * from './toastStoreVanilla'

export const useToastStore = Object.assign(
  <T,>(selector: (estado: ReturnType<typeof toastStore.getState>) => T): T => useStore(toastStore, selector),
  toastStore,
)
