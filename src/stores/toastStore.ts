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
//
// ---------------------------------------------------------------------------
// UMA DIFERENCA DELIBERADA EM RELACAO AO `create` DO ZUSTAND
// ---------------------------------------------------------------------------
// Aqui o SELETOR E OBRIGATORIO. O hook do zustand aceita ser chamado sem
// argumento e devolve o estado inteiro; este nao.
//
// Tentei reproduzir e o custo nao pagou: com sobrecarga, `Object.assign`
// COLAPSA as assinaturas — o TypeScript escolhe uma so, e os call sites COM
// seletor perdem o tipo de retorno virando `any`. Isso nao da erro aqui, da
// adiante em quem consome (`ChatLog.tsx` passou a acusar `line` implicitamente
// `any`). Trocar tipagem real por paridade num caso que nenhum dos 19 call
// sites usa seria mau negocio.
//
// Fica DECLARADO em vez de escondido: chamar sem seletor e erro de compilacao,
// com esta nota a um clique. Uma substituicao que QUASE reproduz o original e
// pior que uma que diz onde difere.
//
// Detalhe que custou uma rodada: o parametro tem que ser
// `ReturnType<typeof toastStore.getState>`, e nao `ToastState` importado —
// com o import nomeado a inferencia se perde e os call sites caem em `any` de
// novo, em silencio.
import { useStore } from 'zustand'

import { toastStore } from './toastStoreVanilla'

export * from './toastStoreVanilla'

export const useToastStore = Object.assign(
  <T,>(selector: (estado: ReturnType<typeof toastStore.getState>) => T): T => useStore(toastStore, selector),
  toastStore,
)
