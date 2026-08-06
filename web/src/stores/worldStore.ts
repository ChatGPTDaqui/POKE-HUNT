// Arvore de estado EFEMERA de combate — porta o `currentWorld`/`world` de
// main.js. Nunca persistida (reconstruida do zero a cada troca de cena, ver
// buildHospitalWorld/buildMapWorld no original). Separada de
// gameStateStore.ts (persistente) de proposito — vidas/frequencias de
// update bem diferentes (world muda a 60/s, gameState muda em eventos
// discretos do jogador/economia).
//
// Fase 3 do plano: so a FORMA do estado + o mecanismo de update via immer.
// As funcoes de sistema (movimento/combate/auto/captura) que de fato mutam
// isso todo tick sao Fase 4 (engine/systems/*.ts) — elas vao chamar
// `useWorldStore.getState().update(draft => { ... })` (ou uma acao mais
// especifica que eu adicionar la) pra escrever no draft imer com a mesma
// ergonomia de mutacao direta que o codigo vanilla ja tinha
// (`draft.enemies[i].x = novoX`), so que produzindo estado imutavel por
// baixo.
//
// O desenho no canvas (Fase 5) le `useWorldStore.getState()` direto dentro
// do proprio loop de rAF do componente <GameCanvas> — NAO via hook/selector
// — pra nao disparar re-render do React 60x/s so pra redesenhar pixel (ver
// "Decisao de implementacao: estado do motor" no plano). Componentes de UI
// que precisam saber de um campo especifico (ex: HP do poke ativo pro HUD)
// usam selector normal (`useWorldStore(s => s.player?.poke.hp)`) e so
// re-renderizam quando aquele campo muda de verdade.
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { WorldState } from '@/engine/types'

export function emptyWorldState(): WorldState {
  return {
    mapDef: null,
    player: null,
    enemies: [],
    effects: [],
    pendingHits: [],
    autoTimers: { pot: 0, revive: 0 },
    reviveCountdown: null,
    respawnTimer: null,
    sequenceIndex: 0,
    sequenceCleared: false,
    countdownRemaining: null,
  }
}

export interface WorldStore extends WorldState {
  // Troca o mundo inteiro (equivalente a `currentWorld = buildXWorld()` no
  // original) — usado nas transicoes de cena (Hospital <-> hunt).
  setWorld: (world: WorldState) => void
  resetWorld: () => void
  // Escotilha generica pros sistemas da Fase 4 mutarem o draft imer direto,
  // com a mesma ergonomia de mutacao em lugar que o codigo vanilla ja tinha.
  update: (recipe: (draft: WorldState) => void) => void
}

export const useWorldStore = create<WorldStore>()(
  immer((set) => ({
    ...emptyWorldState(),

    setWorld: (world) =>
      set((draft) => {
        Object.assign(draft, world)
      }),

    resetWorld: () =>
      set((draft) => {
        Object.assign(draft, emptyWorldState())
      }),

    update: (recipe) => set((draft) => recipe(draft)),
  })),
)
