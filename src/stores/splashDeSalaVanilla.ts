// O aviso de CHEGADA numa sala nova (PH-395) — a declaracao, sem React.
//
// SEPARADO DO HOOK pelo mesmo motivo de `celebracaoStoreVanilla.ts` e
// `toastStoreVanilla.ts`: quem empurra aqui e `engine/simulation.ts`, que vai
// pro bundle da Edge Function. Importar um store criado com o `create` de
// `zustand/react` puxaria o React inteiro pra dentro de um servidor que nao
// renderiza nada.
//
// SUBSTITUI UM TOAST. A troca de sala tinha tres avisos e o mais fraco era
// justamente o que dizia o NOME do lugar:
//
//   1. quota fechada        -> o chip diz "Preparando a proxima area..." (PH-386)
//   2. sala do servidor      -> `SalaCountdownModal`, "Entrando em nova area" + 3-2-1
//                               (e ele NAO diz qual area)
//   3. transicao aplicada    -> um toast de canto: "Entrando em nova area: Relvado."
//
// O nome do sub-bioma competia com "Item encontrado: Potion" no mesmo canto, com
// a mesma duracao. Agora ele tem o proprio espaco.
//
// UM SO POR VEZ, SEM FILA. Troca de sala e evento de minutos — nao existe o caso
// de dois splashes disputarem a tela, e uma fila aqui seria mecanismo sem
// demanda. Se um segundo chegar (transicao dupla por reconciliacao), ele
// SUBSTITUI: o jogador esta na sala nova, e mostrar a anterior seria mentira.
import { createStore } from 'zustand/vanilla'
import type { SalaAtiva } from '@/engine/types'

export interface SplashDeSala {
  /**
   * Identidade propria, pelo mesmo motivo de `CelebracaoNaFila#id`: sem `key`
   * nova o React reusa o node do DOM, a animacao CSS nao reinicia e o segundo
   * aviso entra no meio do fade do primeiro.
   */
  id: number
  sala: SalaAtiva
  /** A sala nova e a primeira do ciclo seguinte — texto proprio, como no toast. */
  fechouEstagio: boolean
}

export interface SplashDeSalaState {
  atual: SplashDeSala | null
  /** Chamado pelo motor, do tick em que `aplicarTransicaoDeSala` roda. */
  anunciarSala: (sala: SalaAtiva, fechouEstagio: boolean) => void
  /** Chamado pelo componente quando os 4 segundos acabam. */
  encerrar: (id: number) => void
  limpar: () => void
}

let proximoId = 1

export const splashDeSalaStore = createStore<SplashDeSalaState>()((set) => ({
  atual: null,

  anunciarSala: (sala, fechouEstagio) =>
    set({ atual: { id: proximoId++, sala: { ...sala }, fechouEstagio } }),

  // POR ID, e nao um `encerrar()` seco: o temporizador do aviso ANTERIOR pode
  // disparar depois de um aviso novo ter entrado (troca de sala rapida), e um
  // encerramento cego apagaria o aviso que acabou de aparecer.
  encerrar: (id) => set((estado) => (estado.atual?.id === id ? { atual: null } : estado)),

  limpar: () => set({ atual: null }),
}))
